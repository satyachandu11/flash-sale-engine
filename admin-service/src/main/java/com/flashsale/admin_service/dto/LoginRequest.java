package com.flashsale.admin_service.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "must not be blank") String username,
        @NotBlank(message = "must not be blank") String password) {
}
