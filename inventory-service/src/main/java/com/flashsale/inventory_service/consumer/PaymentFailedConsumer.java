package com.flashsale.inventory_service.consumer;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.inventory_service.entity.ProcessedEvent;
import com.flashsale.inventory_service.event.PaymentFailedEvent;
import com.flashsale.inventory_service.repository.ProcessedEventRepository;
import com.flashsale.inventory_service.service.InventoryService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentFailedConsumer {

    private final InventoryService inventoryService;
    private final ProcessedEventRepository processedEventRepository;

    @KafkaListener(topics = "payment-failed-topic", groupId = "inventory-service")
    @Transactional
    public void handlePaymentFailed(PaymentFailedEvent event) {
        if (processedEventRepository.existsById(event.eventId())) {
            return;
        }

        log.info("Received payment failed event for order {}, releasing reserved stock", event.orderId());

        inventoryService.releaseReservedStock(
                event.orderId(),
                event.productId(),
                event.quantity());

        processedEventRepository.save(new ProcessedEvent(event.eventId()));
    }
}
