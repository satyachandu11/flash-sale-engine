package com.flashsale.payment_service.kafka;

import java.time.Instant;
import java.util.UUID;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.flashsale.payment_service.event.PaymentCompletedEvent;
import com.flashsale.payment_service.event.PaymentFailedEvent;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class PaymentEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void publishPaymentCompleted(UUID orderId) {
        PaymentCompletedEvent event = new PaymentCompletedEvent(
                UUID.randomUUID(),
                orderId,
                Instant.now());
        kafkaTemplate.send("payment-completed-topic", orderId.toString(), event);
    }

    public void publishPaymentFailed(UUID orderId, UUID productId, Integer quantity, String reason) {
        PaymentFailedEvent event = new PaymentFailedEvent(
                UUID.randomUUID(),
                orderId,
                productId,
                quantity,
                reason,
                Instant.now());
        kafkaTemplate.send("payment-failed-topic", orderId.toString(), event);
    }
}
