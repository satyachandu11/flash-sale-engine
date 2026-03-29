package com.flashsale.admin_service.dto;

import java.time.Instant;
import java.util.UUID;

public record InviteCodeResponse(
        UUID id,
        UUID requestId,
        String email,
        String codeLast4,
        Instant createdAt,
        Instant expiresAt,
        String status,
        Integer redemptionCount,
        Instant lastRedeemedAt) {
}
