package com.flashsale.order_service.kafka;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.flashsale.order_service.event.OrderCreatedEvent;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class OrderEventProducer {

    private static final String TOPIC = "order-created-topic";

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void publishOrderCreatedEvent(OrderCreatedEvent event) {
        kafkaTemplate.send(TOPIC, event.orderId().toString(), event);
    }
}
