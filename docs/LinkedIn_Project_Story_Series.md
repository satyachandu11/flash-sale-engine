# Flash Sale Engine Story Series

This file is a content bank for posting about the development-to-production journey of **Flash Sale Engine** over time.

It draws from the actual project history in:
- `ARCHITECTURE.md`
- `CHANGES.md`
- `Flash_Sale_Engine_Resume.md`
- `AdminPLAN.md`
- `FrontendPlan.md`
- the production deployment/debugging work done in this repo

The goal is to turn one project into a series of real engineering stories instead of one generic showcase post.

---

## Series Strategy

This project is strong enough for a multi-post series because it contains:
- backend architecture decisions
- distributed systems patterns
- frontend storytelling and observability work
- CI/CD and deployment engineering
- real production-only bugs
- debugging lessons that show engineering maturity
- product-thinking decisions around access, UX, and operational truth

Recommended posting flow:

1. Building the flash-sale engine
2. Designing saga + outbox + Redis + circuit breaker
3. Real-time order tracking with SSE
4. Why the frontend had to become backend-driven
5. Invite-gated access + admin console
6. Deploying to production on Azure
7. Pipeline said success, site still failed
8. Nginx stale upstream/container IP issue
9. CORS bug in production only
10. Kafka localhost bug that caused 0 tickets sold
11. The bug that sold only 1 ticket
12. Hardening CI/CD with public smoke tests and rollback

This sequence works well because it starts with vision and architecture, then moves into increasingly real production problems and finally ends with the pipeline and system becoming more mature.

---

## Post 1: Building The Flash-Sale Engine

### Core angle

This is the “what I built” post.
Use it to introduce the project, architecture, and why it matters.

### What to emphasize

- 4 Spring Boot microservices
- React simulation frontend + separate admin frontend
- Kafka-based saga flow
- Redis caching and rate limiting
- PostgreSQL persistence
- Grafana/Prometheus observability
- Dockerized production deployment
- real flash-sale simulation with limited stock and failure scenarios

### Draft post

I built a project called **Flash Sale Engine** to simulate the kind of backend behavior you see during ticket drops, sneaker launches, or limited-stock product releases.

It’s a distributed system built with:
- **Java + Spring Boot**
- **Kafka**
- **Redis**
- **PostgreSQL**
- **React**
- **Docker**
- **Prometheus + Grafana**

At a high level:
- `order-service` accepts orders
- `inventory-service` reserves stock
- `payment-service` processes payment
- `admin-service` manages invite-gated access and stock top-ups

The frontend lets me simulate a real flash sale:
- 120+ concurrent orders
- limited inventory
- payment failure scenarios
- rate-limit scenarios
- live order telemetry and service health

I built it to go beyond CRUD apps and practice the kinds of engineering problems that show up in distributed systems:
- concurrency
- event-driven workflows
- resilience
- observability
- production deployment

This project ended up teaching me as much about failure handling and deployment debugging as it did about backend architecture.

### Suggested caption

I wanted one project that could force me to think about concurrency, failure, resilience, and deployment at the same time. Flash Sale Engine became that project.

---

## Post 2: Designing Saga + Outbox + Redis + Circuit Breaker

### Core angle

This is the “design choices” post.
Talk about why the architecture is interesting, not just what tools you used.

### What to emphasize

- choreography-based saga
- outbox pattern
- idempotency
- Redis cache-aside
- rate limiting
- Resilience4j circuit breaker
- optimistic locking

### Draft post

One of the most interesting parts of my **Flash Sale Engine** project was deciding how to handle a distributed purchase flow without pretending everything could fit into one database transaction.

I used a **choreography-based saga**:

- order created
- inventory reserved
- payment processed
- if payment fails, inventory is automatically released

To make that reliable, I added the **Outbox Pattern** so database writes and Kafka publishes don’t drift apart.

