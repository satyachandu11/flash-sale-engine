package com.flashsale.payment_service.service;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.flashsale.payment_service.config.PaymentGatewaySettings;
import com.flashsale.payment_service.exception.PaymentGatewayException;
import com.flashsale.payment_service.kafka.PaymentEventProducer;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Payment Service with configurable failure rate — ideal for simulation demos.
 *
 * The failure rate is read from application.properties:
 *   payment.gateway.failure-rate=0.2  (20% failure, default)
 *
 * For your demo: set this to 0.7 to quickly trip the circuit breaker
 * and show the OPEN → HALF-OPEN → CLOSED recovery cycle visually.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentServiceImpl implements PaymentService {

    private final PaymentEventProducer eventProducer;
    private final PaymentGatewaySettings paymentGatewaySettings;

    @Override
    @CircuitBreaker(name = "paymentGateway", fallbackMethod = "handleGatewayFailure")
    public void processPayment(UUID orderId, UUID productId, Integer quantity) {
        callPaymentGateway(orderId, productId, quantity);
    }

    private void callPaymentGateway(UUID orderId, UUID productId, Integer quantity) {
        boolean paymentFailed = Math.random() < paymentGatewaySettings.getFailureRate();

        if (paymentFailed) {
            // Throws exception → @CircuitBreaker counts this as a failure.
            // After enough failures (≥50% of last 10 calls), circuit OPENS.
            throw new PaymentGatewayException("Payment gateway rejected the transaction");
        }

        log.info("Payment approved for orderId: {}", orderId);
        eventProducer.publishPaymentCompleted(orderId);
    }

    private void handleGatewayFailure(UUID orderId, UUID productId, Integer quantity, Exception ex) {
        if (ex instanceof CallNotPermittedException) {
            log.warn("Circuit OPEN — fast-fail for orderId: {}. Gateway not contacted.", orderId);
        } else {
            log.warn("Payment gateway error for orderId: {}. Reason: {}", orderId, ex.getMessage());
        }

        eventProducer.publishPaymentFailed(orderId, productId, quantity,
                ex instanceof CallNotPermittedException
                        ? "Payment service temporarily unavailable. Please retry."
                        : "Payment gateway declined the transaction.");
    }
}
