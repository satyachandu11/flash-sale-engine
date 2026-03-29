package com.flashsale.inventory_service.dto;

import java.util.UUID;

public record StockTopUpRequest(
        UUID productId,
        Integer quantity) {
}