I also added:
- **idempotency tracking** so duplicate Kafka deliveries don’t cause double-processing
- **optimistic locking / serialized writes** to prevent overselling
- **Redis cache-aside** to protect inventory reads during sale spikes
- **per-user Redis rate limiting** to stop burst abuse
- **Resilience4j circuit breaker** around payment handling so failure spikes don’t cascade

The project became a good reminder that architecture isn’t about adding fancy patterns everywhere.
It’s about choosing the smallest set of mechanisms that make failure behavior predictable.

### Suggested caption

Distributed systems are interesting because success is easy to model. Failure is where the real design begins.

---

## Post 3: Real-Time Order Tracking With SSE

### Core angle

This is the “how I made an async backend visible in real time” post.

### What to emphasize

- `POST /orders` returns immediately
- saga settles asynchronously
- SSE pushes live status back to the browser
- race condition where saga can finish before subscription
- why SSE was the right choice over polling/websocket

### Draft post

One of my favorite parts of **Flash Sale Engine** is that the frontend doesn’t just fire orders and wait blindly.
It actually follows the saga in real time.

The challenge was:

`POST /orders` returns immediately, but the real outcome happens later:
- inventory might reserve stock
- payment might succeed
- payment might fail
- inventory might compensate

So I added **Server-Sent Events (SSE)** to stream order status back to the browser.

The flow became:
- browser places the order
- gets back `CREATED`
- opens an SSE stream for that order
- receives updates like:
  - `INVENTORY_RESERVED`
  - `COMPLETED`
  - `FAILED`

The interesting part wasn’t just wiring SSE.
It was handling the edge case where the saga finishes so fast that the browser subscribes after the final state is already written.

So the backend has to do more than “keep a connection open.”
It has to detect whether the order is already terminal and immediately return the real final state.

That turned the frontend from “fire-and-forget” into something that actually reflects the asynchronous backend truth.

### Suggested caption

Async systems feel much more real when the UI can follow the saga as it happens.

---

## Post 4: Why The Frontend Had To Become Backend-Driven

### Core angle

This is the “the UI was lying until I fixed the source of truth” post.

### What to emphasize

- frontend sampled only a subset of orders
- KPIs were misleading
- backend stats endpoint fixed the problem
- difference between local UI counters and real backend truth

### Draft post

At one point, my flash sale dashboard looked polished but wasn’t actually telling the truth.

The frontend tracked only a sampled subset of live orders through SSE.
That kept the UI lightweight, but it created a problem:

When I ran a 120-order simulation, the success rate shown in the cockpit could be wildly misleading because the browser only had detailed visibility into a subset of orders.

So I changed the design.

Instead of letting the frontend estimate outcomes from partial data, I added a backend session stats endpoint:

`GET /orders/stats?since=...`

That endpoint returns the real counts for the current run:
- total
- in flight
- completed
- failed
- timed out
- rate limited

After that, the dashboard stopped being a visualization of a sample and became a visualization of the actual system.

It was a good reminder that a polished UI is not enough.
If the source of truth is wrong, the dashboard is just a good-looking guess.

### Suggested caption

Sometimes the frontend bug isn’t visual. Sometimes the bug is that the dashboard is confidently wrong.

---

## Post 5: Invite-Gated Access + Admin Console

### Core angle

This is the “I treated the demo like a real shared product” post.

### What to emphasize

- public users were sharing one stock pool
- added invite gate
- created admin-service
- created separate admin frontend
- sessions in Redis
- stock top-up flow

### Draft post

One product-thinking decision in **Flash Sale Engine** changed the project a lot:

I realized that if I put the public simulation online as-is, every real visitor would be hitting the same shared stock pool.

That meant the public demo needed more than a frontend.
It needed access control and basic operations.

So I added:
- an **invite-gated public access flow**
- a new **admin-service**
- a separate **admin frontend**
- **Redis-backed public and admin sessions**
- **stock top-up controls**

That changed the project from “simulation UI” into something closer to an actual operated environment.

The public site now has:
- invite requests
- invite redemption
- session restore on refresh

