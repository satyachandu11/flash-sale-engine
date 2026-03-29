package com.flashsale.order_service.event;

import java.time.Instant;
import java.util.UUID;

public record InventoryReservationFailedEvent(
        UUID eventId,
        UUID orderId,
        UUID productId,
        String reason,
        Instant failedAt) {

}
