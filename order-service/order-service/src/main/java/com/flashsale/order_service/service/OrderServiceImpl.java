package com.flashsale.order_service.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.order_service.dto.CreateOrderRequest;
import com.flashsale.order_service.dto.OrderResponse;
import com.flashsale.order_service.dto.OrderStatsResponse;
import com.flashsale.order_service.entity.Order;
import com.flashsale.order_service.entity.OutboxEvent;
import com.flashsale.order_service.event.OrderCreatedEvent;
import com.flashsale.order_service.ratelimit.RateLimitService;
import com.flashsale.order_service.repository.OrderRepository;
import com.flashsale.order_service.repository.OutboxEventRepository;

import lombok.RequiredArgsConstructor;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

        private final OrderRepository orderRepository;
        private final ObjectMapper objectMapper;
        private final OutboxEventRepository outboxEventRepository;
        private final RateLimitService rateLimitService;

        @Override
        @Transactional
        public OrderResponse createOrder(String idempotencyKey, CreateOrderRequest request) {

                // Rate limit check — per userId.
                //
                // NOTE ON IDENTITY SOURCE:
                // Currently userId comes from the request body (no auth yet).
                // This is fine for the simulation: the frontend controls all userIds.
                //
                // In a production system with authentication, userId would be extracted
                // from the verified JWT token (e.g. SecurityContextHolder.getContext()
                // .getAuthentication().getName()), NOT from the request body.
                // The rate limiting logic below stays exactly the same — only the
                // source of userId changes.
                //
                // Throws RateLimitExceededException → caught by controller → returns 429.
                rateLimitService.checkLimit(request.userId());

                // Idempotency Check
                return orderRepository.findByIdempotencyKey(idempotencyKey)
                                .map(existingOrder -> new OrderResponse(
                                                existingOrder.getId(),
                                                existingOrder.getStatus(),
                                                existingOrder.getAmount()))
                                .orElseGet(() -> createNewOrder(idempotencyKey, request));
        }

        private OrderResponse createNewOrder(String idempotencyKey, CreateOrderRequest request) {
                Order order = Order.builder()
                                .id(UUID.randomUUID())
                                .userId(request.userId())
                                .productId(request.productId())
                                .quantity(request.quantity())
                                .amount(calculateAmount(request.quantity()))
                                .status("CREATED")
                                .idempotencyKey(idempotencyKey)
                                .createdAt(LocalDateTime.now())
                                .updatedAt(LocalDateTime.now())
                                .build();

                Order savedOrder = orderRepository.save(order);

                // Kafka Event Publish
                // orderEventProducer.publishOrderCreatedEvent(
                //                 savedOrder.getId(),
                //                 savedOrder.getUserId(),
                //                 savedOrder.getProductId(),
                //                 savedOrder.getQuantity(),
                //                 savedOrder.getAmount());

                OrderCreatedEvent event = new OrderCreatedEvent(
                        UUID.randomUUID(),
                        savedOrder.getId(),
                        savedOrder.getUserId(),
                        savedOrder.getProductId(),
                        savedOrder.getQuantity(),
                        savedOrder.getAmount(),
                        Instant.now()
                );

                String payload = toPayload(event);

                outboxEventRepository.save(
                        new OutboxEvent("order-created-topic", payload)
                );

                return new OrderResponse(
                                savedOrder.getId(),
                                savedOrder.getStatus(),
                                savedOrder.getAmount());
        }

        @Override
        public OrderResponse getOrder(UUID orderId) {
                Order order = orderRepository.findById(orderId)
                                .orElseThrow(() -> new NoSuchElementException("Order not found: " + orderId));
                return new OrderResponse(order.getId(), order.getStatus(), order.getAmount());
        }

        @Override
        public OrderStatsResponse getStats(long sinceEpochMs) {
                LocalDateTime since = LocalDateTime.ofInstant(
                                Instant.ofEpochMilli(sinceEpochMs), ZoneId.systemDefault());
                List<Object[]> rows = orderRepository.countByStatusSince(since);

                Map<String, Long> counts = new HashMap<>();
                for (Object[] row : rows) {
                        counts.put((String) row[0], (Long) row[1]);
                }

                long created = counts.getOrDefault("CREATED", 0L);
                long inventoryReserved = counts.getOrDefault("INVENTORY_RESERVED", 0L);
                long completed = counts.getOrDefault("COMPLETED", 0L);
                long failed = counts.getOrDefault("FAILED", 0L);
                long timedOut = counts.getOrDefault("TIMED_OUT", 0L);
                long rateLimited = counts.getOrDefault("RATE_LIMITED", 0L);
                long inFlight = created + inventoryReserved;
                long total = inFlight + completed + failed + timedOut + rateLimited;

                return new OrderStatsResponse(total, created, inventoryReserved,
                                completed, failed, timedOut, rateLimited, inFlight);
        }

        private BigDecimal calculateAmount(Integer quantity) {

                return BigDecimal.valueOf(999).multiply(BigDecimal.valueOf(quantity));
        }

        private String toPayload(OrderCreatedEvent event) {
                try {
                        return objectMapper.writeValueAsString(event);
                } catch (JacksonException exception) {
                        throw new IllegalStateException("Failed to serialize order created event", exception);
                }
        }
}