The admin side now has:
- invite review
- invite approval/rejection
- invite history
- product stock top-up

I like this addition because it came from thinking beyond code.
The question wasn’t “can I add more features?”
It was:

**what does this system need if real people are going to touch it?**

### Suggested caption

The moment a project becomes public, you start noticing all the product and operations problems that local development hides.

---

## Post 6: Deploying To Production On Azure

### Core angle

This is the “from local to live” post.

### What to emphasize

- Azure VM
- Docker Compose
- Nginx reverse proxy
- HTTPS
- GHCR
- GitHub Actions
- memory-constrained deployment

### Draft post

I took my **Flash Sale Engine** project from local development to a live production deployment on an Azure VM.

The stack in production includes:
- Docker Compose
- Nginx reverse proxy
- Let’s Encrypt SSL
- GHCR image delivery
- GitHub Actions CI/CD

The interesting part wasn’t just “getting it online.”
It was making a distributed system work in a small production environment with multiple containers, service routing, environment configuration, and public HTTPS endpoints.

That deployment step changed the project completely.
Once the system was public, the bugs stopped being “code bugs” and started becoming:
- config drift
- container networking issues
- reverse proxy issues
- CORS behavior
- health-check blind spots

That’s when the project started feeling much closer to real engineering than local development.

### Suggested caption

Shipping to production changes the kind of problems you get to solve.

---

## Post 7: Pipeline Said Success, Site Still Failed

### Core angle

This is the classic “green pipeline, broken prod” story.

### What to emphasize

- deploy was marked successful
- public site still failed
- localhost checks are not enough
- difference between internal health and public system health

### Draft post

I hit a deployment problem in my **Flash Sale Engine** project that felt very real:

My pipeline said the deployment was successful.
The containers were up.
The localhost backend health checks passed.

But the public website was still broken.

That forced me to confront an important difference:

There’s a huge gap between:
- “the service is healthy on the VM”
and
- “the real public system works through Nginx, DNS, HTTPS, browser calls, and frontend routing”

The original pipeline only checked internal service health.
It did not verify that the public site actually worked end to end.

That bug changed how I think about deployment verification.
A green CI/CD run is useful, but it is not the same thing as a healthy production system.

### Suggested caption

A successful deployment is not the same thing as a working production system.

---

## Post 8: Nginx Stale Upstream / Container IP Issue

### Core angle

This is a sharp infrastructure debugging post.

### What to emphasize

- public `502 Bad Gateway`
- services healthy inside Docker
- nginx using stale upstream IPs after containers were recreated
- restarting nginx fixed public routing

### Draft post

One of the more interesting bugs in my production deployment was a **502 Bad Gateway** issue that wasn’t caused by the app itself.

Inside the system:
- containers were healthy
- internal health endpoints were working
- service-to-service reachability looked fine

But the public domain still returned `502`.

The root cause was that **Nginx was still proxying to stale container IPs** after the app containers were recreated during deployment.

So from the outside:
- site looked down

But from inside Docker:
- the services were actually fine

Restarting Nginx forced it to resolve the fresh upstream container addresses, and everything recovered.

It was a great reminder that container recreation and reverse-proxy state have to be thought about together.

### Suggested caption

Sometimes the app is fine. The proxy is just talking to ghosts.

---

## Post 9: CORS Bug In Production Only

### Core angle

This is a frontend/backend integration story.

### What to emphasize

- service was healthy
- browser still saw it as down
- cross-origin calls were rejected
- missing env/config on production compose caused the issue

### Draft post

Another production-only issue I hit in **Flash Sale Engine** had nothing to do with service uptime.

The services were healthy.
Nginx routing was working.
But the frontend still marked some services as down.

Why?

Because the browser was making cross-origin calls from `https://fsengine.dev` to service subdomains like:
- `https://inventory.fsengine.dev`
- `https://payment.fsengine.dev`

And those services were rejecting the requests with:
- `403 Invalid CORS request`

