package com.flashsale.inventory_service.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import com.flashsale.inventory_service.entity.Inventory;
import com.flashsale.inventory_service.repository.InventoryRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Dedicated caching layer for Inventory reads.
 *
 * WHY is this a separate class and not methods on InventoryServiceImpl?
 * -----------------------------------------------------------------------
 * Spring's @Cacheable works through AOP (Aspect-Oriented Programming).
 * AOP works by creating a PROXY around your bean. When an external caller
 * invokes a @Cacheable method, the call goes through the proxy which intercepts
 * it and checks the cache first.
 *
 * The problem: if InventoryServiceImpl calls its OWN @Cacheable method
 * (self-invocation), the call bypasses the proxy entirely — AOP never intercepts
 * it — and the cache is NEVER checked. This is a classic Spring AOP limitation.
 *
 *   ❌ WRONG (self-invocation, cache is bypassed):
 *      InventoryServiceImpl.reserveStock() → this.findCached(productId) [proxy skipped]
 *
 *   ✅ CORRECT (external call, proxy intercepts):
 *      InventoryServiceImpl.reserveStock() → inventoryCacheService.findByProductId(productId) [proxy intercepts]
 *
 * By putting the @Cacheable method in a separate Spring bean, all calls
 * go through the proxy correctly.
 *
 * Cache name: "inventory"
 * Cache key:  productId (UUID)
 * Example Redis key: "inventory::550e8400-e29b-41d4-a716-446655440000"
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryCacheService {

    private final InventoryRepository inventoryRepository;

    /**
     * Returns inventory for the given productId.
     *
     * @Cacheable behaviour:
     *   1. Spring checks Redis for key "inventory::{productId}".
     *   2. If found (cache HIT)  → return cached value immediately. DB is NOT queried.
     *   3. If not found (MISS)   → execute method body, store result in Redis, return result.
     *
     * The TTL configured in RedisConfig (default 30s) automatically expires the entry.
     */
    @Cacheable(value = "inventory", key = "#productId")
    public Optional<Inventory> findByProductId(UUID productId) {
        log.debug("Cache MISS for productId: {} — querying database", productId);
        return inventoryRepository.findByProductId(productId);
    }

    /**
     * Removes the cached inventory entry for the given productId.
     *
     * @CacheEvict behaviour:
     *   Spring deletes the Redis key "inventory::{productId}".
     *   The next call to findByProductId() will be a cache miss → fresh DB read.
     *
     * Called after every stock update (reserve or release) to prevent
     * stale cached stock numbers from being served.
     */
    @CacheEvict(value = "inventory", key = "#productId")
    public void evictByProductId(UUID productId) {
        log.debug("Cache evicted for productId: {}", productId);
    }
}
