# FlashSale Engine Simulation Frontend — Implementation Tracker

## Summary
Single-screen spaceship cockpit simulation of the Flash Sale Engine backend. React 19 SPA showing orders flowing through a distributed saga (Order → Inventory → Payment) in real time, with live SSE streams, circuit breaker state, inventory gauge, and Grafana integration.

## Stack
- `React 19 + Vite` — concurrent rendering, Suspense, useTransition, useDeferredValue
- `Tailwind CSS` — cockpit/HUD visual language, deep-space color palette
- `Framer Motion` — FlightToken animation, presence transitions, scan line effects
- `Recharts` — area + pie charts in the observability rail
- Backend: `order-service :8080`, `inventory-service :8081`, `payment-service :8082`, `Grafana :3000`

---

## Completed Steps

### ✅ Step 1 — Backend Prerequisites
New APIs and CORS support needed by the frontend:
- `GET /inventory/{productId}` — live stock levels for the gauge
- `GET /payment/config` — current failure rate + circuit breaker state
- `POST /payment/config/failure-rate` — change failure rate from the UI
- CORS enabled on all 3 services for `http://localhost:5173`

### ✅ Step 2 — Cockpit Layout Shell
Single-screen cockpit replacing the old scroll layout. 3-column main grid:
- **Left** — Command Rail (scenario controls)
- **Center** — Battle Glass (topology animation + KPIs + bottom drilldown strip)
- **Right** — Observability Rail (charts, health, Grafana)

### ✅ Step 3 — Theme + Typography System
Deep-space visual language:
- Color palette: hull (`#06101b`), cyan (`#67e8f9`), plasma (`#4ade80`), ember (`#f59e0b`), alarm (`#fb7185`)
- Fonts: Satoshi (system UI), Instrument Serif (hero headings)
- Glass panels, starfield overlay, HUD labels, text glow, cockpit shadow

### ✅ Step 4 — Simulation Control Rail
Left panel with full launch configuration:
- 4 scenario presets (Normal Load, Inventory Pressure, Payment Failures, Rate Limit Burst)
- Total Orders, Concurrency, Virtual Users, Launch Pace inputs
- Product selector (valid + invalid product for failure scenarios)
- Payment failure rate slider (syncs live to payment-service via POST)
- Start Flash Sale + Abort buttons

### ✅ Step 5 — Live Topology / Battle Glass
Center panel with animated order flight path:
- 4 stage nodes: Order Intake → Inventory Lock → Payment Gateway → Resolution
- `FlightToken` — sampled orders animate across the topology via Framer Motion
- Horizontal scan-line effect on the topology field
- Stage counter strip: Created / Reserved / Completed / Rejected

### ✅ Step 6 — Inventory Gauge + Stock End State
- Circular SVG gauge (animated via Framer Motion) showing % stock remaining
- Live polling of `/inventory/{productId}` every 1.8s
- Auto-stops launching new orders when stock hits zero (`depleted` run state)
- Banner shown when stock depletes

### ✅ Step 7 — Observability Rail + Grafana
Lazy-loaded right panel:
- Service health cards (Order, Inventory, Payment)
- Circuit Breaker state + failure rate display
- Inventory telemetry area chart
- Session Pulse — throughput vs failure trend (time-series)
- Order Mix — pie chart by saga stage
- Grafana iframe embed + open link

### ✅ Step 8 — React Performance Architecture
- `useTransition` — high-volume order map updates are non-blocking
- `useDeferredValue` — feed and chart rendering stays responsive
- `Suspense` — heavy observability rail lazy-loads without blocking cockpit
- `ErrorBoundary` — rail failures are isolated (cockpit stays up)
- `useLayoutEffect` — battle glass width measured for token positioning
- `React.memo` — KpiCard, FlightToken, FeedRow, MissionEvent, SampleCard
- `useEffectEvent` — stable event handlers for SSE callbacks

