package com.flashsale.order_service.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.flashsale.order_service.entity.Order;

public interface OrderRepository extends JpaRepository<Order, UUID> {
    Optional<Order> findByIdempotencyKey(String idempotencyKey);

    List<Order> findByStatusAndCreatedAtBefore(String status, LocalDateTime cutoff);

    List<Order> findByStatusAndUpdatedAtBefore(String status, LocalDateTime cutoff);

    @Query("SELECT o.status, COUNT(o) FROM Order o WHERE o.createdAt >= :since GROUP BY o.status")
    List<Object[]> countByStatusSince(@Param("since") LocalDateTime since);
}
