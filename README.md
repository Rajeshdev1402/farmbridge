# FarmBridge — AI-Powered Market Linkage & Price Discovery Platform

Prototype for **SIH26132 – Strengthening Market Linkages and Price Discovery for Farmers**
(Team AGRIVISION).

Implements the flow from the pitch: a farmer enters a crop, sees live mandi prices
across nearby markets plus an AI-based 7–15 day price forecast with a
hold/sell recommendation, lists produce, and buyers bid directly — with both
sides rated after a deal closes.

## Stack

- **Backend:** Node.js, built-in `http` module only — **no npm install needed**.
  In-memory data store simulating Agmarknet/eNAM mandi prices with a linear-regression
  price forecaster.
- **Frontend:** Plain HTML/CSS/JavaScript (no build step), served statically by the
  same server.

## Run it

```bash
cd backend
node server.js
```

Then open **http://localhost:4000** in your browser.

That's it — one process serves both the API (`/api/...`) and the frontend.

## Project structure

```
farmbridge/
  backend/
    server.js          # HTTP server + all API routes
    data/store.js       # Mock mandi price generator + forecasting engine + in-memory DB
  frontend/
    index.html
    css/style.css
    js/app.js
```

## API reference

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/crops` | List supported crops |
| GET | `/api/prices?crop=Tomato` | Live prices across mandis for a crop, sorted best-first |
| GET | `/api/forecast?crop=Tomato&mandi=Pune%20APMC&days=10` | 7–15 day price forecast + sell/hold recommendation |
| GET | `/api/listings` | All marketplace listings |
| POST | `/api/listings` | Farmer creates a listing (`farmerId, farmerName, crop, quantityQuintal, askingPrice, location`) |
| POST | `/api/listings/:id/bids` | Buyer places a bid (`buyerId, buyerName, amount, message`) |
| POST | `/api/listings/:id/close` | Accept a bid, close the deal, submit mutual trust ratings |

## What's real vs. simulated in this prototype

- **Simulated:** mandi price history (deterministic pseudo-random walk per crop/mandi,
  seeded so numbers are stable within a session) — stands in for a live Agmarknet/eNAM feed.
- **Real logic:** the forecasting model (ordinary least-squares linear regression over
  30 days of history to project 7–15 days forward, with a trend classification and
  recommendation), the marketplace/bidding/rating workflow, and the best-mandi
  recommendation logic.

## Next steps toward a production build

1. Replace `data/store.js`'s mock price generator with a real Agmarknet/eNAM API integration.
2. Swap the in-memory arrays for Postgres/MongoDB.
3. Add real auth (farmer/buyer accounts) instead of free-text IDs.
4. Add SMS/IVR fallback and offline caching for low-connectivity users (per the
   feasibility slide).
5. Add regional-language UI strings (the language selector is currently display-only).
6. Swap linear regression for the LSTM/SARIMA-based models referenced in the research slide
   for stronger long-horizon forecasts.
