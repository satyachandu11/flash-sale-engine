package com.flashsale.inventory_service.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.flashsale.inventory_service.entity.Inventory;

import jakarta.persistence.LockModeType;

public interface InventoryRepository extends JpaRepository<Inventory, UUID> {
    Optional<Inventory> findByProductId(UUID productId);

    /**
     * Acquires a pessimistic write lock (SELECT ... FOR UPDATE) on the inventory row.
     * Used by reserveStock() and releaseReservedStock() to prevent concurrent threads
     * from reading stale stock values and producing OptimisticLockExceptions.
     *
     * The cache-aside pattern (InventoryCacheService) is fine for reads (UI snapshots),
     * but write operations must always go to the DB and hold the lock for the duration
     * of the transaction to guarantee correct stock counts under high concurrency.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Inventory i WHERE i.productId = :productId")
    Optional<Inventory> findByProductIdForUpdate(@Param("productId") UUID productId);
}