The bug wasn’t in React.
It wasn’t in Nginx.
It was that the production container config was missing the correct allowed-origin environment value for those services.

So from a server perspective, they were “up.”
From a browser perspective, they were effectively unavailable.

That’s one of those bugs you only really learn by deploying and testing from the frontend for real.

### Suggested caption

Healthy service does not always mean reachable service. Browsers are very honest about that.

---

## Post 10: Kafka `localhost` Bug That Caused 0 Tickets Sold

### Core angle

This is the second major deep-debugging story.
It is especially strong because everything looked healthy until you actually ran the flash sale.

### What to emphasize

- deployed website looked healthy
- service health was green
- ran a flash sale
- 120 requests fired
- 0 tickets sold
- stock stayed at 100
- orders timed out and got rejected
- root cause: producers hardcoded to `localhost:9092`
- worked locally, failed in Docker production
- after the fix, the same production run sold 94 tickets and rejected 26

### Draft post

I hit a bug in production that I think every backend engineer should experience at least once:

My system looked healthy.
The website loaded.
The services were up.
The dashboard looked fine.

Then I ran the flash sale simulation:
- 120 orders fired
- 0 tickets sold
- stock never moved
- every order eventually failed

At first glance, that was confusing because nothing looked obviously broken.

The real issue was in the Kafka producer configuration.

Some producer configs were hardcoded to:

`localhost:9092`

That worked locally when services were running on the host machine and Kafka was exposed on host port `9092`.

But in production, each service runs inside its own Docker container.
Inside a container, `localhost` means:
- this same container

not:
- the Kafka container

So the real broker in production should have been:

`kafka:9092`

What happened was:
- `order-service` still accepted HTTP requests
- orders were created in the database
- but saga events were not actually being published correctly to Kafka
- inventory never reserved stock
- payment never ran
- stock stayed unchanged
- timeout logic later marked the orders as failed

That bug was a perfect reminder that:

**“localhost” is one of the most dangerous words in containerized production systems.**

The before/after result made the issue especially satisfying.

Before the fix:
- 120 orders fired
- 0 tickets sold
- stock stayed at 100

After the fix:
- 120 orders fired
- 94 tickets sold
- 26 rejected
- healthy services
- correct stock movement

It also became one of my favorite lessons from this project, because it’s such a real “works locally, fails in prod” debugging story.

### Suggested caption

All services were green. 120 orders fired. 0 tickets sold. The culprit was one hardcoded `localhost`.

### Short version

I had a production bug in my Flash Sale Engine where everything looked healthy until I actually ran the sale:
- 120 orders
- 0 tickets sold
- stock unchanged

Root cause: Kafka producers were hardcoded to `localhost:9092`.

That worked locally.
It failed in Docker production because `localhost` inside a container is not the Kafka container.

After fixing the producer configuration, the same production simulation completed with:
- 94 tickets sold
- 26 rejected
- healthy services
- correct stock movement

This is exactly the kind of bug that teaches you the real difference between local development and production systems.

---

## Post 11: The Bug That Sold Only 1 Ticket

### Core angle

This is the “I thought the system was working, but it had multiple concurrency/resilience bugs stacked together” post.

### What to emphasize

- only 1 ticket sold in an early run
- premature circuit breaker trips
- state machine race condition
- inventory concurrency issue
- debugging wasn’t one fix, it was a stack of fixes

### Draft post

One of the most interesting debugging phases in **Flash Sale Engine** happened when the system didn’t fully fail, but also clearly didn’t work.

I ran the simulation expecting a healthy flash sale.
Instead, I got a result where only **1 ticket sold**.

That kind of bug is harder than a crash, because the system is doing *something*.
It just isn’t doing the right thing under load.

The root cause ended up being a stack of issues:

1. **The circuit breaker was tripping too early**
   With the original thresholds, a few random failures at 20% failure rate were enough to open the breaker much too soon during a burst.

2. **There was a race in the order state machine**
   Payment completion could arrive before inventory-reserved had been processed, which left some orders stuck in the wrong state.

