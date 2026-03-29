package com.flashsale.inventory_service.kafka;

import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.inventory_service.entity.OutboxEvent;
import com.flashsale.inventory_service.event.InventoryReservationFailedEvent;
import com.flashsale.inventory_service.event.InventoryReservedEvent;
import com.flashsale.inventory_service.repository.OutboxEventRepository;

import lombok.RequiredArgsConstructor;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class OutboxPublisher {

    private final OutboxEventRepository outboxEventRepository;
    private final InventoryEventProducer inventoryEventProducer;
    private final ObjectMapper objectMapper;

    @Scheduled(fixedDelayString = "${outbox.publish.fixed-delay-ms:2000}")
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> pendingEvents = outboxEventRepository.findByPublishedFalse();

        for (OutboxEvent outboxEvent : pendingEvents) {
            publish(outboxEvent);
            outboxEvent.markPublished();
        }
    }

    private void publish(OutboxEvent outboxEvent) {
        if ("inventory-reserved-topic".equals(outboxEvent.getTopic())) {
            inventoryEventProducer.publishReservedEvent(
                    read(outboxEvent.getPayload(), InventoryReservedEvent.class));
            return;
        }

        if ("inventory-failed-topic".equals(outboxEvent.getTopic())) {
            inventoryEventProducer.publishFailedEvent(
                    read(outboxEvent.getPayload(), InventoryReservationFailedEvent.class));
            return;
        }

        throw new IllegalStateException("Unsupported outbox topic: " + outboxEvent.getTopic());
    }

    private <T> T read(String payload, Class<T> type) {
        try {
            return objectMapper.readValue(payload, type);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to deserialize inventory outbox payload", exception);
        }
    }
}
