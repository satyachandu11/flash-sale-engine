package com.flashsale.order_service.sse;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.flashsale.order_service.repository.OrderRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Manages Server-Sent Event (SSE) connections for real-time order status updates.
 *
 * HOW IT WORKS:
 * -------------
 * 1. Frontend calls GET /orders/{orderId}/status-stream.
 * 2. subscribe() creates an SseEmitter and stores it in the emitters map.
 *    Spring holds the HTTP response open — no response is sent yet.
 * 3. A Kafka consumer (PaymentEventConsumer / InventoryEventConsumer) calls notify()
 *    after updating the order status in the database.
 * 4. notify() finds the emitter by orderId, pushes the status JSON to the browser,
 *    then closes the connection.
 *
 * THREAD SAFETY:
 * --------------
 * subscribe() runs on an HTTP thread (Tomcat worker).
 * notify()    runs on a Kafka consumer thread.
 * ConcurrentHashMap ensures safe concurrent access.
 * emitters.remove() is atomic — only one thread ever calls send() per emitter.
 *
 * EDGE CASE — order processed before frontend subscribed:
 * -------------------------------------------------------
 * If the saga completes extremely fast and the order is already COMPLETED/FAILED
 * by the time subscribe() is called, we immediately send the terminal status and close.
 * This prevents the frontend from waiting forever on a connection that will never fire.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderStatusService {

    private final OrderRepository orderRepository;

    // One SseEmitter per orderId waiting for a status update.
    private final Map<UUID, SseEmitter> emitters = new ConcurrentHashMap<>();

    /**
     * Called by GET /orders/{orderId}/status-stream.
     * Returns an SseEmitter — Spring keeps the HTTP connection open until
     * emitter.complete() is called (by notify) or the timeout expires.
     */
    public SseEmitter subscribe(UUID orderId) {
        SseEmitter emitter = new SseEmitter(120_000L); // 2-minute timeout

        // If order is already in a terminal state, respond immediately
        var order = orderRepository.findById(orderId);
        if (order.isPresent()) {
            String status = order.get().getStatus();
            if ("COMPLETED".equals(status) || "FAILED".equals(status)) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("order-status")
                            .data(Map.of("status", status), MediaType.APPLICATION_JSON));
                } catch (IOException e) {
                    log.warn("SSE immediate send failed for already-terminal order {}", orderId);
                }
                emitter.complete();
                return emitter;
            }
        }

        // Order still processing — park the emitter until notify() fires
        emitters.put(orderId, emitter);
        emitter.onCompletion(() -> emitters.remove(orderId));
        emitter.onTimeout(() -> emitters.remove(orderId));
        emitter.onError(e -> emitters.remove(orderId));
        return emitter;
    }

    /**
     * Called by Kafka consumers (PaymentEventConsumer, InventoryEventConsumer)
     * after updating the order status in the database.
     *
     * Pushes the new status to the browser over the open SSE connection, then closes it.
     * If no browser is subscribed (e.g. frontend is polling instead), this is a no-op.
     *
     * @param orderId  the order that changed state
     * @param status   new status string (e.g. "COMPLETED", "FAILED", "INVENTORY_RESERVED")
     * @param reason   failure reason for FAILED states, null otherwise
     */
    public void notify(UUID orderId, String status, String reason) {
        SseEmitter emitter = emitters.remove(orderId);
        if (emitter == null) {
            // Frontend not connected via SSE — no-op (polling may be used instead)
            log.debug("No SSE subscriber for order {} — status update not pushed", orderId);
            return;
        }

        try {
            Map<String, Object> data = (reason != null)
                    ? Map.of("status", status, "reason", reason)
                    : Map.of("status", status);

            emitter.send(SseEmitter.event()
                    .name("order-status")
                    .data(data, MediaType.APPLICATION_JSON));

            emitter.complete(); // Close the SSE connection
        } catch (IOException e) {
            log.warn("Failed to push SSE event for order {}: {}", orderId, e.getMessage());
            emitter.completeWithError(e);
        }
    }
}
