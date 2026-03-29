package com.flashsale.order_service.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    private UUID id;

    private UUID userId;
    private UUID productId;
    private Integer quantity;
    private BigDecimal amount;

    private String status;

    @Column(unique = true)
    private String idempotencyKey;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // --- State Transitions Methods ---

    public void markInventoryReserved() {
        if (!"CREATED".equals(this.status)) {
            throw new IllegalStateException(
                    "Inventory can be reserved only when order is in CREATED state");
        }
        this.status = "INVENTORY_RESERVED";
        this.updatedAt = LocalDateTime.now();
    }

    public void markFailed(String reason) {
        this.status = "FAILED";
        this.updatedAt = LocalDateTime.now();
    }

    public void markCompleted() {
        // Allow INVENTORY_RESERVED (normal path) or CREATED (out-of-order Kafka delivery:
        // payment-completed arrived before inventory-reserved in the order-service consumer).
        // Both mean the saga finished successfully — inventory WAS reserved by payment-service.
        if (!"INVENTORY_RESERVED".equals(this.status) && !"CREATED".equals(this.status)) {
            throw new IllegalStateException(
                    "Order can be completed only after inventory is reserved");
        }
        this.status = "COMPLETED";
        this.updatedAt = LocalDateTime.now();
    }

    public void markPaymentFailed(String reason) {
        if ("COMPLETED".equals(this.status)) {
            throw new IllegalStateException(
                    "Completed order can't be marked as failed");
        }

        this.status = "FAILED";
        this.updatedAt = LocalDateTime.now();
    }
}
