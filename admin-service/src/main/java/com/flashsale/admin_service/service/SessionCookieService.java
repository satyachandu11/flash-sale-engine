package com.flashsale.admin_service.service;

import java.time.Duration;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import com.flashsale.admin_service.config.AdminProperties;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class SessionCookieService {

    private final AdminProperties adminProperties;

    public ResponseCookie buildAdminCookie(String token, Duration ttl) {
        return buildCookie(adminProperties.getCookie().getAdminCookieName(), token, ttl);
    }

    public ResponseCookie clearAdminCookie() {
        return buildCookie(adminProperties.getCookie().getAdminCookieName(), "", Duration.ZERO);
    }

    public ResponseCookie buildPublicCookie(String token, Duration ttl) {
        return buildCookie(adminProperties.getCookie().getPublicCookieName(), token, ttl);
    }

    public ResponseCookie clearPublicCookie() {
        return buildCookie(adminProperties.getCookie().getPublicCookieName(), "", Duration.ZERO);
    }

    private ResponseCookie buildCookie(String name, String value, Duration ttl) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(adminProperties.getCookie().isSecure())
                .path("/")
                .sameSite(adminProperties.getCookie().getSameSite())
                .maxAge(ttl)
                .build();
    }
}
