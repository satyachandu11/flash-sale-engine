package com.flashsale.admin_service.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flashsale.admin_service.dto.CreateInviteRequestRequest;
import com.flashsale.admin_service.dto.InviteRequestResponse;
import com.flashsale.admin_service.dto.PublicSessionResponse;
import com.flashsale.admin_service.dto.RedeemInviteRequest;
import com.flashsale.admin_service.entity.InviteCode;
import com.flashsale.admin_service.service.InviteService;
import com.flashsale.admin_service.service.SessionCookieService;
import com.flashsale.admin_service.service.SessionService;
import com.flashsale.admin_service.session.CreatedPublicSession;
import com.flashsale.admin_service.session.PublicSessionPayload;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@Validated
@RestController
@RequestMapping("/public")
@RequiredArgsConstructor
public class PublicInviteController {

    private final InviteService inviteService;
    private final SessionService sessionService;
    private final SessionCookieService sessionCookieService;

    @PostMapping("/invite-requests")
    public ResponseEntity<InviteRequestResponse> createInviteRequest(
            @Valid @RequestBody CreateInviteRequestRequest request) {
        InviteRequestResponse response = inviteService.createInviteRequest(request.name(), request.email());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/invites/redeem")
    public ResponseEntity<PublicSessionResponse> redeemInvite(
            @Valid @RequestBody RedeemInviteRequest request) {
        InviteCode invite = inviteService.redeemInvite(request.code());
        String name = inviteService.getRequesterName(invite.getRequestId());
        CreatedPublicSession session = sessionService.createPublicSession(
                invite.getId(),
                name,
                invite.getEmail(),
                invite.getExpiresAt());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessionCookieService.buildPublicCookie(session.token(), session.ttl()).toString())
                .body(toResponse(session.payload()));
    }

    @GetMapping("/session")
    public ResponseEntity<PublicSessionResponse> getSession(HttpServletRequest request) {
        String token = sessionService.readCookie(request, sessionService.publicCookieName());
        return sessionService.readPublicSession(token)
                .map(payload -> ResponseEntity.ok(toResponse(payload)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .header(HttpHeaders.SET_COOKIE, sessionCookieService.clearPublicCookie().toString())
                        .build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        String token = sessionService.readCookie(request, sessionService.publicCookieName());
        sessionService.invalidatePublicSession(token);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessionCookieService.clearPublicCookie().toString())
                .build();
    }

    private PublicSessionResponse toResponse(PublicSessionPayload payload) {
        return new PublicSessionResponse(
                payload.inviteId(),
                payload.name(),
                payload.email(),
                payload.createdAt(),
                payload.expiresAt());
    }
}
