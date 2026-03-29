# FlashSale Engine — Implementation Change Log

Complete record of every backend and frontend change made across all sessions.
Each section explains **what** changed, **why**, and **how it works** with examples.

---

## 1. Backend — Payment Service Startup Fixes

### 1.1 `@EnableScheduling` on PaymentServiceApplication

**File:** `payment-service/src/main/java/.../PaymentServiceApplication.java`

**Problem:** Service crashed on startup with:
```
Either a RetryTopicSchedulerWrapper or TaskScheduler bean is required
```

**Why:** Spring Kafka 4.x's `@RetryableTopic` needs a `TaskScheduler` bean to schedule retries.
`@EnableScheduling` makes Spring auto-create one.

**Fix:**
```java
@SpringBootApplication
@EnableScheduling   // ← added
public class PaymentServiceApplication { ... }
```

---

### 1.2 Jackson 3.x dependency on PaymentService

**File:** `payment-service/pom.xml`

**Problem:** `NoClassDefFoundError: tools/jackson/databind/JacksonModule` at startup.

**Why:** Spring Boot 4.x ships with Jackson 3.x (package `tools.jackson` instead of `com.fasterxml.jackson`).
`StringJacksonJsonMessageConverter` in spring-kafka 4.x requires it, but payment-service had no web starter
to bring Jackson transitively.

**Fix:** Added `spring-boot-starter-jackson` and `spring-boot-starter-web` to pom.xml.

---

## 2. Backend — Order Service: Real-Time SSE Status Updates

### 2.1 OrderStatusService (NEW)

**File:** `order-service/.../sse/OrderStatusService.java`

**Purpose:** Manages live browser connections — one per order — so the frontend knows the moment an order changes status without polling.

**How it works:**
```
Browser                     order-service                 Kafka consumer
  │                              │                              │
  │── GET /orders/{id}/stream ──▶│                              │
  │                         subscribe()                         │
  │                    parks SseEmitter in Map                  │
  │                              │                              │
  │                              │◀── notify(COMPLETED) ────────│
  │                         removes emitter                     │
  │◀──── SSE event: {status:"COMPLETED"} ────────────────────── │
  │  (connection closes)         │
```

**Edge case handled:** If the saga completes before the browser subscribes (e.g., order finishes in 50ms),
`subscribe()` immediately checks the DB and sends the terminal status without waiting.

**Thread safety:** `ConcurrentHashMap` + atomic `remove()` before `send()` — only one thread
ever writes to a given emitter.

---

### 2.2 New endpoints on OrderController

**File:** `order-service/.../controller/OrderController.java`

| Endpoint | Purpose |
|---|---|
| `GET /orders/{id}` | Returns current status — fallback poll or post-SSE check |
| `GET /orders/{id}/status-stream` | Opens persistent SSE connection, pushes one `order-status` event when saga settles |

**Frontend usage:**
```js
const source = new EventSource('/orders/abc123/status-stream');
source.addEventListener('order-status', (e) => {
  const { status, reason } = JSON.parse(e.data);
  // status = "COMPLETED" | "FAILED" | "INVENTORY_RESERVED"
});
```

---

### 2.3 Saga guard checks in InventoryEventConsumer

**File:** `order-service/.../kafka/InventoryEventConsumer.java`

**Problem:** If an order timed out (marked FAILED) and then a late Kafka message arrived
saying inventory was reserved, the service threw `IllegalStateException` trying to
transition from FAILED → INVENTORY_RESERVED.

**Fix:** Both handlers now check `if ("FAILED".equals(order.getStatus())) return;` before acting.

**Compensation flow added:** When `INVENTORY_RESERVED` arrives for an already-FAILED order,
the service publishes a `PaymentFailedEvent` outbox entry so the inventory service
releases the reserved stock:
```
Order already FAILED
    ↓
Inventory reserved message arrives late
    ↓
publishCompensation() → writes PaymentFailedEvent to outbox
    ↓
Inventory service receives it → releases reserved stock
```

---

## 3. Backend — Order Service: Session Stats Endpoint

### 3.1 `GET /orders/stats?since={epochMs}`

**Files changed:**
- `OrderStatsResponse.java` (new DTO)
- `OrderRepository.java` (new JPQL query)
- `OrderService.java` (new interface method)
- `OrderServiceImpl.java` (implementation)
- `OrderController.java` (new endpoint)