3. **Inventory concurrency under load was wrong**
   Multiple threads were colliding on stale stock state and losing reservation attempts under contention.

The fix wasn’t one heroic change.
It was careful systems debugging:
- adjust the breaker thresholds so it reflects real failure behavior
- make the order state machine tolerate out-of-order cross-topic delivery
- serialize the critical inventory write path correctly

After those fixes, the simulation started behaving like a flash sale system instead of a fragile demo.

I like this bug because it shows something important:

In distributed systems, a “bad result” is often not one bug.
It’s multiple reasonable pieces interacting badly under concurrency.

### Suggested caption

The hardest bugs aren’t always crashes. Sometimes the system works just enough to mislead you.

---

## Post 12: Hardening CI/CD With Public Smoke Tests And Rollback

### Core angle

This is the “what I improved after the failures” post.

### What to emphasize

- syncing VM repo state to deployed commit
- immutable image tags
- compose validation
- nginx restart after container recreation
- public URL verification
- CORS verification
- meaningful rollback

### Draft post

After hitting multiple deployment issues in production, I upgraded my CI/CD workflow so it verifies the real system instead of only checking internal container health.

The pipeline now:
- syncs the server checkout to the exact Git commit being deployed
- deploys immutable image tags using the commit SHA
- validates Docker Compose config before rollout
- restarts Nginx after recreating app containers
- verifies real public HTTPS endpoints
- verifies browser-facing CORS behavior from the frontend origin
- keeps rollback metadata for the previous deployment

That change matters because my earlier deployment problems were not image-build problems.
They were production-system problems:
- stale server config
- stale Nginx upstream state
- browser reachability gaps
- weak smoke testing

The improved pipeline is much closer to what “production-safe deployment” should actually mean:

If the public site is broken, the deploy should fail.

### Suggested caption

The best deployment pipeline is the one that catches the bug before your users do.

---

## Recommended Posting Order

If you want the series to build momentum naturally, post in this order:

1. Building the flash-sale engine
2. Designing saga + outbox + Redis + circuit breaker
3. Real-time order tracking with SSE
4. Why the frontend had to become backend-driven
5. Invite-gated access + admin console
6. Deploying to production on Azure
7. Pipeline said success, site still failed
8. Nginx stale upstream/container IP issue
9. CORS bug in production only
10. Kafka localhost bug that caused 0 tickets sold
11. The bug that sold only 1 ticket
12. Hardening CI/CD with public smoke tests and rollback

Why this order works:
- starts with excitement and system design
- moves into real product and production lessons
- ends with maturity: how the system and pipeline got stronger

---

## Tone Guidance

Best style for these posts:
- practical
- honest
- specific
- reflective

Avoid:
- “I built the Netflix of X”
- overclaiming scale
- pretending bugs are embarrassing

Better framing:
- “This bug taught me…”
- “I thought the issue was X, but it turned out to be Y”
- “This is the difference between healthy containers and healthy production”

That tone is more credible and usually performs better with engineers.

---

## Reusable Themes Across The Series

You can keep repeating these themes in different forms:

- local success is not production success
- distributed systems fail in chains, not single points
- browser truth is different from server truth
- container networking changes the meaning of `localhost`
- observability and deployment verification are part of product quality
- strong pipelines are built from real failures
- dashboards need truthful backend-driven metrics, not just polished visuals
- product thinking matters even in backend-heavy systems

---

## Suggested Closing Line Options

- Production is where architecture choices become behavior.
- The most useful projects are the ones that force you to debug what you didn’t expect.
- Shipping the system taught me more than building the first version.
- Every one of these bugs made the project better and the pipeline stronger.

---

## Hashtags

#Java #SpringBoot #Kafka #Redis #PostgreSQL #Docker #Nginx #React #Microservices #DistributedSystems #DevOps #CICD #GitHubActions #Azure #SoftwareEngineering #BackendEngineering
