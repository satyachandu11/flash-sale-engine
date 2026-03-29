package com.flashsale.order_service.ratelimit;

import java.time.Duration;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Per-user rate limiter using Redis Fixed Window Counter.
 *
 * WHY per-userId and NOT per-IP?
 * --------------------------------
 * IP-based rate limiting sounds simple but breaks in two ways:
 *
 *   1. FALSE POSITIVES (legitimate users blocked):
 *      - 50 colleagues share one office NAT IP → all blocked after 10 requests
 *      - Mobile users on the same ISP can share an IP
 *      - Result: innocent users can't buy tickets
 *
 *   2. SIMULATION PROBLEM:
 *      - Your frontend simulation fires 100+ requests from the same machine
 *      - All requests appear to come from 127.0.0.1 or the same server IP
 *      - Rate limiter blocks everything after 10 requests → simulation fails
 *
 * WHY per-userId WORKS CORRECTLY:
 *   - 100 simulated users each have a unique UUID
 *   - Each gets their own Redis counter: "rate_limit:{uuid1}", "rate_limit:{uuid2}", ...
 *   - Each user is limited independently → simulation works as intended
 *   - In production: one real user can't spam-buy all tickets regardless of their IP
 *
 * ALGORITHM — Fixed Window Counter:
 * ------------------------------------
 *   Redis key: "rate_limit:{userId}"
 *   Window:    60 seconds
 *   Limit:     10 requests per window
 *
 *   Request comes in:
 *     1. INCR key → get new count
 *     2. If count == 1 (first request): set EXPIRE to 60s
 *     3. If count > 10: reject → throw RateLimitExceededException
 *     4. Otherwise: allow through
 *
 *   At 60s: Redis auto-deletes the key → counter resets → user can order again
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RateLimitService {

    private final StringRedisTemplate redisTemplate;

    @Value("${rate.limit.max-requests:10}")
    private int maxRequests;

    @Value("${rate.limit.window-seconds:60}")
    private int windowSeconds;

    /**
     * Checks if the given user has exceeded their request limit.
     * Throws RateLimitExceededException if they have.
     *
     * Called from OrderServiceImpl BEFORE order creation logic runs —
     * so rate-limited users don't create orders, reserve stock, or trigger events.
     */
    public void checkLimit(UUID userId) {
        String redisKey = "rate_limit:" + userId;

        // INCR: atomic increment. If key doesn't exist, creates it at 0 then increments to 1.
        Long count = redisTemplate.opsForValue().increment(redisKey);

        // On first request: start the expiry window.
        // After windowSeconds, Redis deletes the key → counter resets to 0.
        if (count != null && count == 1) {
            redisTemplate.expire(redisKey, Duration.ofSeconds(windowSeconds));
        }

        if (count != null && count > maxRequests) {
            log.warn("Rate limit exceeded for userId: {} — request #{} blocked (max: {}/{}s)",
                    userId, count, maxRequests, windowSeconds);
            throw new RateLimitExceededException(
                    "Too many requests. Limit is " + maxRequests
                    + " orders per " + windowSeconds + " seconds.");
        }

        log.debug("Request #{}/{} for userId: {}", count, maxRequests, userId);
    }
}
