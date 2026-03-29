package com.flashsale.inventory_service.kafka;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.flashsale.inventory_service.event.InventoryReservationFailedEvent;
import com.flashsale.inventory_service.event.InventoryReservedEvent;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class InventoryEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void publishReservedEvent(InventoryReservedEvent event) {
        kafkaTemplate.send("inventory-reserved-topic", event.orderId().toString(), event);
    }

    public void publishFailedEvent(InventoryReservationFailedEvent event) {
        kafkaTemplate.send("inventory-failed-topic", event.orderId().toString(), event);
    }
}
