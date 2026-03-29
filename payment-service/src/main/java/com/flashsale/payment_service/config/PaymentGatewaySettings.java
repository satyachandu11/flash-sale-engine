package com.flashsale.payment_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PaymentGatewaySettings {

    private volatile double failureRate;

    public PaymentGatewaySettings(@Value("${payment.gateway.failure-rate:0.2}") double initialFailureRate) {
        this.failureRate = normalize(initialFailureRate);
    }

    public double getFailureRate() {
        return failureRate;
    }

    public void updateFailureRate(double nextFailureRate) {
        this.failureRate = normalize(nextFailureRate);
    }

    private double normalize(double value) {
        if (value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException("failureRate must be between 0.0 and 1.0");
        }
        return value;
    }
}
