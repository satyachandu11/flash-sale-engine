package com.flashsale.admin_service.session;

import java.time.Instant;
import java.util.UUID;

public record PublicSessionPayload(
        UUID inviteId,
        String name,
        String email,
        Instant createdAt,
        Instant expiresAt) {
}
