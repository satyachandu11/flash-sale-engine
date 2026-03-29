package com.flashsale.admin_service.config;

import java.io.IOException;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.flashsale.admin_service.service.SessionService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String ADMIN_USERNAME_ATTRIBUTE = "adminUsername";

    private final SessionService sessionService;
    private final ObjectMapper objectMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        String token = sessionService.readCookie(request, sessionService.adminCookieName());
        return sessionService.readAdminSession(token)
                .map(session -> {
                    request.setAttribute(ADMIN_USERNAME_ATTRIBUTE, session.username());
                    return true;
                })
                .orElseGet(() -> {
                    writeUnauthorized(response);
                    return false;
                });
    }

    private void writeUnauthorized(HttpServletResponse response) {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        try {
            objectMapper.writeValue(response.getWriter(), Map.of("message", "Admin authentication required"));
        } catch (IOException ignored) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }
}
