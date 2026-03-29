package com.flashsale.admin_service.client;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.flashsale.admin_service.config.AdminProperties;
import com.flashsale.admin_service.dto.InventorySnapshotResponse;
import com.flashsale.admin_service.dto.StockTopUpRequest;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class InventoryAdminClient {

    private final RestClient.Builder restClientBuilder;
    private final AdminProperties adminProperties;

    public InventorySnapshotResponse topUpStock(StockTopUpRequest request) {
        return restClientBuilder.baseUrl(adminProperties.getInventory().getBaseUrl()).build()
                .post()
                .uri("/inventory/internal/top-ups")
                .header("X-Internal-Service-Secret", adminProperties.getInventory().getInternalSecret())
                .body(request)
                .retrieve()
                .body(InventorySnapshotResponse.class);
    }
}
