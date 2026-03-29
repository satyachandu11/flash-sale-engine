package com.flashsale.inventory_service.controller;

import java.util.NoSuchElementException;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flashsale.inventory_service.dto.InventorySnapshotResponse;
import com.flashsale.inventory_service.dto.StockTopUpRequest;
import com.flashsale.inventory_service.service.InventoryService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryService inventoryService;

    @Value("${inventory.internal-service-secret:change-me}")
    private String internalServiceSecret;

    @GetMapping("/{productId}")
    public ResponseEntity<InventorySnapshotResponse> getInventory(@PathVariable UUID productId) {
        return ResponseEntity.ok(inventoryService.getInventorySnapshot(productId));
    }

    @PostMapping("/internal/top-ups")
    public ResponseEntity<InventorySnapshotResponse> topUpInventory(
            @RequestBody StockTopUpRequest request,
            @RequestHeader("X-Internal-Service-Secret") String providedSecret) {
        if (!internalServiceSecret.equals(providedSecret)) {
            throw new SecurityException("Invalid internal service secret");
        }
        return ResponseEntity.ok(inventoryService.addStock(request.productId(), request.quantity()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<String> handleNotFound(NoSuchElementException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(exception.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleBadRequest(IllegalArgumentException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(exception.getMessage());
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<String> handleUnauthorized(SecurityException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(exception.getMessage());
    }
}
