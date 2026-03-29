package com.flashsale.order_service.dto;

public record OrderStatsResponse(
        long total,
        long created,
        long inventoryReserved,
        long completed,
        long failed,
        long timedOut,
        long rateLimited,
        long inFlight
) {}
