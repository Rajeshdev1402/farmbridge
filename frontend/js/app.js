const API = ""; // same-origin

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "marketplace") loadListings();
  });
});

// ---------- Load crops into dropdowns ----------
async function loadCrops() {
  const res = await fetch(`${API}/api/crops`);
  const data = await res.json();
  const opts = data.crops.map((c) => `<option value="${c}">${c}</option>`).join("");
  document.getElementById("cropSelect").innerHTML = opts;
  document.getElementById("listingCrop").innerHTML = opts;
}

// ---------- Price + forecast ----------
document.getElementById("checkPricesBtn").addEventListener("click", async () => {
  const crop = document.getElementById("cropSelect").value;
  const resultsEl = document.getElementById("priceResults");
  resultsEl.innerHTML = "Loading...";

  const priceRes = await fetch(`${API}/api/prices?crop=${encodeURIComponent(crop)}`);
  const priceData = await priceRes.json();
  if (!priceRes.ok) {
    resultsEl.innerHTML = `<p class="msg error">${priceData.error}</p>`;
    return;
  }

  const best = priceData.bestMandi;
  const forecastRes = await fetch(
    `${API}/api/forecast?crop=${encodeURIComponent(crop)}&mandi=${encodeURIComponent(best.mandi)}&days=10`
  );
  const forecastData = await forecastRes.json();

  const rows = priceData.mandis
    .sort((a, b) => b.latestPrice - a.latestPrice)
    .map(
      (m) =>
        `<tr><td>${m.mandi}</td><td>${m.state}</td><td>₹${m.latestPrice.toLocaleString("en-IN")}</td></tr>`
    )
    .join("");

  const trendClass = `trend-${forecastData.trend}`;
  const next3 = forecastData.forecast
    .slice(0, 3)
    .map((f) => `${f.date}: ₹${f.predictedPrice.toLocaleString("en-IN")}`)
    .join(" · ");

  resultsEl.innerHTML = `
    <div class="best-mandi">
      🏆 <strong>Best mandi right now: ${best.mandi} (${best.state})</strong> — ₹${best.latestPrice.toLocaleString("en-IN")}/quintal
    </div>
    <table>
      <thead><tr><th>Mandi</th><th>State</th><th>Live Price (₹/quintal)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="forecast-box">
      <p><strong>AI Price Forecast (${best.mandi})</strong> — trend: <span class="${trendClass}">${forecastData.trend.toUpperCase()}</span></p>
      <p>${forecastData.recommendation}</p>
      <p style="font-size:0.85rem;color:#666">Next few days: ${next3}</p>
    </div>
  `;
});

// ---------- Farmer lists produce ----------
document.getElementById("listingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById("listingMsg");
  const body = {
    farmerId: "farmer-" + document.getElementById("farmerName").value.trim().toLowerCase().replace(/\s+/g, "-"),
    farmerName: document.getElementById("farmerName").value.trim(),
    crop: document.getElementById("listingCrop").value,
    quantityQuintal: document.getElementById("quantity").value,
    askingPrice: document.getElementById("askingPrice").value,
    location: document.getElementById("location").value,
  };
  const res = await fetch(`${API}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (res.ok) {
    msgEl.className = "msg success";
    msgEl.textContent = `Listed! Your produce is now visible to buyers on the Marketplace tab.`;
    e.target.reset();
  } else {
    msgEl.className = "msg error";
    msgEl.textContent = data.error || "Something went wrong.";
  }
});

// ---------- Marketplace ----------
async function loadListings() {
  const container = document.getElementById("listingsContainer");
  container.innerHTML = "Loading...";
  const res = await fetch(`${API}/api/listings`);
  const data = await res.json();

  if (!data.listings.length) {
    container.innerHTML = "<p>No listings yet — be the first to list produce from the Farmer tab.</p>";
    return;
  }

  container.innerHTML = data.listings
    .map((l) => {
      const ratingText =
        l.farmerRating.average != null
          ? `⭐ ${l.farmerRating.average} (${l.farmerRating.count} deals)`
          : "⭐ New seller";
      const bidsHtml = l.bids
        .map(
          (b) => `
        <li>
          ${b.buyerName}: ₹${b.amount.toLocaleString("en-IN")} ${b.message ? `— "${b.message}"` : ""}
          ${l.status === "open" ? `<button class="btn-secondary accept-bid-btn" data-listing="${l.id}" data-bid="${b.id}">Accept</button>` : ""}
        </li>`
        )
        .join("");

      return `
        <div class="listing-card">
          <h3>${l.crop} — ${l.quantityQuintal} quintal</h3>
          <div class="listing-meta">${l.farmerName} · ${l.location} · ${ratingText}</div>
          <div class="listing-price">Asking ₹${l.askingPrice.toLocaleString("en-IN")}/quintal</div>
          <p class="status-${l.status}">${l.status === "open" ? "Open for bids" : "Deal closed"}</p>
          <ul>${bidsHtml || "<li>No bids yet</li>"}</ul>
          ${
            l.status === "open"
              ? `<button class="btn-primary bid-btn" data-id="${l.id}" data-crop="${l.crop}">Place Bid</button>`
              : ""
          }
        </div>`;
    })
    .join("");

  container.querySelectorAll(".bid-btn").forEach((btn) => {
    btn.addEventListener("click", () => openBidModal(btn.dataset.id, btn.dataset.crop));
  });
  container.querySelectorAll(".accept-bid-btn").forEach((btn) => {
    btn.addEventListener("click", () => acceptBid(btn.dataset.listing, btn.dataset.bid));
  });
}

document.getElementById("refreshListingsBtn").addEventListener("click", loadListings);

// ---------- Bid modal ----------
const bidModal = document.getElementById("bidModal");
function openBidModal(listingId, crop) {
  document.getElementById("bidListingId").value = listingId;
  document.getElementById("bidModalTitle").textContent = `Place a Bid — ${crop}`;
  bidModal.classList.remove("hidden");
}
document.getElementById("closeBidModal").addEventListener("click", () => bidModal.classList.add("hidden"));

document.getElementById("bidForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const listingId = document.getElementById("bidListingId").value;
  const buyerName = document.getElementById("buyerName").value.trim();
  const body = {
    buyerId: "buyer-" + buyerName.toLowerCase().replace(/\s+/g, "-"),
    buyerName,
    amount: document.getElementById("bidAmount").value,
    message: document.getElementById("bidMessage").value,
  };
  const res = await fetch(`${API}/api/listings/${listingId}/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    bidModal.classList.add("hidden");
    e.target.reset();
    loadListings();
  } else {
    const data = await res.json();
    alert(data.error || "Could not submit bid.");
  }
});

// ---------- Accept bid / close deal with mutual rating ----------
async function acceptBid(listingId, bidId) {
  const farmerRatingOfBuyer = prompt("Rate the buyer's trustworthiness (1-5):", "5");
  const buyerRatingOfFarmer = prompt("Rate the farmer's trustworthiness (1-5):", "5");
  const res = await fetch(`${API}/api/listings/${listingId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bidId, farmerRatingOfBuyer, buyerRatingOfFarmer }),
  });
  if (res.ok) {
    loadListings();
  } else {
    const data = await res.json();
    alert(data.error || "Could not close deal.");
  }
}

// ---------- Init ----------
loadCrops();
