package com.flashsale.admin_service.dto;

import java.time.Instant;
import java.util.UUID;

public record ApproveInviteResponse(
        UUID inviteId,
        String email,
        String inviteCode,
        String codeLast4,
        Instant expiresAt,
        Integer redemptionCount,
        String status) {
}
