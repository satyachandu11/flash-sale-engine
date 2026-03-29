package com.flashsale.payment_service.consumer;

import org.springframework.kafka.annotation.BackOff;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.payment_service.entity.ProcessedEvent;
import com.flashsale.payment_service.event.InventoryReservedEvent;
import com.flashsale.payment_service.exception.NonRetryableException;
import com.flashsale.payment_service.repository.ProcessedEventRepository;
import com.flashsale.payment_service.service.PaymentService;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class InventoryReservedEventConsumer {

    private final PaymentService paymentService;
    private final ProcessedEventRepository processedEventRepository;

    @RetryableTopic(attempts = "3", backOff = @BackOff(delay = 1000, multiplier = 2.0), dltTopicSuffix = ".DLT", exclude = NonRetryableException.class)
    @KafkaListener(topics = "inventory-reserved-topic", groupId = "payment-service-group")
    @Transactional
    public void consume(InventoryReservedEvent event) {

        if (processedEventRepository.existsById(event.eventId())) {
            return;
        }
        paymentService.processPayment(event.orderId(), event.productId(), event.quantity());
        processedEventRepository.save(new ProcessedEvent(event.eventId()));
    }
}
