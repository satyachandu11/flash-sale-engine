package com.flashsale.admin_service.entity;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "managed_products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ManagedProduct {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "product_id", nullable = false, unique = true)
    private UUID productId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "default_top_up_quantity", nullable = false)
    private Integer defaultTopUpQuantity;
}
