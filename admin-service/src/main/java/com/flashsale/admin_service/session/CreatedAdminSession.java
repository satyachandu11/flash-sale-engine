package com.flashsale.admin_service.session;

import java.time.Duration;

public record CreatedAdminSession(
        String token,
        AdminSessionPayload payload,
        Duration ttl) {
}
