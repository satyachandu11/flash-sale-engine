# LinkedIn Polished Posts

These are more natural, human-sounding LinkedIn versions of the two strongest Flash Sale Engine stories:

1. deployment succeeded, but production was still broken
2. everything looked healthy, but 0 tickets sold because of a Kafka/Docker bug

---

## Post 1: Deployment Was Green, But Production Was Still Broken

I had one of those engineering moments this week that was both frustrating and incredibly valuable.

I deployed my **Flash Sale Engine** project, a distributed system built with **Spring Boot, Kafka, Redis, PostgreSQL, React, Docker, Nginx, and GitHub Actions**.

The pipeline was green.
The containers were up.
The backend health checks passed.

And the live site was still broken.

Users were hitting `502 Bad Gateway`.
Some services showed as down in the UI.
From inside the VM, parts of the system looked healthy.
From the browser, production clearly was not.

That debugging session taught me something important:

**a successful deployment is not the same thing as a healthy production system.**

The real issues turned out to be a chain of production bugs:

- the VM was using a stale `docker-compose.prod.yml`
- Nginx was still proxying to stale container IPs after containers were recreated
- some services were missing the correct production CORS origin
- the pipeline was only checking localhost health, not the real public URLs

And even after the site loaded, I found another production-only issue:
- 120 orders fired
- 0 tickets sold
- stock stayed at 100

That one turned out to be a Kafka producer configuration bug that only showed up in Dockerized production.

I ended up hardening the deployment flow so it now:
- syncs the VM to the exact Git commit being deployed
- uses immutable image tags
- validates Docker Compose config before rollout
- restarts Nginx after container recreation
- verifies public HTTPS endpoints
- verifies browser-facing CORS behavior
- supports meaningful rollback

What I like most about this experience is that it stopped feeling like “I built a project” and started feeling like “I operated a system.”

That gap between local success and real production behavior is where a lot of real engineering growth happens.

## Suggested caption

The pipeline was green. Production was not. That debugging session taught me more than the deploy itself.

---

## Post 2: 120 Orders, 0 Tickets Sold

I hit a production bug in my **Flash Sale Engine** project that I honestly loved debugging once I understood what was happening.

The system looked healthy:
- website loaded
- services were up
- dashboard looked normal

Then I ran the flash sale simulation.

Result:
- 120 orders fired
- 0 tickets sold
- stock stayed at 100
- every order eventually failed

At first, it made no sense.

If the system was healthy, why was the sale completely dead?

The answer was a classic production-only bug:

some Kafka producers were still hardcoded to:

`localhost:9092`

That worked locally because the services were talking to Kafka on the host machine.

But in Dockerized production, `localhost` inside a container means:
"this same container"

not:
"the Kafka container"

So the HTTP layer worked.
Orders were created.
But the saga events weren’t flowing properly through Kafka, which meant:
- inventory never reserved stock
- payment never ran
- stock never changed
- orders eventually timed out and failed

After fixing the producer configuration to use the real broker address, the exact same production simulation gave:

- 120 orders fired
- 94 tickets sold
- 26 rejected
- healthy services
- correct stock movement

That bug was such a good reminder that one of the most dangerous words in containerized systems is still:

**localhost**

It’s also the kind of bug I really value now, because it’s the perfect example of:

**works locally, fails in production for a real infrastructure reason**

And those are the bugs that actually teach you how systems behave.

## Suggested caption

All services were green. 120 orders fired. 0 tickets sold. The culprit was one hardcoded `localhost`.

---

## Optional Hashtags

#Java #SpringBoot #Kafka #Docker #Nginx #Redis #PostgreSQL #Microservices #DistributedSystems #DevOps #CICD #GitHubActions #SoftwareEngineering #BackendEngineering #Azure
