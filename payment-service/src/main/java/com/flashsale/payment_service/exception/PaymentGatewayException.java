package com.flashsale.payment_service.exception;

/**
 * Thrown when the external payment gateway returns an error or is unreachable.
 *
 * WHY a dedicated exception?
 * ---------------------------
 * The Circuit Breaker monitors method calls and counts them as "failures"
 * when they throw an exception. Without an exception, the circuit breaker
 * has no signal that something went wrong.
 *
 * We need to distinguish between two different failure types:
 *
 *   1. BUSINESS FAILURE (card declined, insufficient funds):
 *      → These are normal outcomes. The gateway worked correctly and said "no".
 *      → Should NOT count as circuit breaker failures.
 *      → Handled by publishing a PaymentFailedEvent (normal saga flow).
 *
 *   2. INFRASTRUCTURE FAILURE (gateway timeout, gateway down, 5xx error):
 *      → These mean the gateway itself is broken or overloaded.
 *      → SHOULD count as circuit breaker failures.
 *      → PaymentGatewayException signals this to Resilience4j.
 *
 * When enough PaymentGatewayExceptions pile up, the circuit OPENS and
 * future calls fail-fast without even trying to contact the gateway.
 */
public class PaymentGatewayException extends RuntimeException {

    public PaymentGatewayException(String message) {
        super(message);
    }
}
