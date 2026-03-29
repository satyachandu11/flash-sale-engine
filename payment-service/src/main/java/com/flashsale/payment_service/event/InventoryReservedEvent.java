package com.flashsale.payment_service.event;

import java.time.Instant;
import java.util.UUID;

public record InventoryReservedEvent(
        UUID eventId,
        UUID orderId,
        UUID productId,
        Integer quantity,
        Instant reservedAt) {

}