**Problem:** Frontend only tracked 20 "sampled" orders via SSE. A 120-order run showed
"1.7% success" because 118 orders were never polled. The backend actually completed 51 tickets.

**How it works:**
```
Frontend sends:  GET /orders/stats?since=1704067200000
                 (epoch ms = moment "Start Flash Sale" was clicked)

Backend:
  1. Converts epoch ms → LocalDateTime (server timezone)
  2. Runs: SELECT status, COUNT(*) FROM orders
           WHERE created_at >= :since
           GROUP BY status
  3. Returns:
     {
       "total": 120,
       "created": 5,          ← still in saga, inventory step
       "inventoryReserved": 8, ← still in saga, payment step
       "completed": 51,        ← tickets actually sold
       "failed": 42,           ← payment or inventory failure
       "timedOut": 3,
       "rateLimited": 11,
       "inFlight": 13          ← created + inventoryReserved
     }
```

**Frontend polls this every 2 seconds** during running/depleted/complete states.
The KPI cards (Orders Fired, In Flight, Success %, Failure %) display backend numbers
instead of local counters — always 100% accurate regardless of how many orders are in the run.

---

## 4. Frontend — Architecture

### 4.1 React 19 Concurrent Features

| Feature | Where used | Why |
|---|---|---|
| `useTransition` | All order map writes | Keeps topology responsive; browser doesn't freeze on 120+ concurrent state updates |
| `useDeferredValue` | Feed + chart rendering | Charts re-render in background; topology stays at 60fps |
| `Suspense` | ObservabilityRail | Heavy Recharts modules lazy-load without blocking the cockpit |
| `useEffectEvent` | SSE handlers, polls | Stable callback refs — no stale closure captures in long-running timers |
| `React.memo` | KpiCard, FlightToken, FeedRow, MissionEvent, SampleCard | Prevents cascading re-renders when unrelated state changes |
| `ErrorBoundary` | ObservabilityRail | A chart crash cannot take down the cockpit; battle glass stays live |
| `useLayoutEffect` | battleGlassRef | Measures pixel width AFTER paint for token positioning |

---

### 4.2 SSE + Polling Strategy

```
Every order submitted
    ↓
Is sampled? (first 20 orders with orderId)
    ├── YES → open EventSource for /orders/{id}/status-stream
    │         │
    │         ├── SSE event received → applyStatusUpdate()
    │         │
    │         └── SSE error (no terminal event) → poll GET /orders/{id} once ← FIXED
    │
    └── NO → never individually tracked;
             REAL status visible in backend stats KPI cards
```

The `SAMPLE_LIMIT = 20` keeps browser connection count manageable.
At 1000 orders, opening 1000 EventSource connections would exhaust browser limits.

**Fallback polling (every 2.5s):** All sampled orders with an open stream get polled
via `GET /orders/{id}` as a safety net in case the SSE event was missed.

---

### 4.3 Cockpit Grid Layout (explicit placement)

**Problem:** CSS grid auto-placement caused the ObservabilityRail to land in the wrong
cell (col 2, rows 2–3) and the page would flash/jump when the lazy module loaded.

**Fix:** All 4 grid sections now have explicit `col-start-*` and `row-start-*` classes:

```
┌──────────────┬────────────────────────────┬──────────────┐
│ col-start-1  │ col-start-2 row-start-1    │ col-start-3  │
│ row-span-2   │ Battle Glass               │ row-span-2   │
│ Command Rail │                            │ Obs Rail     │
│              ├────────────────────────────┤              │
│              │ col-start-2 row-start-2    │              │
│              │ Outcome Feed / Events      │              │
└──────────────┴────────────────────────────┴──────────────┘
```

---

### 4.4 Backend-Driven KPI Cards

```js
// BEFORE: only sampled orders counted
const counters = computeCounters(ordersByClientId); // max 20 orders visible
kpis[2].value = formatPercent(counters.completed / counters.submitted * 100); // "1.7%"

// AFTER: backend stats for all orders in the session
const backendStats = await fetch(`/orders/stats?since=${sessionStart}`);
kpis[2].value = formatPercent(backendStats.completed / backendStats.total * 100); // "43.2%"
```

