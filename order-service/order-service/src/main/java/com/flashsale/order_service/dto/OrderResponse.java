package com.flashsale.order_service.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderResponse(
        UUID orderId,
        String status,
        BigDecimal amount) {
}
