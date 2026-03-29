package com.flashsale.order_service.kafka;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.order_service.entity.Order;
import com.flashsale.order_service.entity.ProcessedEvent;
import com.flashsale.order_service.event.InventoryReservationFailedEvent;
import com.flashsale.order_service.event.InventoryReservedEvent;
import com.flashsale.order_service.event.PaymentFailedEvent;
import com.flashsale.order_service.repository.OrderRepository;
import com.flashsale.order_service.repository.OutboxEventRepository;
import com.flashsale.order_service.repository.ProcessedEventRepository;
import com.flashsale.order_service.sse.OrderStatusService;

import lombok.RequiredArgsConstructor;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class InventoryEventConsumer {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ProcessedEventRepository processedEventRepository;
    private final OrderStatusService orderStatusService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "inventory-reserved-topic", groupId = "order-service")
    @Transactional
    public void handleInventoryReserved(InventoryReservedEvent event) {

        if (processedEventRepository.existsById(event.eventId())) {
            return; // Idempotent
        }

        Order order = orderRepository.findById(event.orderId()).orElseThrow();

        if ("FAILED".equals(order.getStatus())) {
            processedEventRepository.save(new ProcessedEvent(event.eventId()));
            publishCompensation(order, "Inventory reserved after order had already timed out");
            return;
        }

        // Out-of-order delivery guard: payment-completed arrived and processed before this
        // inventory-reserved message. Order is already settled — nothing to do.
        if ("COMPLETED".equals(order.getStatus())) {
            processedEventRepository.save(new ProcessedEvent(event.eventId()));
            return;
        }

        order.markInventoryReserved();
        orderRepository.save(order);

        processedEventRepository.save(new ProcessedEvent(event.eventId()));

        // Push intermediate status update — frontend can show "Inventory reserved, processing payment..."
        orderStatusService.notify(order.getId(), "INVENTORY_RESERVED", null);
    }

    @KafkaListener(topics = "inventory-failed-topic", groupId = "order-service")
    @Transactional
    public void handleInventoryFailed(InventoryReservationFailedEvent event) {

        if (processedEventRepository.existsById(event.eventId())) {
            return;
        }

        Order order = orderRepository.findById(event.orderId()).orElseThrow();

        if ("FAILED".equals(order.getStatus())) {
            processedEventRepository.save(new ProcessedEvent(event.eventId()));
            return;
        }

        order.markFailed(event.reason());
        orderRepository.save(order);

        processedEventRepository.save(new ProcessedEvent(event.eventId()));

        // Push terminal failure status to browser
        orderStatusService.notify(order.getId(), "FAILED", event.reason());
    }

    private void publishCompensation(Order order, String reason) {
        try {
            outboxEventRepository.save(new com.flashsale.order_service.entity.OutboxEvent(
                    "payment-failed-topic",
                    objectMapper.writeValueAsString(new PaymentFailedEvent(
                            java.util.UUID.randomUUID(),
                            order.getId(),
                            order.getProductId(),
                            order.getQuantity(),
                            reason,
                            java.time.Instant.now()))));
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to serialize payment failed compensation event", exception);
        }
    }
}
