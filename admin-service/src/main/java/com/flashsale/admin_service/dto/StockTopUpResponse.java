package com.flashsale.admin_service.dto;

public record StockTopUpResponse(
        ManagedProductResponse product,
        InventorySnapshotResponse inventory) {
}