### ✅ Step 9 — Failure / Outage Storytelling
- Service health transitions fire live events ("Order Service went dark")
- Banner system for circuit breaker OPEN, stock depletion, service outage
- `TIMED_OUT` status for browser/network failures
- `RATE_LIMITED` status for per-user Redis throttle hits
- Dead-letter and compensation flows visible via outcome feed

---

## Pending — Step 10: Storytelling & Clarity Pass

**Problem:** The cockpit speaks engineering language to a non-engineering audience.
A first-time viewer sees "INVENTORY_RESERVED", "Hull integrity", "Fiber-friendly launch deck",
debug text about battle glass pixel width, and a broken Grafana iframe — and has no idea what story
is being told.

### 10a. Live Narrative Headline *(constants.js + App.jsx)*
**Status: `Done`**

Add a dynamic 1-sentence headline below the top bar that changes based on simulation state.
Written for humans, not engineers.

```
idle:     "Ready. 100 tickets available. Select a scenario and start the flash sale."
arming:   "Arming — syncing 120 orders across 64 virtual users..."
running:  "⚡ 234 fans have tried — 67 tickets remaining, 2 competing right now."
pressure: "🔥 Last 12 tickets — 89 orders still competing."
CB open:  "⚠️ Payment gateway overwhelmed — orders failing fast. Circuit breaker tripped open."
depleted: "Sold out in 34s. 87 tickets sold, 33 orders rejected."
complete: "Flash sale complete. 87 tickets sold, 33 orders rejected."
aborted:  "Simulation stopped. 12 orders completed before abort."
```

Files: `App.jsx` — add `buildNarrativeHeadline()` + render below `<header>`.

---

### 10b. Plain-English Status Labels *(constants.js)*
**Status: `Done`**

Current labels use system state names. Replace with human-readable equivalents.

| Current | New label |
|---|---|
| `QUEUED` | "Waiting to launch" |
| `SUBMITTED` | "Sent to order service" |
| `CREATED` | "Order accepted — in saga" |
| `INVENTORY_RESERVED` | "Stock secured — charging card..." |
| `COMPLETED` | "Ticket secured!" |
| `FAILED` | "Order failed" |
| `RATE_LIMITED` | "Too many requests — blocked" |
| `TIMED_OUT` | "Request timed out" |

File: `constants.js` — update `STATUS_META`.

---

### 10c. Human Scenario Missions *(constants.js)*
**Status: `Done`**

Replace engineering-speak preset descriptions with human story framing.

| Preset | New mission copy |
|---|---|
| Normal Load | "120 fans try to buy concert tickets at the same moment. Watch the engine handle the surge without breaking." |
| Inventory Pressure | "260 orders compete for 100 tickets. Stock depletes in real time — last ticket wins." |
| Payment Failures | "75% of payments will fail. The circuit breaker trips open within seconds. Watch it recover automatically." |
| Rate Limit Burst | "4 users fire 90 rapid requests. Redis blocks each user after 10 requests per minute — fair queuing in action." |

File: `constants.js` — update `PRESETS[*].mission`.

---

### 10d. Remove Debug Text + Fix Stock Label *(App.jsx)*
**Status: `Done`**

Two quick fixes in `StockGauge`:
1. Remove "Battle glass width: Xpx. Tokens and scan layers sync against this measured field." — this is a debug message, never for users.
2. Change "Hull integrity" label inside the SVG circle → "Stock remaining" — hull integrity is the spaceship metaphor leaking into the stock display, confusing viewers.

File: `App.jsx` — `StockGauge` component (lines ~329, ~342-344).

---

### 10e. Circuit Breaker Plain-English Labels *(ObservabilityRail.jsx)*
**Status: `Done`**

The CB card currently shows the raw state string ("CLOSED", "OPEN", "HALF_OPEN") with "Payment gateway protection state" as the only explanation. Replace with human-readable labels and a 1-line explanation per state.

