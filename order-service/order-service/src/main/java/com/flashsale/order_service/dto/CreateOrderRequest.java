package com.flashsale.order_service.dto;

import java.util.UUID;

public record CreateOrderRequest(
        UUID userId,
        UUID productId,
        Integer quantity) {
}
