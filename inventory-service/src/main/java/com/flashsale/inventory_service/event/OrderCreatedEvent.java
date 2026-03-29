package com.flashsale.inventory_service.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record OrderCreatedEvent(
                UUID eventId,
                UUID orderId,
                UUID userId,
                UUID productId,
                Integer quantity,
                BigDecimal amount,
                Instant createdAt) {

}
