package com.flashsale.payment_service.event;

import java.time.Instant;
import java.util.UUID;

public record PaymentFailedEvent(
        UUID eventId,
        UUID orderId,
        UUID productId,
        Integer quantity,
        String reason,
        Instant failedAt) {

}
