package com.flashsale.admin_service.dto;

import java.time.Instant;
import java.util.UUID;

public record PublicSessionResponse(
        UUID inviteId,
        String name,
        String email,
        Instant createdAt,
        Instant expiresAt) {
}
