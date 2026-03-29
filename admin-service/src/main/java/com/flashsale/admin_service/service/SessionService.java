package com.flashsale.admin_service.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.flashsale.admin_service.config.AdminProperties;
import com.flashsale.admin_service.session.AdminSessionPayload;
import com.flashsale.admin_service.session.CreatedAdminSession;
import com.flashsale.admin_service.session.CreatedPublicSession;
import com.flashsale.admin_service.session.PublicSessionPayload;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AdminProperties adminProperties;
    private final Clock clock;

    public CreatedAdminSession createAdminSession(String username) {
        Instant now = Instant.now(clock);
        Duration ttl = Duration.ofSeconds(adminProperties.getAuth().getSessionTtlSeconds());
        AdminSessionPayload payload = new AdminSessionPayload(username, now, now.plus(ttl));
        String token = generateToken();
        store(adminKey(token), payload, ttl);
        return new CreatedAdminSession(token, payload, ttl);
    }

    public CreatedPublicSession createPublicSession(UUID inviteId, String name, String email, Instant expiresAt) {
        Instant now = Instant.now(clock);
        Duration configuredTtl = Duration.ofSeconds(adminProperties.getInvite().getPublicSessionTtlSeconds());
        Duration inviteRemaining = Duration.between(now, expiresAt);
        Duration ttl = configuredTtl.compareTo(inviteRemaining) < 0 ? configuredTtl : inviteRemaining;
        if (ttl.isZero() || ttl.isNegative()) {
            throw new IllegalArgumentException("Invite has already expired");
        }

        PublicSessionPayload payload = new PublicSessionPayload(inviteId, name, email, now, now.plus(ttl));
        String token = generateToken();
        store(publicKey(token), payload, ttl);
        return new CreatedPublicSession(token, payload, ttl);
    }

    public Optional<AdminSessionPayload> readAdminSession(String token) {
        return read(adminKey(token), AdminSessionPayload.class);
    }

    public Optional<PublicSessionPayload> readPublicSession(String token) {
        return read(publicKey(token), PublicSessionPayload.class);
    }

    public void invalidateAdminSession(String token) {
        if (token != null && !token.isBlank()) {
            redisTemplate.delete(adminKey(token));
        }
    }

    public void invalidatePublicSession(String token) {
        if (token != null && !token.isBlank()) {
            redisTemplate.delete(publicKey(token));
        }
    }

    public String readCookie(HttpServletRequest request, String cookieName) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    public String adminCookieName() {
        return adminProperties.getCookie().getAdminCookieName();
    }

    public String publicCookieName() {
        return adminProperties.getCookie().getPublicCookieName();
    }

    private <T> Optional<T> read(String redisKey, Class<T> type) {
        if (redisKey == null) {
            return Optional.empty();
        }

        String payload = redisTemplate.opsForValue().get(redisKey);
        if (payload == null || payload.isBlank()) {
            return Optional.empty();
        }

        try {
            T session = objectMapper.readValue(payload, type);
            Instant expiresAt = extractExpiry(session);
            if (expiresAt.isBefore(Instant.now(clock))) {
                redisTemplate.delete(redisKey);
                return Optional.empty();
            }
            return Optional.of(session);
        } catch (JacksonException exception) {
            log.warn("Failed to deserialize session from Redis key {}", redisKey, exception);
            redisTemplate.delete(redisKey);
            return Optional.empty();
        }
    }

    private Instant extractExpiry(Object session) {
        if (session instanceof AdminSessionPayload adminSession) {
            return adminSession.expiresAt();
        }
        if (session instanceof PublicSessionPayload publicSession) {
            return publicSession.expiresAt();
        }
        throw new IllegalArgumentException("Unsupported session payload: " + session.getClass().getName());
    }

    private void store(String key, Object payload, Duration ttl) {
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(payload), ttl);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Failed to store session payload", exception);
        }
    }

    private String generateToken() {
        byte[] buffer = new byte[32];
        SECURE_RANDOM.nextBytes(buffer);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
    }

    private String adminKey(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        return "admin-session:" + token;
    }

    private String publicKey(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        return "public-session:" + token;
    }
}
