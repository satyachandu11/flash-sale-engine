package com.flashsale.payment_service.service;

import java.util.UUID;

public interface PaymentService {
    void processPayment(UUID orderId, UUID productId, Integer quantity);
}
