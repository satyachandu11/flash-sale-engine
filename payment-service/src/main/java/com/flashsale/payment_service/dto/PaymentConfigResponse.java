package com.flashsale.payment_service.dto;

public record PaymentConfigResponse(
        double failureRate,
        String circuitState) {
}
