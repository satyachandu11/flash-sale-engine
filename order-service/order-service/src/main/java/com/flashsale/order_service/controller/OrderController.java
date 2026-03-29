package com.flashsale.order_service.controller;

import java.util.NoSuchElementException;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.flashsale.order_service.dto.CreateOrderRequest;
import com.flashsale.order_service.dto.OrderResponse;
import com.flashsale.order_service.dto.OrderStatsResponse;
import com.flashsale.order_service.ratelimit.RateLimitExceededException;
import com.flashsale.order_service.service.OrderService;
import com.flashsale.order_service.sse.OrderStatusService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;
    private final OrderStatusService orderStatusService;

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @RequestBody CreateOrderRequest request) {
        OrderResponse response = orderService.createOrder(idempotencyKey, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Returns the current status of an order.
     * Use this for polling or to check final state after an SSE connection closes.
     */
    @GetMapping("/{orderId}")
    public ResponseEntity<OrderResponse> getOrder(@PathVariable UUID orderId) {
        return ResponseEntity.ok(orderService.getOrder(orderId));
    }

    /**
     * Opens a real-time SSE stream for this order.
     *
     * The HTTP connection stays open. The server pushes a JSON event when the order
     * status changes (INVENTORY_RESERVED, COMPLETED, FAILED), then closes the connection.
     *
     * Frontend usage:
     *   const es = new EventSource('/orders/{orderId}/status-stream');
     *   es.addEventListener('order-status', e => {
     *     const data = JSON.parse(e.data);
     *     console.log(data.status, data.reason);
     *   });
     */
    @GetMapping(value = "/{orderId}/status-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamOrderStatus(@PathVariable UUID orderId) {
        return orderStatusService.subscribe(orderId);
    }

    /**
     * Returns aggregate status counts for all orders created since sinceEpochMs.
     * The frontend passes its session start time so results are scoped to the current run.
     *
     * Example: GET /orders/stats?since=1704067200000
     * Response: { total, created, inventoryReserved, completed, failed, timedOut, rateLimited, inFlight }
     */
    @GetMapping("/stats")
    public ResponseEntity<OrderStatsResponse> getStats(
            @RequestParam(defaultValue = "0") long since) {
        return ResponseEntity.ok(orderService.getStats(since));
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<String> handleRateLimit(RateLimitExceededException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(ex.getMessage());
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<String> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ex.getMessage());
    }
}