| State | Human label | Explanation |
|---|---|---|
| `CLOSED` | "All clear" | Payments flowing normally through the gateway. |
| `OPEN` | "Gateway down" | Too many failures — all payments are fast-failing to protect the system. |
| `HALF_OPEN` | "Probing recovery" | Sending 3 test payments to check if the gateway recovered. |
| `CHECKING` / unknown | "Checking..." | Connecting to payment service. |

File: `ObservabilityRail.jsx` — Circuit Breaker article (~line 93-102).

---

### 10f. Fix Grafana Iframe *(ObservabilityRail.jsx)*
**Status: `Done`**

The Grafana iframe shows a broken placeholder image (Grafana requires `allow_embedding = true` in grafana.ini, which isn't configured). This looks like a bug during demos.

Replace the iframe with:
- A clear description of what Grafana shows
- A prominent "Open Grafana →" button
- A list of the key metrics visible there (orders/sec, P95 latency, cache hit rate, CB state)

File: `ObservabilityRail.jsx` — Grafana Source article (~lines 217-235).

---

### 10g. Sold-Out Overlay *(App.jsx)*
**Status: `Done`**

When `inventorySnapshot.availableStock === 0` and simulation is running/depleted, show a
dramatic overlay on the topology field:

```
         ██████████████
           SOLD OUT
        All 100 tickets gone
        Sold in 34 seconds
         ██████████████
```

Framer Motion fade-in over the topology area. Stock gauge turns red/pulsing.

File: `App.jsx` — inside the topology panel section (~line 1059).

---

### 10h. End-of-Run Summary Panel *(App.jsx)*
**Status: `Done`**

When `runStatus === 'complete'` or `'depleted'`, show a summary card in the Mission Snapshot
area (right column of battle glass):

```
⚡ Run Complete
87 tickets sold
33 orders failed
12 rate limited
Sold out in 34s
Success rate: 72%
[ Start New Run ]
```

File: `App.jsx` — Mission Snapshot panel (~lines 1091-1106).

---

### 10i. Inventory Chart as Time-Series *(App.jsx + ObservabilityRail.jsx)*
**Status: `Done`**

The current inventory chart in ObservabilityRail is a 2-point bar (Reserved vs Available)
rendered as an area chart — it shows an upward slope that looks wrong for a depleting sale.

Fix: track `inventoryHistory` in App.jsx (array of `{name, availableStock, reservedStock}` snapshots
over time), pass it to ObservabilityRail, render a proper time-series area chart showing stock
declining as the sale runs.

Files: `App.jsx` (add state + pass prop), `ObservabilityRail.jsx` (update chart data source).

---

## React Architecture Notes
- `Fiber / Concurrent mode`: real `useTransition` for high-volume order map writes
- `Suspense`: heavy observability rail lazy-loaded on first render
- `useDeferredValue`: feed + chart rendering deferred to keep topology responsive
- `useLayoutEffect`: battle glass pixel dimensions measured for token positioning
- `useEffectEvent`: SSE event handlers stable across re-renders without stale closure
- `ErrorBoundary`: observability rail isolated — a chart crash cannot kill the cockpit
- `React.memo`: all repeated panel components protected from unnecessary re-renders

## Backend Integration Map

| Frontend feature | Endpoint | Purpose |
|---|---|---|
| Order launch | `POST /orders` | Fire simulated orders |
| Order status polling | `GET /orders/{id}` | Fallback poll for sampled orders |
| Real-time order updates | `GET /orders/{id}/status-stream` | SSE per sampled order |
| Inventory gauge | `GET /inventory/{productId}` | Stock level polling |
| Circuit breaker display | `GET /payment/config` | CB state + failure rate |
| Failure rate slider | `POST /payment/config/failure-rate` | Live gateway config |
| Service health | `GET /actuator/health` (×3) | All 3 service health cards |
