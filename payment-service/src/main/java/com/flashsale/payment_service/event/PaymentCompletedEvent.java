package com.flashsale.payment_service.event;

import java.time.Instant;
import java.util.UUID;

public record PaymentCompletedEvent(
        UUID eventId,
        UUID orderId,
        Instant paidAt) {

}