When `backendStats` is null (before first poll), falls back to local counters seamlessly.

---

### 4.5 Saga Settling Indicator

After a run completes, the backend saga is still processing orders asynchronously.
The frontend now shows this explicitly:

```
⚡ Run Complete
87 tickets sold       33 rejected
43.2% success         00:31 duration
Saga settling — 12 orders still processing...
```

The "settling" message disappears automatically when `backendStats.inFlight` reaches 0.

---

## 5. Frontend — Storytelling Improvements (Step 10)

### 5.1 Narrative Headline
Dynamic 1-sentence story below the header that changes based on simulation state:

| State | Headline |
|---|---|
| idle | "Ready. 61 tickets available. Select a scenario and start the flash sale." |
| arming | "Arming — syncing 120 orders across 64 virtual users..." |
| running (normal) | "⚡ 117 fans have tried — 51 secured tickets, 41 remaining." |
| running (critical stock) | "🔥 Last 8 tickets — 234 orders competing right now." |
| running (CB open) | "⚠️ Payment gateway overwhelmed — circuit breaker tripped open." |
| depleted | "Sold out in 00:34. 87 tickets sold, 33 orders rejected." |
| complete | "Flash sale complete in 00:31. 87 tickets sold, 18 orders rejected." |

### 5.2 Plain-English Status Labels

| Backend status | Shown in UI |
|---|---|
| `QUEUED` | "Waiting to launch" |
| `CREATED` | "Order accepted — in saga" |
| `INVENTORY_RESERVED` | "Stock secured — charging card..." |
| `COMPLETED` | "Ticket secured!" |
| `FAILED` | "Order failed" |
| `RATE_LIMITED` | "Too many requests — blocked" |
| `TIMED_OUT` | "Request timed out" |

### 5.3 Circuit Breaker Plain-English Labels (ObservabilityRail)

| State | Human label | Explanation shown |
|---|---|---|
| `CLOSED` | "All clear" | "Payments flowing normally through the gateway." |
| `OPEN` | "Gateway down" | "Too many failures — all payments fast-failing to protect the system." |
| `HALF_OPEN` | "Probing recovery" | "Sending 3 test payments to check if the gateway has recovered." |

### 5.4 Inventory Chart as Time-Series
The ObservabilityRail inventory chart was a broken 2-point "Reserved vs Available" snapshot
that showed an upward slope for a depleting sale.

**Fixed:** `inventoryHistory` state in App.jsx accumulates one snapshot per poll cycle
(every 1.8s) during running/depleted states. The chart now shows:
- Green line: Available stock (descending as tickets sell)
- Amber line: Reserved stock (spikes as orders lock inventory, drops when payments complete)

### 5.5 SOLD OUT Overlay
When `availableStock === 0`, a dramatic overlay fades in over the topology field with a
pulsing "SOLD OUT" message.

### 5.6 End-of-Run Summary
When `runStatus === 'complete' || 'depleted'`, the Mission Snapshot panel becomes a
summary card showing: tickets sold, rejected, success rate, duration, rate-limited count.

---

## 6. Frontend — Performance Fixes

### 6.1 Narrative headline re-animation removed

**Problem:** `key={narrativeHeadline}` on the `AnimatePresence` motion.div caused the
entire bar to fade out and fade in on EVERY text change (every 2s poll). During a 30-second
run this fired ~30 animation cycles unnecessarily.

**Fix:** Changed `key="narrative"` (static). The bar now fades in on mount, fades out
on unmount, but the text updates in place without re-triggering the animation.

```jsx
// BEFORE — re-animates on every text change:
<motion.div key={narrativeHeadline} initial={{ opacity:0 }} animate={{ opacity:1 }}>
  {narrativeHeadline}
</motion.div>

// AFTER — animates only on mount/unmount:
<motion.div key="narrative" initial={{ opacity:0 }} animate={{ opacity:1 }}>
  {narrativeHeadline}
</motion.div>
```

### 6.2 `layout` prop removed from KpiCard and MissionEvent

**Problem:** Framer Motion's `layout` prop runs a FLIP animation (measure → animate position)
on every re-render of the parent. With KPIs updating every 2s and MissionEvents animating
in constantly, this caused expensive layout recalculations on every render cycle.

