/**
 * In-memory "database" for the FarmBridge prototype.
 * In production this would be replaced by Postgres/Mongo + a real
 * Agmarknet/eNAM API integration.
 */

const CROPS = ["Tomato", "Onion", "Wheat", "Cotton", "Arecanut", "Cumin"];

const MANDIS = {
  Tomato: [
    { mandi: "Pune APMC", state: "Maharashtra", base: 1800 },
    { mandi: "Nashik APMC", state: "Maharashtra", base: 1650 },
    { mandi: "Bengaluru KR Market", state: "Karnataka", base: 2000 },
  ],
  Onion: [
    { mandi: "Lasalgaon APMC", state: "Maharashtra", base: 1400 },
    { mandi: "Pimpalgaon APMC", state: "Maharashtra", base: 1300 },
    { mandi: "Solapur APMC", state: "Maharashtra", base: 1250 },
  ],
  Wheat: [
    { mandi: "Indore Mandi", state: "Madhya Pradesh", base: 2250 },
    { mandi: "Karnal Mandi", state: "Haryana", base: 2300 },
    { mandi: "Ludhiana Mandi", state: "Punjab", base: 2280 },
  ],
  Cotton: [
    { mandi: "Akola APMC", state: "Maharashtra", base: 6800 },
    { mandi: "Guntur APMC", state: "Andhra Pradesh", base: 7000 },
  ],
  Arecanut: [
    { mandi: "Sirsi Mandi", state: "Karnataka", base: 38000 },
    { mandi: "Kozhikode Mandi", state: "Kerala", base: 37500 },
  ],
  Cumin: [
    { mandi: "Unjha Mandi", state: "Gujarat", base: 24000 },
  ],
};

// Deterministic pseudo-random so demo numbers are stable across a session
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Generate a 30-day mock price history (₹/quintal) with mild trend + noise. */
function priceHistory(cropName, mandiIndex, base) {
  const days = 30;
  const history = [];
  const trendDirection = seededRandom(mandiIndex + cropName.length) > 0.5 ? 1 : -1;
  const trendStrength = base * 0.002; // ~0.2% drift per day
  let price = base;
  for (let i = days; i >= 0; i--) {
    const noise = (seededRandom(i * 7.13 + mandiIndex) - 0.5) * base * 0.03;
    price = base + trendDirection * trendStrength * (days - i) + noise;
    const date = new Date();
    date.setDate(date.getDate() - i);
    history.push({
      date: date.toISOString().slice(0, 10),
      price: Math.round(price),
    });
  }
  return history;
}

/** Simple linear regression forecast, 7-15 day horizon. */
function forecastPrices(history, horizonDays = 10) {
  const n = history.length;
  const xs = history.map((_, i) => i);
  const ys = history.map((h) => h.price);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  const forecast = [];
  for (let d = 1; d <= horizonDays; d++) {
    const x = n - 1 + d;
    const date = new Date();
    date.setDate(date.getDate() + d);
    forecast.push({
      date: date.toISOString().slice(0, 10),
      predictedPrice: Math.round(intercept + slope * x),
    });
  }

  const trend = slope > 2 ? "rising" : slope < -2 ? "falling" : "stable";
  const recommendation =
    trend === "rising"
      ? "Prices are trending up — consider holding produce for a few days if storage allows."
      : trend === "falling"
      ? "Prices are trending down — selling soon may avoid further loss."
      : "Prices are stable — selling now at current mandi rates is reasonable.";

  return { slope: Math.round(slope * 100) / 100, trend, recommendation, forecast };
}

function getMandiData(cropName) {
  const mandis = MANDIS[cropName] || [];
  return mandis.map((m, idx) => {
    const history = priceHistory(cropName, idx, m.base);
    const latest = history[history.length - 1].price;
    return { ...m, history, latestPrice: latest };
  });
}

// ---- Marketplace listings & bids (in-memory) ----
let listings = [];
let listingIdCounter = 1;
let bidIdCounter = 1;

// ---- Trust ratings ----
let ratings = {}; // userId -> { total, count }

function addRating(userId, score) {
  if (!ratings[userId]) ratings[userId] = { total: 0, count: 0 };
  ratings[userId].total += score;
  ratings[userId].count += 1;
}

function getRating(userId) {
  const r = ratings[userId];
  if (!r || r.count === 0) return { average: null, count: 0 };
  return { average: Math.round((r.total / r.count) * 10) / 10, count: r.count };
}

module.exports = {
  CROPS,
  MANDIS,
  getMandiData,
  forecastPrices,
  listings,
  get nextListingId() {
    return listingIdCounter++;
  },
  get nextBidId() {
    return bidIdCounter++;
  },
  addRating,
  getRating,
};
