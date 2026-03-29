package com.flashsale.admin_service.dto;

import java.time.Instant;
import java.util.UUID;

public record InviteRequestResponse(
        UUID id,
        String name,
        String email,
        String status,
        Instant requestedAt,
        Instant reviewedAt,
        String reviewedBy) {
}
