/**
 * FarmBridge backend — plain Node.js (no npm dependencies required).
 * Run with: node server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const store = require("./data/store");

const PORT = process.env.PORT || 4000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(FRONTEND_DIR, filePath);

  // Prevent path traversal outside the frontend directory
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const requestHandler = async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    // ---- API routes ----
    if (pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok", service: "FarmBridge API" });
    }

    if (pathname === "/api/crops" && req.method === "GET") {
      return sendJson(res, 200, { crops: store.CROPS });
    }

    if (pathname === "/api/prices" && req.method === "GET") {
      const crop = query.crop;
      if (!crop || !store.CROPS.includes(crop)) {
        return sendJson(res, 400, { error: `crop must be one of: ${store.CROPS.join(", ")}` });
      }
      const mandiData = store.getMandiData(crop);
      const sorted = [...mandiData].sort((a, b) => b.latestPrice - a.latestPrice);
      return sendJson(res, 200, { crop, mandis: mandiData, bestMandi: sorted[0] || null });
    }

    if (pathname === "/api/forecast" && req.method === "GET") {
      const { crop, mandi, days } = query;
      if (!crop || !store.CROPS.includes(crop)) {
        return sendJson(res, 400, { error: `crop must be one of: ${store.CROPS.join(", ")}` });
      }
      const mandiData = store.getMandiData(crop);
      const target = mandi ? mandiData.find((m) => m.mandi === mandi) : mandiData[0];
      if (!target) return sendJson(res, 404, { error: "mandi not found for this crop" });
      const horizon = Math.min(Math.max(parseInt(days) || 10, 7), 15);
      const result = store.forecastPrices(target.history, horizon);
      return sendJson(res, 200, { crop, mandi: target.mandi, history: target.history, ...result });
    }

    if (pathname === "/api/listings" && req.method === "GET") {
      const listings = store.listings
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((l) => ({
          ...l,
          farmerRating: store.getRating(l.farmerId),
          highestBid: l.bids.length ? Math.max(...l.bids.map((b) => b.amount)) : null,
        }));
      return sendJson(res, 200, { listings });
    }

    if (pathname === "/api/listings" && req.method === "POST") {
      const body = await readBody(req);
      const { farmerId, farmerName, crop, quantityQuintal, askingPrice, location } = body;
      if (!farmerId || !farmerName || !crop || !quantityQuintal || !askingPrice) {
        return sendJson(res, 400, {
          error: "farmerId, farmerName, crop, quantityQuintal, askingPrice are required",
        });
      }
      const listing = {
        id: store.nextListingId,
        farmerId,
        farmerName,
        crop,
        quantityQuintal: Number(quantityQuintal),
        askingPrice: Number(askingPrice),
        location: location || "Not specified",
        status: "open",
        createdAt: new Date().toISOString(),
        bids: [],
      };
      store.listings.push(listing);
      return sendJson(res, 201, { listing });
    }

    // /api/listings/:id/bids
    const bidMatch = pathname.match(/^\/api\/listings\/(\d+)\/bids$/);
    if (bidMatch && req.method === "POST") {
      const listing = store.listings.find((l) => l.id === Number(bidMatch[1]));
      if (!listing) return sendJson(res, 404, { error: "listing not found" });
      if (listing.status !== "open") return sendJson(res, 400, { error: "listing is closed" });

      const body = await readBody(req);
      const { buyerId, buyerName, amount, message } = body;
      if (!buyerId || !buyerName || !amount) {
        return sendJson(res, 400, { error: "buyerId, buyerName, amount are required" });
      }
      const bid = {
        id: store.nextBidId,
        buyerId,
        buyerName,
        amount: Number(amount),
        message: message || "",
        createdAt: new Date().toISOString(),
      };
      listing.bids.push(bid);
      return sendJson(res, 201, { bid });
    }

    // /api/listings/:id/close
    const closeMatch = pathname.match(/^\/api\/listings\/(\d+)\/close$/);
    if (closeMatch && req.method === "POST") {
      const listing = store.listings.find((l) => l.id === Number(closeMatch[1]));
      if (!listing) return sendJson(res, 404, { error: "listing not found" });
      if (listing.status !== "open") return sendJson(res, 400, { error: "listing already closed" });

      const body = await readBody(req);
      const { bidId, farmerRatingOfBuyer, buyerRatingOfFarmer } = body;
      const winningBid = listing.bids.find((b) => b.id === Number(bidId));
      if (!winningBid) return sendJson(res, 404, { error: "bid not found on this listing" });

      listing.status = "closed";
      listing.winningBidId = winningBid.id;
      listing.closedAt = new Date().toISOString();
      if (farmerRatingOfBuyer) store.addRating(winningBid.buyerId, Number(farmerRatingOfBuyer));
      if (buyerRatingOfFarmer) store.addRating(listing.farmerId, Number(buyerRatingOfFarmer));

      return sendJson(res, 200, { listing });
    }

    // ---- Static frontend ----
    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Unknown API route" });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
};

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`FarmBridge server running at http://localhost:${PORT}`);
  });
}

module.exports = requestHandler;