**Fix:** Removed `layout` from both components. Values update instantly; only
enter/exit transitions remain.

### 6.3 Alert bars no longer use `y` translate animation

**Problem:** `initial={{ y: -8 }}` / `animate={{ y: 0 }}` caused the alert to visually
slide down from above the header, which displaced the main grid during the animation
and caused Battle Glass to momentarily collapse.

**Fix:** Changed to `opacity` only (`initial={{ opacity:0 }}`, `animate={{ opacity:1 }}`).
The element takes up its full height immediately; only the opacity transitions — no
layout thrash.

---

## 7. Backend — Lombok JVM Warning Fix

**File:** `order-service/pom.xml`

**Warning:**
```
WARNING: sun.misc.Unsafe::objectFieldOffset has been called by lombok.permit.Permit
WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release
```

**Why this happens:** Lombok's internal `Permit` class uses `sun.misc.Unsafe` to bypass
Java's access control (for `@SneakyThrows`, `@Builder`, etc.). On Java 17+, direct use
of `sun.misc.Unsafe` is terminally deprecated and emits a warning.

**Fix:** Added `--add-opens=java.base/java.lang=ALL-UNNAMED` to the JVM arguments of
`spring-boot-maven-plugin`. This grants Lombok the module access it needs through the
official channel instead of the internal one, suppressing the warning:

```xml
<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
  <configuration>
    <jvmArguments>--add-opens=java.base/java.lang=ALL-UNNAMED</jvmArguments>
  </configuration>
</plugin>
```

---

## 9. Backend — Flash Sale Success Fixes (Root Cause: Only 1 Ticket Sold)

### 9.1 Circuit Breaker — Premature Tripping

**File:** `payment-service/src/main/resources/application.properties`

**Problem:** With `minimum-number-of-calls=5` and `failure-rate-threshold=50%`, the circuit breaker
could trip after just 3 failures out of 5 calls. At 20% random failure rate the probability is ~5.8%
per window, but with 120 concurrent orders this is near-certain to happen in the first seconds of
the run. Once OPEN for 10 seconds, all 100+ remaining payment calls fast-fail.

**Math:**
```
P(X >= 3 failures | n=5, p=0.2)
  = C(5,3)(0.2)^3(0.8)^2 + C(5,4)(0.2)^4(0.8)^1 + C(5,5)(0.2)^5
  = 0.0512 + 0.0064 + 0.0003
  ≈ 5.8% per evaluation window
```
With 120 orders evaluated in tight windows, at least one window almost certainly hits this.
CB trips → OPEN 10s → 100+ orders fast-fail → only 1 ticket sold.

**Fix:**
```
sliding-window-size:          10  → 20
minimum-number-of-calls:       5  → 20   (needs 10/20 = 50% failure to trip)
wait-duration-in-open-state:  10s → 5s   (faster recovery)
permitted-calls-in-half-open:  3  → 5
```

With 20% failure rate: expected ~4 failures in 20 calls (20%) — well below 50% threshold.
With 75% failure rate: expected ~15 failures in 20 calls (75%) — CB still trips quickly for demo.

---

### 9.2 Order State Machine Race Condition

**Files:**
- `order-service/.../entity/Order.java`
- `order-service/.../kafka/InventoryEventConsumer.java`

**Problem:** Order-service has two Kafka consumer threads running concurrently:
- Thread A: consumes `inventory-reserved-topic` → calls `markInventoryReserved()`
- Thread B: consumes `payment-completed-topic` → calls `markCompleted()`

If Thread B processes its message first (Kafka delivery order is not guaranteed across topics),
`markCompleted()` would throw `IllegalStateException` because the order is still in CREATED state
(requires INVENTORY_RESERVED). The Kafka error handler retries 3 times, but if Thread A hasn't
processed its message yet, all retries exhaust and the order stays CREATED forever.

Similarly, if Thread B runs first AND we fix `markCompleted()` to allow CREATED, Thread A
arriving later would try to call `markInventoryReserved()` on a COMPLETED order — also fails.

**Fix:**
```java
// Order.java — allow either INVENTORY_RESERVED or CREATED (out-of-order delivery)
public void markCompleted() {
    if (!"INVENTORY_RESERVED".equals(this.status) && !"CREATED".equals(this.status)) {
        throw new IllegalStateException("...");
    }
    this.status = "COMPLETED";
}
```

