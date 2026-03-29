package com.flashsale.admin_service.service;

import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.admin_service.config.AdminProperties;
import com.flashsale.admin_service.dto.ManagedProductResponse;
import com.flashsale.admin_service.entity.ManagedProduct;
import com.flashsale.admin_service.repository.ManagedProductRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ProductCatalogService {

    private final ManagedProductRepository managedProductRepository;
    private final AdminProperties adminProperties;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seedManagedProducts() {
        for (AdminProperties.ManagedProductSeed seed : adminProperties.getManagedProducts()) {
            managedProductRepository.findByProductId(seed.getProductId())
                    .orElseGet(() -> managedProductRepository.save(
                            ManagedProduct.builder()
                                    .productId(seed.getProductId())
                                    .name(seed.getName())
                                    .description(seed.getDescription())
                                    .defaultTopUpQuantity(seed.getDefaultTopUpQuantity())
                                    .build()));
        }
    }

    @Transactional(readOnly = true)
    public List<ManagedProductResponse> listProducts() {
        return managedProductRepository.findAll()
                .stream()
                .sorted(Comparator.comparing(ManagedProduct::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ManagedProductResponse getProduct(UUID productId) {
        ManagedProduct product = managedProductRepository.findByProductId(productId)
                .orElseThrow(() -> new NoSuchElementException("Managed product not found: " + productId));
        return toResponse(product);
    }

    private ManagedProductResponse toResponse(ManagedProduct product) {
        return new ManagedProductResponse(
                product.getProductId(),
                product.getName(),
                product.getDescription(),
                product.getDefaultTopUpQuantity());
    }
}
