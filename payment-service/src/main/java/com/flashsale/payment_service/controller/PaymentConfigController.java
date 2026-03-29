package com.flashsale.payment_service.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flashsale.payment_service.config.PaymentGatewaySettings;
import com.flashsale.payment_service.dto.PaymentConfigResponse;
import com.flashsale.payment_service.dto.UpdatePaymentFailureRateRequest;

import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/payment/config")
@RequiredArgsConstructor
public class PaymentConfigController {

    private final PaymentGatewaySettings paymentGatewaySettings;
    private final CircuitBreakerRegistry circuitBreakerRegistry;

    @GetMapping
    public ResponseEntity<PaymentConfigResponse> getConfig() {
        return ResponseEntity.ok(currentConfig());
    }

    @PostMapping("/failure-rate")
    public ResponseEntity<PaymentConfigResponse> updateFailureRate(
            @RequestBody UpdatePaymentFailureRateRequest request) {
        if (request.failureRate() == null) {
            throw new IllegalArgumentException("failureRate is required");
        }

        paymentGatewaySettings.updateFailureRate(request.failureRate());
        return ResponseEntity.ok(currentConfig());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleValidationError(IllegalArgumentException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(exception.getMessage());
    }

    private PaymentConfigResponse currentConfig() {
        String circuitState = circuitBreakerRegistry.circuitBreaker("paymentGateway")
                .getState()
                .name();
        return new PaymentConfigResponse(paymentGatewaySettings.getFailureRate(), circuitState);
    }
}
