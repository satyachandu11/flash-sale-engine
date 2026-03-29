package com.flashsale.order_service.service;

import java.util.UUID;

import com.flashsale.order_service.dto.CreateOrderRequest;
import com.flashsale.order_service.dto.OrderResponse;
import com.flashsale.order_service.dto.OrderStatsResponse;

public interface OrderService {

    OrderResponse createOrder(String idempotencyKey, CreateOrderRequest request);

    OrderResponse getOrder(UUID orderId);

    OrderStatsResponse getStats(long sinceEpochMs);
}
