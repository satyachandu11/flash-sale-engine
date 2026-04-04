package com.flashsale.admin_service.service;

import java.time.Instant;
import java.time.ZoneId;
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

    private static final ZoneId INDIA_ZONE = ZoneId.of("Asia/Kolkata");
    private static final String BRAND_NAME = "Flash Sale Engine";
    private static final String ACCESS_SENDER_NAME = "Flash Sale Engine Access";
    private static final String ADMIN_SENDER_NAME = "Flash Sale Engine Admin";
    private static final String CREATOR_NAME = "Satya Chandu";
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a 'IST'")
            .withZone(INDIA_ZONE);

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
                "New Flash Sale access request from " + inviteRequest.getName(),
                ADMIN_SENDER_NAME,
                """
                <div style="background:#020712;margin:0;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;color:#d6e3f5;">
                  <div style="max-width:680px;margin:0 auto;border:1px solid rgba(255,255,255,0.08);border-radius:28px;overflow:hidden;background:
                    radial-gradient(circle at top, rgba(245,158,11,0.16), transparent 28%%),
                    radial-gradient(circle at bottom right, rgba(103,232,249,0.12), transparent 26%%),
                    linear-gradient(180deg, #07111d 0%%, #03070d 100%%);box-shadow:0 28px 80px rgba(0,0,0,0.38);">
                    <div style="padding:20px 24px 0 24px;">
                      <div style="display:inline-block;padding:8px 14px;border:1px solid rgba(245,158,11,0.22);border-radius:999px;background:rgba(245,158,11,0.10);color:#ffe1aa;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;">
                        Admin Alert
                      </div>
                    </div>

                    <div style="padding:24px;">
                      <p style="margin:0 0 10px 0;color:#fbbf24;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;">Access Queue</p>
                      <h1 style="margin:0;color:#ffffff;font-size:40px;line-height:1.02;font-weight:700;">
                        New invite request waiting.
                      </h1>
                      <p style="margin:18px 0 0 0;font-size:16px;line-height:1.75;color:#c7d2e4;">
                        A new visitor asked for access to %s. Review the request and approve it if you want to issue a new invite code.
                      </p>

                      <div style="margin-top:24px;padding:22px;border-radius:24px;border:1px solid rgba(245,158,11,0.16);background:linear-gradient(180deg, rgba(245,158,11,0.10), rgba(255,255,255,0.03));">
                        <p style="margin:0;color:#9db0c8;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;">Requester</p>
                        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
                          <div style="padding:16px;border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:rgba(2,6,23,0.65);">
                            <div style="color:#8ea2bb;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">Name</div>
                            <div style="margin-top:8px;color:#ffffff;font-size:18px;font-weight:700;line-height:1.5;">%s</div>
                          </div>
                          <div style="padding:16px;border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:rgba(2,6,23,0.65);">
                            <div style="color:#8ea2bb;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">Email</div>
                            <div style="margin-top:8px;color:#ffffff;font-size:16px;font-weight:700;line-height:1.5;">%s</div>
                          </div>
                        </div>
                        <p style="margin:14px 0 0 0;font-size:14px;line-height:1.7;color:#d6e3f5;">
                          Requested at <strong style="color:#ffffff;">%s</strong>.
                        </p>
                      </div>

                      <div style="margin-top:20px;padding:18px 20px;border-radius:24px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);">
                        <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">Recommended action</p>
                        <p style="margin:10px 0 0 0;color:#c7d2e4;font-size:14px;line-height:1.7;">
                          Open the admin dashboard, review the requester, and approve to generate an access code instantly.
                        </p>
                      </div>

                      <div style="margin-top:28px;text-align:center;">
                        <a href="%s" style="display:inline-block;padding:15px 24px;border-radius:999px;background:linear-gradient(180deg, rgba(245,158,11,0.28), rgba(245,158,11,0.16));border:1px solid rgba(245,158,11,0.28);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">
                          Open Admin Dashboard
                        </a>
                        <p style="margin:14px 0 0 0;color:#8ea2bb;font-size:12px;line-height:1.7;">
                          If the button does not work, open this link manually:<br />
                          <span style="color:#d6e3f5;">%s</span>
                        </p>
                      </div>

                      <div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
                        <p style="margin:0;color:#d6e3f5;font-size:14px;line-height:1.8;">
                          Keep the queue moving,<br />
                          <strong style="color:#ffffff;">%s</strong>
                        </p>
                        <p style="margin:8px 0 0 0;color:#8ea2bb;font-size:12px;line-height:1.7;">
                          Engineer behind this Flash Sale Engine
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                """.formatted(
                        BRAND_NAME,
                        escapeHtml(inviteRequest.getName()),
                        escapeHtml(inviteRequest.getEmail()),
                        FORMATTER.format(inviteRequest.getRequestedAt()),
                        escapeHtml(resolveAdminUiUrl()),
                        escapeHtml(resolveAdminUiUrl()),
                        escapeHtml(CREATOR_NAME)));
    }

    public void sendInviteApprovedEmail(InviteRequest inviteRequest, String inviteCode, Instant expiresAt) {
        String inviteCodeSafe = escapeHtml(inviteCode);
        String recipientName = escapeHtml(inviteRequest.getName());
        String expiresAtLabel = FORMATTER.format(expiresAt);
        String publicUiUrl = resolvePublicUiUrl();

        sendEmail(
                List.of(inviteRequest.getEmail()),
                "Flash Sale Engine access approved: your invite is ready.",
                ACCESS_SENDER_NAME,
                """
                <div style="background:#020712;margin:0;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;color:#d6e3f5;">
                  <div style="max-width:680px;margin:0 auto;border:1px solid rgba(255,255,255,0.08);border-radius:28px;overflow:hidden;background:
                    radial-gradient(circle at top, rgba(103,232,249,0.18), transparent 30%%),
                    radial-gradient(circle at bottom right, rgba(74,222,128,0.12), transparent 28%%),
                    linear-gradient(180deg, #07111d 0%%, #03070d 100%%);box-shadow:0 28px 80px rgba(0,0,0,0.38);">
                    <div style="padding:20px 24px 0 24px;">
                      <div style="display:inline-block;padding:8px 14px;border:1px solid rgba(103,232,249,0.22);border-radius:999px;background:rgba(103,232,249,0.10);color:#c9fbff;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;">
                        Flash Sale Engine Access
                      </div>
                    </div>

                    <div style="padding:24px;">
                      <p style="margin:0 0 10px 0;color:#7dd3fc;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;">Invite Approved</p>
                      <h1 style="margin:0;color:#ffffff;font-size:42px;line-height:0.98;font-weight:700;">
                        Your cockpit access is live.
                      </h1>
                      <p style="margin:18px 0 0 0;font-size:16px;line-height:1.75;color:#c7d2e4;">
                        Hello %s, your request made the cut. You now have a personal access code for the Flash Sale Engine simulation, where the dashboard shows live order flow, inventory pressure, service health, and backend observability in one place.
                      </p>

                      <div style="margin-top:24px;padding:22px;border-radius:24px;border:1px solid rgba(103,232,249,0.16);background:linear-gradient(180deg, rgba(103,232,249,0.10), rgba(255,255,255,0.03));">
                        <p style="margin:0;color:#9db0c8;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;">Your access code</p>
                        <div style="margin-top:12px;padding:18px 20px;border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:rgba(2,6,23,0.65);text-align:center;">
                          <span style="display:inline-block;font-size:30px;line-height:1.2;font-weight:800;letter-spacing:0.22em;color:#ffffff;">
                            %s
                          </span>
                        </div>
                        <p style="margin:14px 0 0 0;font-size:14px;line-height:1.7;color:#d6e3f5;">
                          This code stays active until <strong style="color:#ffffff;">%s</strong>.
                        </p>
                      </div>

                      <div style="margin-top:20px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
                        <div style="padding:14px 16px;border-radius:20px;border:1px solid rgba(74,222,128,0.18);background:rgba(74,222,128,0.08);">
                          <div style="color:#8cf5be;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Live Feed</div>
                          <div style="margin-top:8px;color:#ffffff;font-size:15px;font-weight:700;">Orders moving in real time</div>
                        </div>
                        <div style="padding:14px 16px;border-radius:20px;border:1px solid rgba(245,158,11,0.18);background:rgba(245,158,11,0.08);">
                          <div style="color:#ffd38b;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Payment Path</div>
                          <div style="margin-top:8px;color:#ffffff;font-size:15px;font-weight:700;">Failures, retries, breaker state</div>
                        </div>
                        <div style="padding:14px 16px;border-radius:20px;border:1px solid rgba(103,232,249,0.18);background:rgba(103,232,249,0.08);">
                          <div style="color:#b8f7ff;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Observability</div>
                          <div style="margin-top:8px;color:#ffffff;font-size:15px;font-weight:700;">Backend pulse and service health</div>
                        </div>
                      </div>

                      <div style="margin-top:24px;padding:18px 20px;border-radius:24px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);">
                        <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">Best viewed on desktop or laptop</p>
                        <p style="margin:10px 0 0 0;color:#c7d2e4;font-size:14px;line-height:1.7;">
                          The simulator is intentionally wide and information-dense so you can watch multiple backend systems react together. Open it on a larger screen for the full experience.
                        </p>
                      </div>

                      <div style="margin-top:28px;text-align:center;">
                        <a href="%s" style="display:inline-block;padding:15px 24px;border-radius:999px;background:linear-gradient(180deg, rgba(103,232,249,0.28), rgba(103,232,249,0.16));border:1px solid rgba(103,232,249,0.28);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">
                          Open Simulation
                        </a>
                        <p style="margin:14px 0 0 0;color:#8ea2bb;font-size:12px;line-height:1.7;">
                          If the button does not work, open this link manually:<br />
                          <span style="color:#d6e3f5;">%s</span>
                        </p>
                      </div>

                      <div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
                        <p style="margin:0;color:#d6e3f5;font-size:14px;line-height:1.8;">
                          See you inside,<br />
                          <strong style="color:#ffffff;">%s</strong>
                        </p>
                        <p style="margin:8px 0 0 0;color:#8ea2bb;font-size:12px;line-height:1.7;">
                          Engineer behind this Flash Sale Engine
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                """.formatted(
                        recipientName,
                        inviteCodeSafe,
                        expiresAtLabel,
                        escapeHtml(publicUiUrl),
                        escapeHtml(publicUiUrl),
                        escapeHtml(CREATOR_NAME)));
    }

    private void sendEmail(List<String> to, String subject, String senderName, String html) {
        if (!isConfigured()) {
            log.info("Skipping email '{}' because Resend is not configured", subject);
            return;
        }

        RestClient client = restClientBuilder.baseUrl(adminProperties.getEmail().getResendBaseUrl()).build();
        client.post()
                .uri("/emails")
                .header("Authorization", "Bearer " + adminProperties.getEmail().getResendApiKey())
                .body(Map.of(
                        "from", formatFromAddress(senderName),
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

    private String resolvePublicUiUrl() {
        if (adminProperties.getCorsAllowedOrigins() == null || adminProperties.getCorsAllowedOrigins().isEmpty()) {
            return "https://admin.fsengine.dev";
        }

        return adminProperties.getCorsAllowedOrigins().stream()
                .filter(origin -> origin != null && !origin.isBlank() && !origin.contains("5174"))
                .findFirst()
                .orElse("https://admin.fsengine.dev");
    }

    private String resolveAdminUiUrl() {
        if (adminProperties.getCorsAllowedOrigins() == null || adminProperties.getCorsAllowedOrigins().isEmpty()) {
            return "https://admin.fsengine.dev";
        }

        return adminProperties.getCorsAllowedOrigins().stream()
                .filter(origin -> origin != null && !origin.isBlank() && (origin.contains("5174") || origin.contains("admin")))
                .findFirst()
                .orElse("https://admin.fsengine.dev");
    }

    private String formatFromAddress(String senderName) {
        String configuredFrom = adminProperties.getEmail().getFromEmail();
        if (configuredFrom == null || configuredFrom.isBlank()) {
            return senderName;
        }
        if (configuredFrom.contains("<") && configuredFrom.contains(">")) {
            return configuredFrom;
        }
        return "%s <%s>".formatted(senderName, configuredFrom);
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
