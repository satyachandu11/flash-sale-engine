package com.flashsale.payment_service.consumer;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

import com.flashsale.payment_service.event.InventoryReservedEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryDLTConsumer {

    @KafkaListener(topics = "inventory-reserved-topic.DLT", groupId = "payment-service-dlt-group")
    public void listen(
        InventoryReservedEvent event,
        @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
        @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
        @Header(KafkaHeaders.OFFSET) long offset,
        @Header(KafkaHeaders.DLT_EXCEPTION_MESSAGE) String exceptionMessage
    ) {
        log.error("""
                DLT MESSAGE RECEIVED:
                EventId: {}
                OrderId: {}
                Topic: {}
                Partition: {}
                Offset: {}
                Exception: {}
                """,
                event.eventId(),
                event.orderId(),
                topic,
                partition,
                offset,
                exceptionMessage
        );

        // Here we can:
        // - Alert DevOps
        // - Store to DB
        // - Send email
        // - Trigger compensation

        // In real system:
        // 1) Store in dead_letter_table
        // 2) Trigger alert
        // 3) Send Slack / PagerDuty
    }
}
