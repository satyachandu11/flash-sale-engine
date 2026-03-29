package com.flashsale.admin_service.session;

import java.time.Instant;

public record AdminSessionPayload(
        String username,
        Instant createdAt,
        Instant expiresAt) {
}
