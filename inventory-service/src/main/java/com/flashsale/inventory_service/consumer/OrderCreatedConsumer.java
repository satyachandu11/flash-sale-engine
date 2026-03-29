package com.flashsale.inventory_service.consumer;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.inventory_service.entity.ProcessedEvent;
import com.flashsale.inventory_service.event.OrderCreatedEvent;
import com.flashsale.inventory_service.repository.ProcessedEventRepository;
import com.flashsale.inventory_service.service.InventoryService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreatedConsumer {

    private final InventoryService inventoryService;
    private final ProcessedEventRepository processedEventRepository;

    @KafkaListener(topics = "order-created-topic", groupId = "inventory-service")
    @Transactional
    public void handleOrderCreated(OrderCreatedEvent event) {
        if (processedEventRepository.existsById(event.eventId())) {
            return;
        }

        log.info("Received order created event: {}", event);
        inventoryService.reserveStock(
                event.orderId(),
                event.productId(),
                event.quantity());

        processedEventRepository.save(new ProcessedEvent(event.eventId()));
    }

}
