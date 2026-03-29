package com.flashsale.order_service.kafka;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.flashsale.order_service.event.PaymentFailedEvent;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class PaymentFailedEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void publish(PaymentFailedEvent event) {
        kafkaTemplate.send("payment-failed-topic", event.orderId().toString(), event);
    }
}
