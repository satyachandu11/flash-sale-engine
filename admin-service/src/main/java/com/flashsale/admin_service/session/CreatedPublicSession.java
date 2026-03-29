package com.flashsale.admin_service.session;

import java.time.Duration;

public record CreatedPublicSession(
        String token,
        PublicSessionPayload payload,
        Duration ttl) {
}
