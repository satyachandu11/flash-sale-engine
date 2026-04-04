# Flash Sale Engine Deployment Story

## Draft Post

I had one of those deployment moments this week that reminded me why production engineering is a different skill from just "writing code that works locally."

I deployed my **Flash Sale Engine** project, a distributed microservices system built with **Spring Boot, Kafka, Redis, PostgreSQL, Docker, Nginx, React, and GitHub Actions**.

The pipeline said the deployment was successful.
The containers were up.
The backend health checks passed.

But the live website still broke.

Users were seeing:
- `502 Bad Gateway`
- services randomly marked as down in the UI
- browser-side failures even though the app looked healthy from inside the VM

That debugging session turned into a real lesson in production systems.

### What was actually wrong

It was not one bug. It was a chain of deployment bugs:

1. **The VM was using a stale `docker-compose.prod.yml`**
   The CI/CD pipeline was pulling fresh images, but it was not syncing the latest repo config files onto the server first.
   So the server kept using an older compose file that was missing important environment variables.

2. **Nginx kept stale upstream container IPs after containers were recreated**
   The backend containers were healthy, but Nginx was still proxying to old container addresses.
   Result: public traffic returned `502`, while internal health checks still passed.

3. **CORS was broken for some services**
   The frontend was calling service subdomains from `https://fsengine.dev`, but `inventory-service` and `payment-service` were not actually receiving the correct allowed-origin environment variable in production.
   Result: Spring rejected browser requests with `403 Invalid CORS request`.

4. **The pipeline was only checking localhost health**
   So deploys could be marked successful even if the real public site was broken.

5. **A production-only Kafka networking bug still broke the flash sale flow**
   Even after the site loaded correctly, the flash sale simulation initially gave:
   - 120 orders fired
   - 0 tickets sold
   - stock stayed at 100
   - all orders eventually failed

   The root cause was that some Kafka producers were still hardcoded to `localhost:9092`.
   That worked locally, but failed in Dockerized production because inside a container, `localhost` means the container itself, not the Kafka broker container.

   After fixing the producer configuration to use the configured broker address, the same production run completed with:
   - 120 orders fired
   - 94 tickets sold
   - 26 orders rejected
   - correct stock movement
   - healthy services across the board

### What I changed

I hardened the deployment pipeline end-to-end:

- synced the VM checkout to the exact Git commit being deployed
- stopped relying purely on mutable `latest` image tags
- added immutable image-tag deployment using the Git SHA
- validated the resolved Docker Compose config before rollout
- restarted Nginx after recreating app containers
- added public HTTPS smoke tests for:
  - `https://fsengine.dev`
  - `https://order.fsengine.dev/actuator/health`
  - `https://inventory.fsengine.dev/actuator/health`
  - `https://payment.fsengine.dev/actuator/health`
- added CORS verification from the real frontend origin
- improved rollback to target the previously deployed image tag instead of just reusing `latest`
- fixed Kafka producer configuration so production services use the configured broker address instead of hardcoded `localhost`

### Biggest lesson

A green pipeline does **not** automatically mean production is healthy.

There is a huge difference between:
- "the service is healthy inside the VM"
and
- "the real public system works correctly through Nginx, DNS, HTTPS, browser CORS, and frontend API calls"

That gap is where a lot of real engineering happens.

### Why I’m proud of this

This was not a tutorial bug.
This was a real deployment failure chain involving:
- infrastructure drift
- stale reverse-proxy resolution
- browser CORS behavior
- Docker-specific Kafka networking behavior
- incomplete smoke testing
- production verification gaps

Fixing it forced me to think like someone operating a live distributed system, not just someone writing application code.

That’s exactly the kind of experience I wanted from building this project.

## Short Version

I deployed my microservices-based **Flash Sale Engine** and hit a classic production problem:

The pipeline was green, containers were healthy, but the live site still failed with `502 Bad Gateway` and browser-side service outages.

Root causes included:
- stale server-side Docker Compose config
- Nginx holding old upstream container IPs after container recreation
- missing production CORS env for some services
- Kafka producers using `localhost:9092` in Dockerized production
- smoke tests checking only localhost instead of real public URLs

I fixed the pipeline by:
- syncing the VM to the exact Git commit before deploy
- deploying immutable image tags
- restarting Nginx after container refresh
- adding public endpoint and CORS verification
- improving rollback behavior
- fixing Kafka producer configuration to use the real broker address in production

Big lesson: **successful deploy != healthy production**

## Very Short Version

This week I debugged a deployment where:
- CI/CD said "success"
- containers were healthy
- but the live site still returned `502 Bad Gateway`

The actual issues were stale Compose config on the VM, stale Nginx upstream resolution, broken production CORS for some services, and a Kafka producer bug that caused 120 production orders to fail with 0 tickets sold until the broker address was fixed.

I upgraded the pipeline to sync repo state on the server, deploy immutable image tags, restart Nginx after container recreation, verify the real public URLs plus CORS before marking deploy success, and fixed the Kafka producer configuration so the live flash sale flow actually worked in Dockerized production.

Production teaches you fast that "it works on my machine" is only the beginning.

## Suggested Caption Options

### Option 1
Production debugging is where projects stop being demos and start becoming engineering.

### Option 2
A green pipeline is nice. A truly healthy production system is better.

### Option 3
This bug taught me more about deployment engineering than a week of normal coding.

## Suggested Hashtags

#Java #SpringBoot #Microservices #Docker #Nginx #Kafka #Redis #PostgreSQL #DevOps #CICD #GitHubActions #SoftwareEngineering #BackendEngineering #DistributedSystems
