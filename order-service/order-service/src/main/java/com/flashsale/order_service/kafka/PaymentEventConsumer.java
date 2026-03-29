package com.flashsale.order_service.kafka;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.order_service.entity.Order;
import com.flashsale.order_service.entity.ProcessedEvent;
import com.flashsale.order_service.event.PaymentCompletedEvent;
import com.flashsale.order_service.event.PaymentFailedEvent;
import com.flashsale.order_service.repository.OrderRepository;
import com.flashsale.order_service.repository.ProcessedEventRepository;
import com.flashsale.order_service.sse.OrderStatusService;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class PaymentEventConsumer {

    private final OrderRepository orderRepository;
    private final ProcessedEventRepository processedEventRepository;
    private final OrderStatusService orderStatusService;

    @KafkaListener(topics = "payment-completed-topic", groupId = "order-service")
    @Transactional
    public void handlePaymentCompleted(PaymentCompletedEvent event) {

        if (processedEventRepository.existsById(event.eventId())) {
            return;
        }

        Order order = orderRepository.findById(event.orderId()).orElseThrow();

        if ("FAILED".equals(order.getStatus())) {
            processedEventRepository.save(new ProcessedEvent(event.eventId()));
            return;
        }

        order.markCompleted();
        orderRepository.save(order);

        processedEventRepository.save(new ProcessedEvent(event.eventId()));

        // Push real-time update to any subscribed SSE client
        orderStatusService.notify(order.getId(), "COMPLETED", null);
    }

    @KafkaListener(topics = "payment-failed-topic", groupId = "order-service")
    @Transactional
    public void handlePaymentFailed(PaymentFailedEvent event) {

        if (processedEventRepository.existsById(event.eventId())) {
            return;
        }

        Order order = orderRepository.findById(event.orderId()).orElseThrow();

        if ("FAILED".equals(order.getStatus())) {
            processedEventRepository.save(new ProcessedEvent(event.eventId()));
            return;
        }

        order.markPaymentFailed(event.reason());
        orderRepository.save(order);

        processedEventRepository.save(new ProcessedEvent(event.eventId()));

        // Push real-time update to any subscribed SSE client
        orderStatusService.notify(order.getId(), "FAILED", event.reason());
    }
}
