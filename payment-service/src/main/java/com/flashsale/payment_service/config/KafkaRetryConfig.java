package com.flashsale.payment_service.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.annotation.EnableKafkaRetryTopic;

@Configuration
@EnableKafka
@EnableKafkaRetryTopic
public class KafkaRetryConfig {

}
