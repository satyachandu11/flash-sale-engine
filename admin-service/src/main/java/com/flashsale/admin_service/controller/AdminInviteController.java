package com.flashsale.admin_service.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flashsale.admin_service.config.AdminAuthInterceptor;
import com.flashsale.admin_service.dto.ApproveInviteResponse;
import com.flashsale.admin_service.dto.InviteCodeResponse;
import com.flashsale.admin_service.dto.InviteRequestResponse;
import com.flashsale.admin_service.dto.ManagedProductResponse;
import com.flashsale.admin_service.service.InviteService;
import com.flashsale.admin_service.service.ProductCatalogService;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminInviteController {

    private final InviteService inviteService;
    private final ProductCatalogService productCatalogService;

    @GetMapping("/invite-requests")
    public List<InviteRequestResponse> listInviteRequests(
            @RequestParam(defaultValue = "PENDING") String status) {
        return inviteService.listInviteRequests(status);
    }

    @PostMapping("/invite-requests/{id}/approve")
    public ApproveInviteResponse approveInviteRequest(
            @PathVariable UUID id,
            HttpServletRequest request) {
        return inviteService.approveInviteRequest(id, adminUsername(request));
    }

    @PostMapping("/invite-requests/{id}/reject")
    public InviteRequestResponse rejectInviteRequest(
            @PathVariable UUID id,
            HttpServletRequest request) {
        return inviteService.rejectInviteRequest(id, adminUsername(request));
    }

    @GetMapping("/invites")
    public List<InviteCodeResponse> listInvites(
            @RequestParam(defaultValue = "ACTIVE") String status) {
        return inviteService.listInvites(status);
    }

    @GetMapping("/products")
    public List<ManagedProductResponse> listManagedProducts() {
        return productCatalogService.listProducts();
    }

    private String adminUsername(HttpServletRequest request) {
        Object attribute = request.getAttribute(AdminAuthInterceptor.ADMIN_USERNAME_ATTRIBUTE);
        return attribute == null ? "admin" : attribute.toString();
    }
}
