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

import com.flashsale.admin_service.dto.LoginRequest;
import com.flashsale.admin_service.service.AdminAuthService;
import com.flashsale.admin_service.service.SessionCookieService;
import com.flashsale.admin_service.service.SessionService;
import com.flashsale.admin_service.session.AdminSessionPayload;
import com.flashsale.admin_service.session.CreatedAdminSession;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@Validated
@RestController
@RequestMapping("/admin/auth")
@RequiredArgsConstructor
public class AdminAuthController {

    private final AdminAuthService adminAuthService;
    private final SessionService sessionService;
    private final SessionCookieService sessionCookieService;

    @PostMapping("/login")
    public ResponseEntity<AdminSessionPayload> login(@Valid @RequestBody LoginRequest request) {
        CreatedAdminSession session = adminAuthService.login(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessionCookieService.buildAdminCookie(session.token(), session.ttl()).toString())
                .body(session.payload());
    }

    @GetMapping("/session")
    public ResponseEntity<AdminSessionPayload> getSession(HttpServletRequest request) {
        String token = sessionService.readCookie(request, sessionService.adminCookieName());
        return sessionService.readAdminSession(token)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .header(HttpHeaders.SET_COOKIE, sessionCookieService.clearAdminCookie().toString())
                        .build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        String token = sessionService.readCookie(request, sessionService.adminCookieName());
        sessionService.invalidateAdminSession(token);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessionCookieService.clearAdminCookie().toString())
                .build();
    }
}