```java
// InventoryEventConsumer.java — skip if already COMPLETED (Thread B won the race)
if ("COMPLETED".equals(order.getStatus())) {
    processedEventRepository.save(new ProcessedEvent(event.eventId()));
    return;
}
```

---

### 9.3 Inventory Optimistic Lock Conflicts Under Concurrency

**Files:**
- `inventory-service/.../repository/InventoryRepository.java`
- `inventory-service/.../service/InventoryServiceImpl.java`

**Problem:** `InventoryCacheService.findByProductId()` is `@Cacheable` (30s TTL). Under concurrent
load, 10+ Kafka consumer threads all call `reserveStock()` simultaneously:

```
Thread 1: cache hit → reads Inventory{available=50, version=7}
Thread 2: cache hit → reads Inventory{available=50, version=7}   ← SAME cached object
Thread 3: cache hit → reads Inventory{available=50, version=7}   ← SAME cached object
...
Thread 1: saves → available=49, version=8 ✓
Thread 2: saves → version=7 != current(8) → OptimisticLockException ✗
Thread 3: saves → version=7 != current(8) → OptimisticLockException ✗
```

The Kafka error handler retries these failed consumers, but under continued concurrency they keep
losing the version check. Result: most reservations silently fail → most orders get stuck → stock
never depletes correctly.

**Fix:** Add a pessimistic write lock query used exclusively on the write path:
```java
// InventoryRepository.java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT i FROM Inventory i WHERE i.productId = :productId")
Optional<Inventory> findByProductIdForUpdate(@Param("productId") UUID productId);
```

`reserveStock()` and `releaseReservedStock()` now call `findByProductIdForUpdate()` instead of
`inventoryCacheService.findByProductId()`. Each thread acquires a DB row lock, reads fresh data,
updates, and releases. Threads serialize at the DB level — no version conflicts, no lost updates.

The cache (`@Cacheable`) is still used for the read-only UI snapshot path (`getInventorySnapshot()`).

---

## 10. Flash Sale Verification — Run Results

### First successful run after fixes

**Setup:** Normal Load preset. Stock was 14 remaining from prior runs (86 of 100 already sold).

| Metric | Value | Explanation |
|---|---|---|
| Orders fired | 37 | 30.8% of 120 planned |
| Tickets sold | 14 | All remaining stock exhausted |
| Rejected | 23 | Lost the race (inventory exhausted) or 20% payment fail |
| Success rate | 37.8% | 14/37 — correct for 14 available slots out of 37 competitors |
| Failure rate | 62.2% | Mostly "Insufficient Stock" — inventory gone, orders correctly rejected |
| Duration | 9 seconds | Stock depleted → STOCK ZERO triggered automatically |
| Circuit breaker | CLOSED | Did NOT trip on 20% failure rate — fix validated |
| Services | ALL UP | Handled the surge without degradation |

**Why 62.2% failure is correct**, not a bug: Only 14 tickets existed. Any order that lost the
inventory reservation race is correctly rejected (real flash sales work the same way — only the
fastest buyers win). The remaining failures are 20% payment gateway random failures.

**Goal achieved:** Every available ticket was sold. The system handled concurrent load, the
circuit breaker behaved correctly, the saga completed for all orders, and the frontend showed
accurate live stats.

---

## 11. Backend Integration Map

| Frontend feature | Endpoint | Service | How often |
|---|---|---|---|
| Order submission | `POST /orders` | order-service :8080 | Once per order |
| Real-time status | `GET /orders/{id}/status-stream` | order-service :8080 | SSE — 1 per sampled order |
| Status fallback poll | `GET /orders/{id}` | order-service :8080 | Every 2.5s (sampled) |
| **Session stats** | **`GET /orders/stats?since={ms}`** | **order-service :8080** | **Every 2s (active run)** |
| Inventory gauge | `GET /inventory/{productId}` | inventory-service :8081 | Every 1.8s |
| Circuit breaker | `GET /payment/config` | payment-service :8082 | Every 2.5s |
| Failure rate slider | `POST /payment/config/failure-rate` | payment-service :8082 | On slider change |
| Service health | `GET /actuator/health` (×3) | All services | Every 5s |
