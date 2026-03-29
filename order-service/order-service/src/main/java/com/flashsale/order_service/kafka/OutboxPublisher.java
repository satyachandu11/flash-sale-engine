package com.flashsale.order_service.kafka;

import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.order_service.entity.OutboxEvent;
import com.flashsale.order_service.event.OrderCreatedEvent;
import com.flashsale.order_service.event.PaymentFailedEvent;
import com.flashsale.order_service.repository.OutboxEventRepository;

import lombok.RequiredArgsConstructor;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class OutboxPublisher {

    private final OutboxEventRepository outboxEventRepository;
    private final OrderEventProducer orderEventProducer;
    private final PaymentFailedEventProducer paymentFailedEventProducer;
    private final ObjectMapper objectMapper;

    @Scheduled(fixedDelayString = "${outbox.publish.fixed-delay-ms:1000}")
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> pendingEvents = outboxEventRepository.findByPublishedFalse();

        for (OutboxEvent outboxEvent : pendingEvents) {
            publish(outboxEvent);
            outboxEvent.markPublished();
        }
    }

    private void publish(OutboxEvent outboxEvent) {
        if ("order-created-topic".equals(outboxEvent.getTopic())) {
            orderEventProducer.publishOrderCreatedEvent(readOrderCreatedEvent(outboxEvent.getPayload()));
            return;
        }

        if ("payment-failed-topic".equals(outboxEvent.getTopic())) {
            paymentFailedEventProducer.publish(readPaymentFailedEvent(outboxEvent.getPayload()));
            return;
        }

        throw new IllegalStateException("Unsupported outbox topic: " + outboxEvent.getTopic());
    }

    private OrderCreatedEvent readOrderCreatedEvent(String payload) {
        try {
            return objectMapper.readValue(payload, OrderCreatedEvent.class);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to deserialize outbox payload", exception);
        }
    }

    private PaymentFailedEvent readPaymentFailedEvent(String payload) {
        try {
            return objectMapper.readValue(payload, PaymentFailedEvent.class);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to deserialize outbox payload", exception);
        }
    }
}
