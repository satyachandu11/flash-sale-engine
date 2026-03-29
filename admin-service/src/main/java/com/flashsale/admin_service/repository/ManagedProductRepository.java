package com.flashsale.admin_service.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.flashsale.admin_service.entity.ManagedProduct;

public interface ManagedProductRepository extends JpaRepository<ManagedProduct, UUID> {
    Optional<ManagedProduct> findByProductId(UUID productId);
}
