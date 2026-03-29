package com.flashsale.admin_service.dto;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record StockTopUpRequest(
        @NotNull(message = "is required") UUID productId,
        @NotNull(message = "is required") @Min(value = 1, message = "must be at least 1") Integer quantity) {
}
