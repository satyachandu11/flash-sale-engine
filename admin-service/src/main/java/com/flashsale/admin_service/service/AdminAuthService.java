package com.flashsale.admin_service.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.stereotype.Service;

import com.flashsale.admin_service.config.AdminProperties;
import com.flashsale.admin_service.dto.LoginRequest;
import com.flashsale.admin_service.session.CreatedAdminSession;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AdminAuthService {

    private final AdminProperties adminProperties;
    private final SessionService sessionService;

    public CreatedAdminSession login(LoginRequest request) {
        if (!matches(adminProperties.getAuth().getUsername(), request.username())
                || !matches(adminProperties.getAuth().getPassword(), request.password())) {
            throw new IllegalArgumentException("Invalid admin credentials");
        }
        return sessionService.createAdminSession(request.username());
    }

    private boolean matches(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
