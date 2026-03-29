package com.flashsale.admin_service.dto;

import jakarta.validation.constraints.NotBlank;

public record RedeemInviteRequest(
        @NotBlank(message = "must not be blank") String code) {
}
