package com.flashsale.admin_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record CreateInviteRequestRequest(
        @NotBlank(message = "must not be blank") String name,
        @Email(message = "must be a valid email") @NotBlank(message = "must not be blank") String email) {
}
