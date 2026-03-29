package com.flashsale.order_service.service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.order_service.entity.Order;
import com.flashsale.order_service.entity.OutboxEvent;
import com.flashsale.order_service.event.PaymentFailedEvent;
import com.flashsale.order_service.repository.OrderRepository;
import com.flashsale.order_service.repository.OutboxEventRepository;
import com.flashsale.order_service.sse.OrderStatusService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderTimeoutProcessor {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final OrderStatusService orderStatusService;
    private final ObjectMapper objectMapper;

    @Value("${order.timeout.created-seconds:30}")
    private long createdTimeoutSeconds;

    @Value("${order.timeout.inventory-reserved-seconds:30}")
    private long inventoryReservedTimeoutSeconds;

    @Scheduled(fixedDelayString = "${order.timeout.scan-fixed-delay-ms:5000}")
    @Transactional
    public void failTimedOutOrders() {
        failOrdersWaitingForInventory();
        failOrdersWaitingForPayment();
    }

    private void failOrdersWaitingForInventory() {
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(createdTimeoutSeconds);
        List<Order> timedOutOrders = orderRepository.findByStatusAndCreatedAtBefore("CREATED", cutoff);

        for (Order order : timedOutOrders) {
            String reason = "Timed out waiting for inventory service";
            order.markFailed(reason);
            orderStatusService.notify(order.getId(), "FAILED", reason);
            log.warn("Order {} failed after waiting too long in CREATED", order.getId());
        }
    }

    private void failOrdersWaitingForPayment() {
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(inventoryReservedTimeoutSeconds);
        List<Order> timedOutOrders = orderRepository.findByStatusAndUpdatedAtBefore("INVENTORY_RESERVED", cutoff);

        for (Order order : timedOutOrders) {
            String reason = "Timed out waiting for payment service";
            order.markPaymentFailed(reason);
            outboxEventRepository.save(new OutboxEvent("payment-failed-topic", toPayload(new PaymentFailedEvent(
                    UUID.randomUUID(),
                    order.getId(),
                    order.getProductId(),
                    order.getQuantity(),
                    reason,
                    Instant.now()))));
            orderStatusService.notify(order.getId(), "FAILED", reason);
            log.warn("Order {} failed after waiting too long in INVENTORY_RESERVED", order.getId());
        }
    }

    private String toPayload(PaymentFailedEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to serialize payment failed event", exception);
        }
    }
}
