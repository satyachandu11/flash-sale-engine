package com.flashsale.admin_service.controller;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flashsale.admin_service.dto.StockTopUpRequest;
import com.flashsale.admin_service.dto.StockTopUpResponse;
import com.flashsale.admin_service.service.StockTopUpService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@Validated
@RestController
@RequestMapping("/admin/stock")
@RequiredArgsConstructor
public class AdminStockController {

    private final StockTopUpService stockTopUpService;

    @PostMapping("/top-ups")
    public StockTopUpResponse topUpStock(@Valid @RequestBody StockTopUpRequest request) {
        return stockTopUpService.topUp(request);
    }
}
