package com.flashsale.inventory_service.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.JdkSerializationRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis Cache Configuration.
 *
 * WHY Redis for caching?
 * -----------------------
 * During a flash sale, every order checks inventory availability via findByProductId().
 * Without caching, each of those hits the PostgreSQL database.
 * PostgreSQL can handle ~5,000-10,000 queries/second under load.
 * Redis (in-memory) handles ~100,000+ operations/second.
 *
 * Cache Strategy: Cache-Aside (also called Lazy Loading)
 * -------------------------------------------------------
 * 1. On READ:  Check Redis first.
 *              → Cache HIT  → return data from Redis (~0.1ms).
 *              → Cache MISS → query PostgreSQL, store result in Redis, return data.
 * 2. On WRITE: After updating stock in PostgreSQL, EVICT (delete) the cached entry.
 *              The next read will re-populate the cache from the fresh DB data.
 *
 * WHY evict on write and not update?
 * ------------------------------------
 * Evicting is simpler and safer: if the DB write fails, we haven't poisoned the cache.
 * The next read just goes to the DB and repopulates the cache cleanly.
 *
 * TTL (Time-To-Live):
 * -------------------
 * Even without explicit eviction, cached entries expire after TTL seconds.
 * This is a safety net — prevents serving stale data forever if eviction is somehow missed.
 *
 * WHY JdkSerializationRedisSerializer (not GenericJackson2JsonRedisSerializer)?
 * -----------------------------------------------------------------------------
 * Spring Boot 4.x uses Jackson 3.x, which moved packages from
 * com.fasterxml.jackson → tools.jackson.
 * GenericJackson2JsonRedisSerializer in Spring Data Redis still references the old
 * com.fasterxml.jackson package, causing NoClassDefFoundError at startup.
 * JdkSerializationRedisSerializer uses Java's built-in serialization — no Jackson
 * dependency at all. The Inventory entity implements Serializable, so this works cleanly.
 */
@Configuration
@EnableCaching
public class RedisConfig {

    @Value("${inventory.cache.ttl-seconds:30}")
    private long ttlSeconds;

    /**
     * Configures the RedisCacheManager — the bridge between Spring's @Cacheable
     * abstraction and the actual Redis store.
     *
     * Key serializer   → StringRedisSerializer: human-readable keys in Redis
     *                    e.g. "inventory::550e8400-e29b-41d4-a716-446655440000"
     *
     * Value serializer → JdkSerializationRedisSerializer: Java binary serialization.
     *                    Works with any Serializable class. No external dependencies.
     */
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {

        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofSeconds(ttlSeconds))
                .disableCachingNullValues()
                .serializeKeysWith(
                        RedisSerializationContext.SerializationPair
                                .fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(
                        RedisSerializationContext.SerializationPair
                                .fromSerializer(new JdkSerializationRedisSerializer()));

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(config)
                .build();
    }
}
