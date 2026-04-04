# Flash Sale Engine — Architecture & Implementation Guide

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Service Architecture](#3-service-architecture)
4. [Core Patterns (Original)](#4-core-patterns-original)
5. [New Implementations](#5-new-implementations)
   - [Outbox Pattern — Inventory Service](#51-outbox-pattern--inventory-service)
   - [Redis Caching — Inventory Service](#52-redis-caching--inventory-service)
   - [Rate Limiting — Order Service](#53-rate-limiting--order-service)
   - [Circuit Breaker — Payment Service](#54-circuit-breaker--payment-service)
   - [Observability — All Services](#55-observability--all-services)
   - [Real-Time Order Status via SSE — Order Service](#56-real-time-order-status-via-sse--order-service)
6. [Kafka Topic Topology](#6-kafka-topic-topology)
7. [Complete Saga Flow](#7-complete-saga-flow)
8. [Infrastructure & Ports](#8-infrastructure--ports)
9. [How to Run](#9-how-to-run)

---

## 1. System Overview

Flash Sale Engine is a distributed, event-driven microservices system that handles high-concurrency flash sale scenarios — think concert ticket sales where thousands of users try to buy simultaneously.

The system is designed around three core guarantees:
- **No overselling** — stock is reserved atomically with optimistic locking
- **No lost events** — the Outbox Pattern ensures Kafka messages are never lost on crashes
- **No duplicate processing** — idempotency tables prevent the same event from being handled twice

```
                        ┌─────────────────────────────────────────────────┐
                        │               FLASH SALE ENGINE                  │
                        │                                                   │
  POST /orders ────────►│  Order Service   ──Kafka──►  Inventory Service   │
                        │     :8080                        :8081            │
                        │        │                            │             │
                        │        └──────────────────────────►│             │
                        │                  Kafka              │             │
                        │                          ┌──────────┘             │
                        │                          ▼                        │
                        │                   Payment Service                 │
                        │                        :8082                      │
                        └─────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Category         | Technology                     | Version   |
|------------------|--------------------------------|-----------|
| Language         | Java                           | 17        |
| Framework        | Spring Boot                    | 4.0.2     |
| Persistence      | Spring Data JPA + PostgreSQL   | 15        |
| Messaging        | Apache Kafka                   | 7.4.0     |
| Cache            | Redis                          | 7         |
| Resilience       | Resilience4j                   | 2.2.0     |
| Metrics          | Micrometer + Prometheus        | —         |
| Dashboards       | Grafana                        | 10.4.2    |
| Build            | Apache Maven                   | —         |
| Utilities        | Lombok, Jackson 3.x            | —         |
| Infrastructure   | Docker + Docker Compose        | —         |

---

## 3. Service Architecture

### Order Service (Port 8080)
**Responsibility:** The only HTTP-facing service. Accepts order creation requests, manages order lifecycle, and orchestrates the saga.

**Key components:**
- `OrderController` — REST endpoints: `POST /orders`, `GET /orders/{id}`, `GET /orders/{id}/status-stream`
- `OrderServiceImpl` — creates orders, writes to outbox, checks rate limits, fetches order by id
- `OutboxPublisher` — scheduled task polling outbox table every 1s, publishing to Kafka
- `InventoryEventConsumer` — updates order status on inventory reservation result; notifies SSE
- `PaymentEventConsumer` — marks order COMPLETED or FAILED on payment result; notifies SSE
- `RateLimitService` — per-user Redis counter preventing request flooding
- `OrderStatusService` — manages open SSE connections; pushes status updates to browser in real-time

**Order Status State Machine:**
```
CREATED → INVENTORY_RESERVED → COMPLETED
   │               │
   └───────────────┴──────────► FAILED
```

---

### Inventory Service (Port 8081)
**Responsibility:** Manages product stock. Reserves stock when an order is created, releases it when a payment fails.

**Key components:**
- `OrderCreatedConsumer` — listens for new orders, calls `reserveStock()`
- `PaymentFailedConsumer` — listens for payment failures, calls `releaseReservedStock()`
- `InventoryServiceImpl` — stock reservation logic with cache integration
- `InventoryCacheService` — Redis-backed caching of inventory lookups
- `OutboxPublisher` — publishes inventory events reliably via outbox table

**Database table — `inventory`:**
```
id              UUID (PK)
product_id      UUID (unique)
total_stock     INTEGER
reserved_stock  INTEGER
available_stock INTEGER
version         BIGINT   ← optimistic lock
```

---

### Payment Service (Port 8082)
**Responsibility:** Processes payments against an external gateway (simulated). Publishes outcome events.

**Key components:**
- `InventoryReservedEventConsumer` — triggers payment after stock is reserved
- `PaymentServiceImpl` — calls payment gateway with circuit breaker protection
- `InventoryDLTConsumer` — handles dead-letter messages after 3 failed retries

**No HTTP endpoints** — entirely event-driven via Kafka.

---

## 4. Core Patterns (Original)

### Saga Pattern (Choreography)
The order fulfillment process is a distributed saga — multiple services coordinate via events without a central coordinator.

```
Order Service          Inventory Service       Payment Service
     │                        │                      │
     │── OrderCreated ────────►│                      │
     │                        │── InventoryReserved ─►│
     │◄─ InventoryReserved ───│                      │── PaymentCompleted ──►│
     │◄─ InventoryFailed ─────│       (or)           │── PaymentFailed ──────►│
     │                        │◄─ PaymentFailed ──────│
```

**Compensation:** If payment fails, the Inventory Service releases the reserved stock — the saga rolls back automatically.

---

### Outbox Pattern
Guarantees that a database write and a Kafka publish happen atomically — either both succeed or neither does.

**Without Outbox (unsafe):**
```
1. Save order to DB      ✓
2. Publish to Kafka      ✗ ← service crashes here → event lost forever
```

**With Outbox (safe):**
```
1. Save order to DB  }
2. Save outbox event }  ← single DB transaction, both succeed or both fail
3. Scheduler reads unpublished outbox events → publishes to Kafka → marks published
```

**Implemented in:** Order Service (original), Inventory Service (added).

---

### Idempotency
Kafka delivers messages **at-least-once** — the same event can be delivered multiple times (e.g., on consumer restart). Every service has a `processed_events` table.

```java
if (processedEventRepository.existsById(event.eventId())) {
    return; // already handled — skip silently
}
// handle event...
processedEventRepository.save(new ProcessedEvent(event.eventId()));
```

---

### Optimistic Locking
The `Inventory` entity has a `@Version` field. If two threads try to update the same inventory row simultaneously, the second one gets an `OptimisticLockException` — preventing double-reservation.

```java
@Version
private Long version; // JPA increments this on every UPDATE
```

---

## 5. New Implementations

---

### 5.1 Outbox Pattern — Inventory Service

**Why:** The Inventory Service was previously publishing Kafka events directly — if the service crashed after updating stock but before publishing, the event was permanently lost. This was a reliability gap compared to the Order Service which already used the Outbox.

**What was added:**

| File | Purpose |
|------|---------|
| `entity/OutboxEvent.java` | New entity persisted to `inventory_outbox_events` table |
| `repository/OutboxEventRepository.java` | JPA repository to query unpublished events |
| `kafka/OutboxPublisher.java` | Scheduled task (every 2s) — reads unpublished events, publishes to Kafka, marks published |
| `InventoryServiceImpl.java` | Changed to write to outbox instead of calling Kafka directly |
| `InventoryServiceApplication.java` | Added `@EnableScheduling` |

**Flow after the change:**
```
reserveStock() called
    → update available_stock in DB    }
    → insert row in outbox_events     }  single transaction
OutboxPublisher (every 2s)
    → SELECT * FROM inventory_outbox_events WHERE published = false
    → publish each to Kafka
    → UPDATE published = true
```

---

### 5.2 Redis Caching — Inventory Service

**Why:** Every incoming order calls `findByProductId()` to check stock availability. In a flash sale with 10,000 concurrent requests, this creates 10,000 database queries per second — PostgreSQL collapses under this load. Redis answers the same query in ~0.1ms from memory.

**Strategy — Cache-Aside (Lazy Loading):**
```
READ:  Check Redis → HIT? return cached value (no DB)
                   → MISS? query DB, store in Redis, return value
WRITE: Update DB → evict cached entry → next read re-populates from fresh DB data
```

**What was added:**

| File | Purpose |
|------|---------|
| `pom.xml` | Added `spring-boot-starter-data-redis`, `spring-boot-starter-cache` |
| `config/RedisConfig.java` | `@EnableCaching`, configures `RedisCacheManager` with 30s TTL and JSON serialization |
| `service/InventoryCacheService.java` | `@Cacheable` on `findByProductId()`, `@CacheEvict` to invalidate after writes |
| `service/InventoryServiceImpl.java` | Uses `InventoryCacheService` for reads; evicts after every stock update |
| `entity/Inventory.java` | Implements `Serializable` (required for Redis storage) |
| `application.properties` | Redis host/port, cache TTL config |

**Important design note — why a separate `InventoryCacheService`?**

Spring's `@Cacheable` works via AOP proxy. If `InventoryServiceImpl` calls its own `@Cacheable` method internally (self-invocation), Spring's proxy is bypassed and caching silently does nothing. By putting `@Cacheable` in a separate bean, all calls go through the proxy correctly.

```
❌ WRONG — self-invocation, proxy bypassed, cache never checked:
   InventoryServiceImpl.reserveStock() → this.findCached(productId)

✅ CORRECT — external call, proxy intercepts, cache is checked:
   InventoryServiceImpl.reserveStock() → inventoryCacheService.findByProductId(productId)
```

**Cache key:** `inventory::{productId}`
**TTL:** 30 seconds (configurable via `inventory.cache.ttl-seconds`)

---

### 5.3 Rate Limiting — Order Service

**Why:** Without rate limiting, a single bot could fire 50,000 requests per second — buying all stock and crashing the system. Rate limiting enforces fairness.

**Strategy — Fixed Window Counter in Redis:**
```
Key:   rate_limit:{userId}
Value: request count (auto-incremented atomically by Redis INCR)
TTL:   60 seconds (window resets automatically when key expires)

Request arrives:
  → INCR key → count = N
  → If N == 1: set EXPIRE 60s  (start the window)
  → If N > 10: return 429 Too Many Requests
  → Otherwise: allow
```

**Why per-userId and not per-IP?**

IP-based rate limiting has two problems for this project:
1. **False positives** — 50 people in the same office share one public IP. They'd all get blocked after 10 requests combined.
2. **Simulation breaks** — The frontend simulation fires hundreds of requests from the same machine (same IP). Every request after the 10th would be blocked — the demo fails.

Per-userId works correctly: 100 simulated users each have a unique UUID, each has their own independent Redis counter.

**Note on identity without authentication:** Currently `userId` comes from the request body (no auth yet). This is fine for the simulation — the frontend controls all userIds. In production with JWT authentication, `userId` would be extracted from the verified token instead. The rate limiting code itself doesn't change.

**What was added:**

| File | Purpose |
|------|---------|
| `pom.xml` | Added `spring-boot-starter-data-redis` |
| `ratelimit/RateLimitService.java` | Redis INCR counter per userId, throws `RateLimitExceededException` when limit exceeded |
| `ratelimit/RateLimitExceededException.java` | Runtime exception caught by controller |
| `controller/OrderController.java` | Added `@ExceptionHandler` returning HTTP 429 |
| `service/OrderServiceImpl.java` | Calls `rateLimitService.checkLimit(request.userId())` before order creation |
| `application.properties` | `rate.limit.max-requests=10`, `rate.limit.window-seconds=60` |

**Request flow with rate limiting:**
```
POST /orders
    → OrderController.createOrder()
    → OrderServiceImpl.createOrder()
        → rateLimitService.checkLimit(userId)     ← Redis INCR
            → count ≤ 10: continue
            → count > 10: throw RateLimitExceededException
    → @ExceptionHandler catches it → HTTP 429
    → (if allowed) create order, write outbox event
```

---

### 5.4 Circuit Breaker — Payment Service

**Why:** Payment calls an external gateway. If the gateway goes down or becomes slow:
- Without circuit breaker: every Kafka message triggers a gateway call → calls hang for 30s → threads pile up → service crashes → cascading failure across the system
- With circuit breaker: after enough failures, the circuit OPENS → calls fail immediately (fast-fail) → threads are freed → gateway gets time to recover

**The Three States:**
```
          failure rate > 50%
 CLOSED ──────────────────────► OPEN
(normal)                      (fast-fail)
   ▲                               │
   │ test calls succeed            │ after 10s
   │                               ▼
   │                          HALF-OPEN
   └──────────────────────── (3 test calls)
         test calls fail → OPEN
```

**Configuration (application.properties):**

| Property | Value | Meaning |
|----------|-------|---------|
| `sliding-window-size` | 10 | Track last 10 calls |
| `failure-rate-threshold` | 50 | Open if ≥50% fail |
| `minimum-number-of-calls` | 5 | Don't evaluate until 5 calls made |
| `wait-duration-in-open-state` | 10s | Stay open 10s before probing |
| `permitted-number-of-calls-in-half-open-state` | 3 | 3 test calls in HALF-OPEN |

**Configurable failure rate for demo:**
```properties
# Set to 0.7 to quickly trip the circuit breaker during demo
payment.gateway.failure-rate=0.2
```

This is the most impactful demo control — raising it to 0.7 makes the circuit breaker open within seconds, visibly changing the Grafana dashboard from green to red.

**What was added:**

| File | Purpose |
|------|---------|
| `pom.xml` | Added `resilience4j-spring-boot3`, `aspectjweaver` |
| `exception/PaymentGatewayException.java` | Infrastructure failure signal — what the circuit breaker monitors |
| `service/PaymentServiceImpl.java` | `@CircuitBreaker` annotation on `processPayment()`, fallback publishes payment-failed event |
| `application.properties` | Full circuit breaker config + `payment.gateway.failure-rate` |

**Why a separate `PaymentGatewayException`?**

The circuit breaker only counts method calls as "failures" when they throw an exception. Two types of failures need to be distinguished:
- **Business failure** (card declined) — the gateway worked correctly and said no. In production this should NOT trip the circuit breaker.
- **Infrastructure failure** (gateway down, timeout) — the gateway itself is broken. This SHOULD trip the circuit breaker.

`PaymentGatewayException` is the infrastructure signal. In production you'd configure `ignoreExceptions` in Resilience4j to exclude business exceptions from the failure count.

---

### 5.5 Observability — All Services

**Why:** Without observability, the system is a black box. You can't see what's happening during a flash sale — whether orders are succeeding, whether the circuit breaker has tripped, whether the cache is working, or whether the system is under stress. Micrometer + Prometheus + Grafana makes all of this visible in real-time.

**Architecture:**
```
Spring Boot Services          Prometheus             Grafana
  /actuator/prometheus  ←scrape every 5s─  ←reads─  dashboards
       :8080
       :8081
       :8082
```

**How it works:**
1. Micrometer (already built into Spring Boot via Actuator) collects metrics in memory
2. `micrometer-registry-prometheus` exposes those metrics at `/actuator/prometheus` in Prometheus text format
3. Prometheus scrapes that endpoint every 5 seconds and stores the time-series data
4. Grafana queries Prometheus and renders the dashboards

**What was added:**

| File | Purpose |
|------|---------|
| All 3 `pom.xml` | Added `micrometer-registry-prometheus` |
| All 3 `application.properties` | Exposed actuator endpoints, added `application` tag to all metrics |
| `monitoring/prometheus/prometheus.yml` | Prometheus scrape config targeting all 3 services |
| `monitoring/grafana/provisioning/datasources/prometheus.yml` | Auto-connects Grafana to Prometheus on startup |
| `monitoring/grafana/provisioning/dashboards/dashboard.yml` | Tells Grafana where to load dashboard JSON files from |
| `monitoring/grafana/provisioning/dashboards/flash-sale-dashboard.json` | 8-panel pre-built dashboard |
| `docker-compose.yml` | Added Prometheus and Grafana containers |

**The `application` tag on every metric:**
```properties
management.metrics.tags.application=${spring.application.name}
```
This labels every metric with the service name. In Grafana you can then filter:
- `{application="order-service"}` — only order service metrics
- `{application="payment-service"}` — only payment service metrics

**The 8 Dashboard Panels:**

| Panel | Metric Query | What to watch |
|-------|-------------|---------------|
| Orders Per Second | `rate(http_server_requests_seconds_count{uri="/orders"}[30s])` | Spike when simulation starts |
| Order Latency P95/P99 | `histogram_quantile(0.95, ...)` | Should stay <100ms normally |
| Circuit Breaker State | `resilience4j_circuitbreaker_state` | GREEN=closed, RED=open, YELLOW=half-open |
| Circuit Breaker Failure Rate | `resilience4j_circuitbreaker_failure_rate` | Watch climb to 50% → circuit opens |
| Payment Outcomes | `resilience4j_circuitbreaker_calls_total` by kind | "Not Permitted" line = circuit is open |
| Cache Hit vs Miss | `cache_gets_total{result="hit/miss"}` | HIT rate should dominate after warmup |
| Cache Hit Ratio | hit / (hit + miss) | Should approach 100% during sustained load |
| JVM Heap Memory | `jvm_memory_used_bytes{area="heap"}` | Spot memory leaks during long runs |

---

### 5.6 Real-Time Order Status via SSE — Order Service

**Why:** The order creation endpoint (`POST /orders`) returns immediately with `status: CREATED` — the actual outcome (payment success/failure, insufficient stock) is determined asynchronously via the Kafka saga. Without a push mechanism, the browser has no way to know when the saga finishes and what the result was.

**Why SSE over alternatives:**

| Approach | How it works | Verdict |
|---|---|---|
| **Polling** | Browser calls `GET /orders/{id}` every 1–2s until status changes | Works, but wastes requests and has poll-interval delay |
| **SSE** | Browser opens one persistent HTTP connection; server pushes events when ready | Perfect fit — server-to-browser only, no bidirectional communication needed |
| **WebSocket** | Full bidirectional persistent pipe | Overkill — browser has nothing to send after subscribing |

**How it works:**
```
1. Client: POST /orders → receives {orderId, status: "CREATED"}
2. Client: GET /orders/{orderId}/status-stream
           └─ HTTP connection stays open (Spring holds it via SseEmitter)

[Kafka saga runs in background]

3. InventoryEventConsumer updates DB → INVENTORY_RESERVED
   → OrderStatusService.notify() → pushes to browser:
     data: {"status":"INVENTORY_RESERVED"}

4a. PaymentEventConsumer updates DB → COMPLETED
    → OrderStatusService.notify() → pushes to browser:
      data: {"status":"COMPLETED"}
    → SSE connection closed

4b. PaymentEventConsumer/InventoryEventConsumer updates DB → FAILED
    → OrderStatusService.notify() → pushes to browser:
      data: {"status":"FAILED","reason":"Insufficient stock"}
    → SSE connection closed
```

**The `OrderStatusService` — how it holds connections:**
```
emitters = ConcurrentHashMap<UUID orderId, SseEmitter>

subscribe(orderId):
  → Create SseEmitter (keeps HTTP response open, 2-min timeout)
  → If order already terminal (COMPLETED/FAILED): send immediately + close
  → Otherwise: park emitter in map and return (connection stays open)

notify(orderId, status, reason):
  → Remove emitter from map (atomic — only one thread ever sends)
  → Push JSON event: {"status":"...", "reason":"..."}
  → Close connection
```

**Thread safety:** `subscribe()` runs on Tomcat HTTP threads; `notify()` runs on Kafka consumer threads. `ConcurrentHashMap` + atomic `remove()` ensures no two threads ever call `send()` on the same emitter.

**Edge case — saga completes before browser subscribes:**
If the Kafka saga finishes extremely fast and the order is already COMPLETED/FAILED by the time the browser calls `GET /orders/{id}/status-stream`, `subscribe()` detects the terminal state from the DB, sends the result immediately, and closes — the browser never waits.

**What was added:**

| File | Purpose |
|------|---------|
| `sse/OrderStatusService.java` | Manages `SseEmitter` instances; `subscribe()` for open connections, `notify()` for pushing status |
| `controller/OrderController.java` | Added `GET /orders/{id}` (poll) and `GET /orders/{id}/status-stream` (SSE) |
| `service/OrderService.java` | Added `getOrder(UUID orderId)` to interface |
| `service/OrderServiceImpl.java` | Implemented `getOrder()` — fetches order from DB, returns `OrderResponse` |
| `kafka/PaymentEventConsumer.java` | Calls `orderStatusService.notify()` after COMPLETED and FAILED updates |
| `kafka/InventoryEventConsumer.java` | Calls `orderStatusService.notify()` after INVENTORY_RESERVED and FAILED updates |

**Frontend usage (JavaScript):**
```javascript
// Step 1: Place order
const res = await fetch('http://localhost:8080/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ userId, productId, quantity: 1 })
});
const { orderId } = await res.json();

// Step 2: Subscribe to live status updates
const es = new EventSource(`http://localhost:8080/orders/${orderId}/status-stream`);

es.addEventListener('order-status', (e) => {
  const { status, reason } = JSON.parse(e.data);
  if (status === 'INVENTORY_RESERVED') showMessage('Stock reserved — processing payment...');
  if (status === 'COMPLETED')          showSuccess('Payment successful!');
  if (status === 'FAILED')             showError(`Order failed: ${reason}`);
});
```

---

## 6. Kafka Topic Topology

```
Order Service
    │
    └── order-created-topic ──────────────────────────────────────────────────────┐
                                                                                   │
Inventory Service ◄────────────────────────────────────────────────────────────────┘
    │
    ├── inventory-reserved-topic ──────────────────────────────────┬──────────────┐
    │                                                               │              │
    └── inventory-failed-topic ──────────────────────► Order Service             │
                                                        (marks FAILED)            │
                                                                                   │
Payment Service ◄──────────────────────────────────────────────────────────────────┘
    │   (with @RetryableTopic: 3 attempts, exponential backoff)
    │   (failed after 3 retries → inventory-reserved-topic.DLT)
    │
    ├── payment-completed-topic ──────────────────────► Order Service
    │                                                    (marks COMPLETED)
    │
    └── payment-failed-topic ──────────────────────────► Order Service
                                              │           (marks FAILED)
                                              │
                                              └──────────► Inventory Service
                                                           (releases stock)
```

---

## 7. Complete Saga Flow

```
1. Client: POST /orders {userId, productId, quantity}
           Header: Idempotency-Key: <uuid>

2. Order Service:
   a. Check rate limit (Redis): userId counter ≤ 10/min → allow
   b. Check idempotency key → if duplicate, return existing order
   c. Create order (status=CREATED) in DB
   d. Write OrderCreatedEvent to outbox_events in same transaction
   e. Return 201 {orderId, status: "CREATED", amount}

3. OutboxPublisher (1s later):
   → Reads unpublished outbox entry
   → Publishes to order-created-topic
   → Marks published=true

4. Inventory Service consumes order-created-topic:
   a. Check idempotency (processed_events table)
   b. Fetch inventory from Redis cache (or DB on miss)
   c. If availableStock < quantity:
      → Write InventoryReservationFailedEvent to outbox → return
   d. Update: availableStock -= quantity, reservedStock += quantity
   e. Save to DB
   f. Evict Redis cache for this productId
   g. Write InventoryReservedEvent to outbox

5. Order Service consumes inventory-reserved-topic:
   → Update order status: CREATED → INVENTORY_RESERVED
   → OrderStatusService.notify() → SSE push: {"status":"INVENTORY_RESERVED"}
     (Browser shows: "Stock reserved — processing payment...")

   [If inventory failed — inventory-failed-topic instead:]
   → Update order status: CREATED → FAILED
   → OrderStatusService.notify() → SSE push: {"status":"FAILED","reason":"Insufficient stock"}
     (Browser shows: "Order failed: Insufficient stock")

6. Payment Service consumes inventory-reserved-topic:
   a. @RetryableTopic: up to 3 attempts with exponential backoff
   b. @CircuitBreaker("paymentGateway"):
      - CLOSED: call gateway simulation
      - OPEN:   fast-fail → fallback → publish PaymentFailedEvent
   c. Gateway approves (80%): publish PaymentCompletedEvent
   d. Gateway rejects (20%): throw PaymentGatewayException → fallback → publish PaymentFailedEvent

7. On Payment Completed:
   → Order Service: status INVENTORY_RESERVED → COMPLETED
   → OrderStatusService.notify() → SSE push: {"status":"COMPLETED"}
     (Browser shows: "Payment successful!")
   → SSE connection closed

8. On Payment Failed:
   → Order Service: status → FAILED
   → OrderStatusService.notify() → SSE push: {"status":"FAILED","reason":"Payment gateway error"}
     (Browser shows: "Order failed: Payment gateway error")
   → SSE connection closed
   → Inventory Service: reservedStock -= quantity, availableStock += quantity (stock released)
```

---

## 8. Infrastructure & Ports

| Service / Tool     | Port  | URL                         | Purpose                    |
|--------------------|-------|-----------------------------|----------------------------|
| Order Service      | 8080  | http://localhost:8080       | REST API entry point       |
| Inventory Service  | 8081  | http://localhost:8081       | Stock management (no HTTP) |
| Payment Service    | 8082  | http://localhost:8082       | Payment processing (no HTTP)|
| PostgreSQL         | 5432  | —                           | Shared database            |
| Redis              | 6379  | —                           | Cache + rate limit counters|
| Kafka              | 9092  | —                           | Event bus                  |
| Kafka UI           | 8085  | http://localhost:8085       | View topics and messages   |
| Prometheus         | 9090  | http://localhost:9090       | Metrics storage            |
| Grafana            | 3000  | http://localhost:3000       | Dashboards (admin/admin)   |

---

## 9. How to Run

### Start infrastructure (Docker)
```bash
docker compose up -d
```

### Start Spring Boot services
Run each service individually from your IDE or:
```bash
# Terminal 1
cd order-service/order-service && mvn spring-boot:run

# Terminal 2
cd inventory-service && mvn spring-boot:run

# Terminal 3
cd payment-service && mvn spring-boot:run
```

### Test manually

**Place an order:**
```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "userId":    "550e8400-e29b-41d4-a716-446655440000",
    "productId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "quantity":  1
  }'
# Response: {"orderId":"<uuid>","status":"CREATED","amount":999.00}
```

**Poll order status (anytime):**
```bash
curl http://localhost:8080/orders/<orderId>
# Response: {"orderId":"...","status":"COMPLETED","amount":999.00}
```

**Subscribe to real-time SSE updates (open a separate terminal before placing the order):**
```bash
curl -N http://localhost:8080/orders/<orderId>/status-stream
# Streams as the saga progresses:
# event:order-status
# data:{"status":"INVENTORY_RESERVED"}
#
# event:order-status
# data:{"status":"COMPLETED"}
```

### View the Grafana dashboard
1. Open http://localhost:3000
2. Login: `admin` / `admin`
3. Go to **Dashboards → Flash Sale → Flash Sale Engine**
4. The dashboard auto-refreshes every 5 seconds

### Demo the circuit breaker
1. Open `payment-service/src/main/resources/application.properties`
2. Set `payment.gateway.failure-rate=0.7`
3. Restart payment service
4. Fire several orders — watch the Circuit Breaker State panel flip from GREEN → RED
5. Wait 10 seconds — watch it go YELLOW (HALF-OPEN) → then GREEN (CLOSED) if orders succeed

---

*Built with Spring Boot 4.x, Apache Kafka, Redis, Resilience4j, and Micrometer.*
