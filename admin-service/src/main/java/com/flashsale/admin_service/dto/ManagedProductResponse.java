package com.flashsale.admin_service.dto;

import java.util.UUID;

public record ManagedProductResponse(
        UUID productId,
        String name,
        String description,
        Integer defaultTopUpQuantity) {
}
