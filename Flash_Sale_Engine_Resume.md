# Flash Sale Engine — Project Resume Document

---

## Project Overview

**Flash Sale Engine** is a production-deployed, distributed microservices system designed to handle high-concurrency flash sale scenarios — where thousands of users simultaneously attempt to purchase limited inventory (similar to concert ticket drops or limited product releases).

- **Live URL:** https://fsengine.dev
- **Admin Panel:** https://admin.fsengine.dev
- **Grafana Dashboard:** https://grafana.fsengine.dev
- **GitHub:** https://github.com/satyachandu11/flash-sale-engine
- **Status:** Fully deployed on Azure (B2s VM, Ubuntu 24.04)

---

## Tech Stack

| Category           | Technology                          |
|--------------------|-------------------------------------|
| Language           | Java 17                             |
| Framework          | Spring Boot 4.0                     |
| Messaging          | Apache Kafka (Confluent 7.4)        |
| Database           | PostgreSQL 15                       |
| Cache              | Redis 7                             |
| Resilience         | Resilience4j 2.2                    |
| Observability      | Micrometer + Prometheus + Grafana   |
| Frontend           | React 18 + Vite + Recharts          |
| Containerization   | Docker + Docker Compose             |
| CI/CD              | GitHub Actions                      |
| Container Registry | GitHub Container Registry (GHCR)    |
| Cloud              | Azure (B2s VM — 2 vCPU, 4GB RAM)   |
| Reverse Proxy      | Nginx with SSL (Let's Encrypt)      |
| Build Tool         | Apache Maven                        |

---

## System Architecture

4 Spring Boot microservices communicating via Kafka (choreography-based saga):

```
Client (Browser)
    │
    ▼
Nginx (SSL Termination + Reverse Proxy)
    │
    ├── fsengine.dev          → Public React Frontend (port 3001)
    ├── admin.fsengine.dev    → Admin React Frontend (port 3002)
    ├── order.fsengine.dev    → Order Service (port 8080)
    ├── inventory.fsengine.dev→ Inventory Service (port 8081)
    ├── payment.fsengine.dev  → Payment Service (port 8082)
    └── grafana.fsengine.dev  → Grafana (port 3000)

Order Service (8080)
    │── Kafka ──► Inventory Service (8081)
                       │── Kafka ──► Payment Service (8082)
                       │                   │── Kafka ──► Order Service
                       └── Kafka ──► Order Service
```

### Services

| Service           | Role                                                        |
|-------------------|-------------------------------------------------------------|
| Order Service     | HTTP entry point. Accepts orders, manages order lifecycle.  |
| Inventory Service | Manages product stock. Reserves/releases via Kafka events.  |
| Payment Service   | Event-driven. Processes payment with circuit breaker.       |
| Admin Service     | Admin panel backend. Manages sessions, invites, stock top-up.|

---

## Core Design Patterns Implemented

### 1. Saga Pattern (Choreography)
Distributed transaction across 3 services with automatic compensation:
- Order created → inventory reserved → payment processed
- On payment failure: inventory automatically released (saga rollback)
- No central coordinator — services react to each other's events

### 2. Outbox Pattern (Both Order + Inventory Services)
Guarantees no Kafka message is ever lost even on service crash:
- DB write and outbox row saved in same atomic transaction
- Scheduled publisher reads unpublished outbox rows and pushes to Kafka
- Eliminates dual-write problem (DB success + Kafka failure)

### 3. Idempotency (All Services)
Kafka delivers messages at-least-once — duplicate protection via `processed_events` table:
- Every consumer checks event ID before processing
- Prevents double-reservation, double-payment on message replays

### 4. Optimistic Locking (Inventory)
Prevents race conditions during concurrent stock reservation:
- `@Version` field on Inventory entity
- JPA throws `OptimisticLockException` on concurrent conflicting updates
- Guarantees no overselling under high concurrency

### 5. Redis Cache-Aside (Inventory Service)
Handles flash sale read spikes without overloading PostgreSQL:
- Redis answers inventory lookups in ~0.1ms vs ~5ms database round-trip
- 30-second TTL with explicit eviction on stock updates
- Cache-aside pattern with separate `InventoryCacheService` bean (avoids Spring AOP self-invocation pitfall)

### 6. Rate Limiting (Order Service)
Per-user Redis counter prevents bot flooding and enforces fairness:
- Fixed window (10 requests per 60 seconds per userId)
- Atomic Redis INCR + EXPIRE — no race conditions
- Returns HTTP 429 on limit exceeded

### 7. Circuit Breaker (Payment Service)
Resilience4j circuit breaker protects against payment gateway outages:
- CLOSED → OPEN after 50% failure rate over sliding window of 10 calls
- Fast-fail in OPEN state (no gateway calls) — frees threads immediately
- HALF-OPEN probe after 10 seconds to test gateway recovery
- Configurable failure rate (`payment.gateway.failure-rate`) for live demos

### 8. Real-Time SSE (Order Service)
Browser receives live order status updates without polling:
- `POST /orders` returns immediately (status: CREATED)
- `GET /orders/{id}/status-stream` opens persistent SSE connection
- Kafka consumers call `OrderStatusService.notify()` → pushes JSON event to browser
- `ConcurrentHashMap<UUID, SseEmitter>` — thread-safe across Tomcat and Kafka threads
- Edge case handled: if saga completes before browser subscribes, result sent immediately

---

## CI/CD Pipeline (GitHub Actions — 4 Jobs)

```
Quality Gate  →  Build  →  Docker Build & Push  →  Deploy to Production
```

| Job             | Steps                                                                 |
|-----------------|-----------------------------------------------------------------------|
| Quality Gate    | Checkstyle lint on all 4 Java services + Trivy filesystem security scan |
| Build           | Maven build (skip tests) for all 4 services + npm ci + Vite build     |
| Docker          | Build & push 6 Docker images to GHCR + Trivy image scan               |
| Deploy          | SSH to Azure VM → pull images → rolling restart → smoke tests (retry loop) |

**Rollback:** Automatic on deploy failure — SSH action re-runs `docker compose up -d` to restore previous containers.

**Image tagging:** Each push tagged with both `latest` and the full Git SHA.

---

## Infrastructure

| Component          | Details                                              |
|--------------------|------------------------------------------------------|
| Cloud              | Azure B2s VM (2 vCPU, 4GB RAM) — Azure for Students |
| OS                 | Ubuntu 24.04 LTS                                     |
| Memory management  | 4GB swap + Docker `mem_limit` on all containers      |
| SSL                | Let's Encrypt wildcard cert (`*.fsengine.dev`)       |
| DNS                | Single wildcard A record → VM public IP              |
| Container registry | GHCR (GitHub Container Registry) — free tier         |
| Nginx              | Reverse proxy with SSL termination — 6 server blocks |

### Memory-Constrained Deployment (4GB VM, 13 containers)
All containers run within strict memory limits to prevent OOM:
- Kafka: 768MB, Zookeeper: 384MB
- Each Spring Boot service: 384MB (`-Xmx256m -Xms128m`)
- 4GB swap space on host as safety net

---

## Observability

**Grafana Dashboard — 8 panels:**

| Panel                   | What it Shows                                           |
|-------------------------|---------------------------------------------------------|
| Orders Per Second       | HTTP request rate to `/orders` — spikes during flash sales |
| Order Latency P95/P99   | Tail latency — should stay <100ms                       |
| Circuit Breaker State   | GREEN=closed, RED=open, YELLOW=half-open                |
| CB Failure Rate         | Watch climb to 50% then circuit opens                   |
| Payment Outcomes        | Success/fail/not-permitted breakdown                    |
| Cache Hit vs Miss       | Redis hit rate — should approach 100% under sustained load |
| Cache Hit Ratio         | Derived ratio panel                                     |
| JVM Heap Memory         | Memory usage across all services                        |

---

## Resume Bullet Points

### Software Engineer Resume — Project Entry

**Flash Sale Engine** | Java · Spring Boot · Kafka · Redis · PostgreSQL · Docker · GitHub Actions · Azure
*Personal Project — Production Deployed | [fsengine.dev](https://fsengine.dev) | March 2024*

- Built a production-deployed distributed microservices system for high-concurrency flash sales, handling simultaneous order requests across 4 Spring Boot services coordinated via Apache Kafka choreography sagas
- Implemented the **Outbox Pattern** across 2 services to guarantee zero message loss between PostgreSQL and Kafka, eliminating the dual-write reliability gap present in the original architecture
- Designed **Redis cache-aside** for inventory lookups (30s TTL, explicit eviction on writes) to prevent PostgreSQL saturation during flash sale spikes; identified and resolved Spring AOP self-invocation cache bypass issue
- Built **per-user Redis rate limiting** (fixed window, atomic INCR/EXPIRE) returning HTTP 429 after 10 requests/minute, enabling fair access for 100+ simulated concurrent users each with independent counters
- Integrated **Resilience4j circuit breaker** on payment gateway calls — trips at 50% failure rate, fast-fails in OPEN state, auto-recovers via HALF-OPEN probe — preventing cascading failure on gateway outages
- Implemented **Server-Sent Events (SSE)** for real-time order status updates: thread-safe `ConcurrentHashMap<UUID, SseEmitter>` shared between Tomcat and Kafka consumer threads; handles pre-subscription saga completion edge case
- Built **optimistic locking** on inventory entity (`@Version`) preventing overselling under concurrent load; combined with idempotency tables (`processed_events`) to safely handle Kafka's at-least-once delivery
- Delivered **full CI/CD pipeline** via GitHub Actions (lint → Maven build → Docker multi-stage build → GHCR push → SSH deploy → smoke tests with retry loop + automatic rollback on failure)
- Deployed 13 Docker containers on **Azure B2s VM (4GB RAM)** with strict `mem_limit` per container, 4GB swap, Nginx reverse proxy, and Let's Encrypt SSL — all within Azure for Students free credit
- Instrumented all services with **Micrometer + Prometheus + Grafana** (8-panel pre-provisioned dashboard) providing real-time visibility into orders/sec, P95 latency, circuit breaker state, and cache hit ratio

---

## Key Technical Decisions & Trade-offs

| Decision | Chosen Approach | Why |
|----------|----------------|-----|
| Saga coordination | Choreography (event-driven) | No single point of failure; simpler for 3-service chain |
| Rate limit granularity | Per-userId (not per-IP) | Per-IP breaks simulation (shared IP); per-userId correctly isolates 100 simulated users |
| Cache location | Separate `InventoryCacheService` bean | Spring `@Cacheable` self-invocation bypass — proxy not invoked on internal calls |
| SSE vs WebSocket | SSE | Server-to-browser only — no client messages needed after subscription; simpler |
| Failure signal | Separate `PaymentGatewayException` | Distinguishes infrastructure failure (trips CB) from business decline (should not trip CB) |
| Outbox polling interval | 1s (Order), 2s (Inventory) | Balance between latency and DB load on 4GB VM |
| Single SSL cert | Wildcard `*.fsengine.dev` | One cert covers all subdomains — simpler rotation and renewal |

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Microservices | 4 Spring Boot + 2 React frontends |
| Docker containers in production | 13 |
| Kafka topics | 6 (order-created, inventory-reserved, inventory-failed, payment-completed, payment-failed, DLT) |
| GitHub Actions pipeline jobs | 4 |
| Grafana dashboard panels | 8 |
| Core patterns implemented | 8 (Saga, Outbox, Idempotency, Optimistic Lock, Cache-Aside, Rate Limit, Circuit Breaker, SSE) |
| Production uptime | Azure B2s, single-VM deployment |

---

*Flash Sale Engine — Built entirely from scratch as a portfolio project demonstrating production-grade distributed systems engineering.*
