package com.flashsale.inventory_service.dto;

import java.util.UUID;

public record InventorySnapshotResponse(
        UUID productId,
        Integer totalStock,
        Integer reservedStock,
        Integer availableStock) {
}
