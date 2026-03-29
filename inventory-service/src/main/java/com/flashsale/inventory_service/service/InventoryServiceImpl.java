package com.flashsale.inventory_service.service;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.inventory_service.entity.OutboxEvent;
import com.flashsale.inventory_service.entity.Inventory;
import com.flashsale.inventory_service.dto.InventorySnapshotResponse;
import com.flashsale.inventory_service.event.InventoryReservationFailedEvent;
import com.flashsale.inventory_service.event.InventoryReservedEvent;
import com.flashsale.inventory_service.repository.InventoryRepository;
import com.flashsale.inventory_service.repository.OutboxEventRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Inventory Service Implementation — with Redis Cache integration.
 *
 * READ flow  (reserveStock/releaseReservedStock):
 *   → inventoryCacheService.findByProductId()  [checks Redis first]
 *   → On cache HIT: returns instantly, DB not touched
 *   → On cache MISS: DB queried, result cached for future reads
 *
 * WRITE flow (after inventoryRepository.save()):
 *   → inventoryCacheService.evictByProductId() [deletes stale Redis entry]
 *   → Next read will re-populate cache from fresh DB data
 *
 * WHY evict after save (not before)?
 *   If we evict before the save and the save fails (e.g. DB error), the cache
 *   is already invalidated. The next read will go to DB and get the OLD data —
 *   which is correct behaviour (nothing changed). So evicting before is also safe,
 *   but evicting AFTER is the convention: we only invalidate when we're sure the
 *   DB has the new data.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryServiceImpl implements InventoryService {

    private final InventoryRepository inventoryRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;
    private final InventoryCacheService inventoryCacheService;  // Cache layer

    @Override
    @Transactional(readOnly = true)
    public InventorySnapshotResponse getInventorySnapshot(UUID productId) {
        Inventory inventory = inventoryCacheService.findByProductId(productId)
                .orElseThrow(() -> new NoSuchElementException("Inventory not found for productId: " + productId));

        return new InventorySnapshotResponse(
                inventory.getProductId(),
                inventory.getTotalStock(),
                inventory.getReservedStock(),
                inventory.getAvailableStock());
    }

    @Override
    @Transactional
    public void reserveStock(UUID orderId, UUID productId, int quantity) {

        // READ with pessimistic write lock (SELECT ... FOR UPDATE).
        // Bypasses cache intentionally: concurrent threads must serialize here so that each
        // sees the latest committed stock count, not a stale cached value.
        // Without this lock, multiple threads read the same cached availableStock,
        // all decide "stock available", all call save() — only one wins due to @Version,
        // the rest throw OptimisticLockException and their reservations are lost.
        Inventory inventory = inventoryRepository.findByProductIdForUpdate(productId)
                .orElseThrow(() -> new IllegalStateException("Inventory not Found"));

        if (inventory.getAvailableStock() < quantity) {
            InventoryReservationFailedEvent event = new InventoryReservationFailedEvent(
                    UUID.randomUUID(),
                    orderId,
                    productId,
                    "Insufficient Stock",
                    Instant.now());

            saveOutboxEvent("inventory-failed-topic", event);
            return;
        }

        inventory.setAvailableStock(inventory.getAvailableStock() - quantity);
        inventory.setReservedStock(inventory.getReservedStock() + quantity);
        inventory.setUpdatedAt(LocalDateTime.now());

        inventoryRepository.save(inventory);

        // EVICT: stock changed in DB — remove cached entry so next read is fresh.
        inventoryCacheService.evictByProductId(productId);
        log.info("Reserved {} units for productId: {}. Cache evicted.", quantity, productId);

        InventoryReservedEvent event = new InventoryReservedEvent(
                UUID.randomUUID(),
                orderId,
                productId,
                quantity,
                Instant.now());

        saveOutboxEvent("inventory-reserved-topic", event);
    }

    @Override
    @Transactional
    public void releaseReservedStock(UUID orderId, UUID productId, int quantity) {

        // READ with pessimistic write lock — same reason as reserveStock().
        Inventory inventory = inventoryRepository.findByProductIdForUpdate(productId)
                .orElseThrow(() -> new IllegalStateException("Inventory not Found"));

        if (inventory.getReservedStock() < quantity) {
            throw new IllegalStateException("Reserved stock is lower than release quantity");
        }

        inventory.setReservedStock(inventory.getReservedStock() - quantity);
        inventory.setAvailableStock(inventory.getAvailableStock() + quantity);
        inventory.setUpdatedAt(LocalDateTime.now());

        inventoryRepository.save(inventory);

        // EVICT: stock changed — invalidate cached entry
        inventoryCacheService.evictByProductId(productId);
        log.info("Released {} units for productId: {}. Cache evicted.", quantity, productId);
    }

    private void saveOutboxEvent(String topic, Object event) {
        try {
            outboxEventRepository.save(new OutboxEvent(topic, objectMapper.writeValueAsString(event)));
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to serialize inventory outbox event", exception);
        }
    }
}
