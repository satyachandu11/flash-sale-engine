package com.flashsale.admin_service.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.flashsale.admin_service.config.AdminProperties;
import com.flashsale.admin_service.entity.InviteRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'")
            .withZone(ZoneOffset.UTC);

    private final RestClient.Builder restClientBuilder;
    private final AdminProperties adminProperties;

    public void sendInviteRequestNotification(InviteRequest inviteRequest) {
        String adminEmail = adminProperties.getEmail().getAdminNotificationEmail();
        if (adminEmail == null || adminEmail.isBlank()) {
            log.info("Skipping invite request notification email because ADMIN_NOTIFICATION_EMAIL is empty");
            return;
        }

        sendEmail(
                List.of(adminEmail),
                "New invite request: " + inviteRequest.getName(),
                """
                <h2>New invite request</h2>
                <p><strong>Name:</strong> %s</p>
                <p><strong>Email:</strong> %s</p>
                <p><strong>Requested At:</strong> %s</p>
                """.formatted(
                        escapeHtml(inviteRequest.getName()),
                        escapeHtml(inviteRequest.getEmail()),
                        FORMATTER.format(inviteRequest.getRequestedAt())));
    }

    public void sendInviteApprovedEmail(InviteRequest inviteRequest, String inviteCode, Instant expiresAt) {
        sendEmail(
                List.of(inviteRequest.getEmail()),
                "Your Flash Sale invite code",
                """
                <h2>Your invite is ready</h2>
                <p>Hello %s,</p>
                <p>Your invite code is:</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 0.15em;">%s</p>
                <p>This code is reusable until <strong>%s</strong>.</p>
                <p>Open the simulation site, enter the code, and you will be granted access for the same window.</p>
                """.formatted(
                        escapeHtml(inviteRequest.getName()),
                        escapeHtml(inviteCode),
                        FORMATTER.format(expiresAt)));
    }

    private void sendEmail(List<String> to, String subject, String html) {
        if (!isConfigured()) {
            log.info("Skipping email '{}' because Resend is not configured", subject);
            return;
        }

        RestClient client = restClientBuilder.baseUrl(adminProperties.getEmail().getResendBaseUrl()).build();
        client.post()
                .uri("/emails")
                .header("Authorization", "Bearer " + adminProperties.getEmail().getResendApiKey())
                .body(Map.of(
                        "from", adminProperties.getEmail().getFromEmail(),
                        "to", to,
                        "subject", subject,
                        "html", html))
                .retrieve()
                .toBodilessEntity();
    }

    private boolean isConfigured() {
        return adminProperties.getEmail().getResendApiKey() != null
                && !adminProperties.getEmail().getResendApiKey().isBlank()
                && adminProperties.getEmail().getFromEmail() != null
                && !adminProperties.getEmail().getFromEmail().isBlank();
    }

    private String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
