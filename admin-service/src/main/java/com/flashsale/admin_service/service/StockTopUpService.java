package com.flashsale.admin_service.service;

import org.springframework.stereotype.Service;

import com.flashsale.admin_service.client.InventoryAdminClient;
import com.flashsale.admin_service.dto.InventorySnapshotResponse;
import com.flashsale.admin_service.dto.ManagedProductResponse;
import com.flashsale.admin_service.dto.StockTopUpRequest;
import com.flashsale.admin_service.dto.StockTopUpResponse;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class StockTopUpService {

    private final ProductCatalogService productCatalogService;
    private final InventoryAdminClient inventoryAdminClient;

    public StockTopUpResponse topUp(StockTopUpRequest request) {
        ManagedProductResponse product = productCatalogService.getProduct(request.productId());
        InventorySnapshotResponse inventory = inventoryAdminClient.topUpStock(request);
        return new StockTopUpResponse(product, inventory);
    }
}
