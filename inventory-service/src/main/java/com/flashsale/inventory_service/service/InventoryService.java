package com.flashsale.inventory_service.service;

import java.util.UUID;

import com.flashsale.inventory_service.dto.InventorySnapshotResponse;

public interface InventoryService {
    void reserveStock(UUID orderId, UUID productId, int quantity);
    void releaseReservedStock(UUID orderId, UUID productId, int quantity);
    InventorySnapshotResponse getInventorySnapshot(UUID productId);
    InventorySnapshotResponse addStock(UUID productId, int quantity);
}
