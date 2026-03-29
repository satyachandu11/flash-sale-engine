package com.flashsale.order_service.ratelimit;

/**
 * Thrown when a user exceeds their allowed request rate.
 * Caught by the controller to return HTTP 429 Too Many Requests.
 */
public class RateLimitExceededException extends RuntimeException {

    public RateLimitExceededException(String message) {
        super(message);
    }
}
