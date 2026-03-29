package com.flashsale.payment_service.exception;

public class NonRetryableException extends RuntimeException {
    
    public NonRetryableException(String message) {
        super(message);
    }
}
