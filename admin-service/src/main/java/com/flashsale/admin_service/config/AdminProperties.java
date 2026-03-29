package com.flashsale.admin_service.config;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.context.properties.ConfigurationProperties;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@ConfigurationProperties(prefix = "admin")
public class AdminProperties {

    private List<String> corsAllowedOrigins = new ArrayList<>(List.of(
            "http://localhost:5173",
            "http://localhost:5174"));

    private final Cookie cookie = new Cookie();
    private final Invite invite = new Invite();
    private final Auth auth = new Auth();
    private final Email email = new Email();
    private final Inventory inventory = new Inventory();
    private List<ManagedProductSeed> managedProducts = new ArrayList<>(List.of(
            new ManagedProductSeed(
                    UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
                    "Demo Product",
                    "Shared stock pool for the main simulation site",
                    100)));

    @Getter
    @Setter
    public static class Cookie {
        @NotBlank
        private String publicCookieName = "public_access_session";

        @NotBlank
        private String adminCookieName = "admin_session";

        private boolean secure = false;
        private String sameSite = "Lax";
    }

    @Getter
    @Setter
    public static class Invite {
        @Min(1)
        private long ttlHours = 24;

        @Min(60)
        private long publicSessionTtlSeconds = 86400;
    }

    @Getter
    @Setter
    public static class Auth {
        @NotBlank
        private String username = "admin";

        @NotBlank
        private String password = "admin";

        @Min(300)
        private long sessionTtlSeconds = 28800;
    }

    @Getter
    @Setter
    public static class Email {
        private String resendApiKey = "";
        private String resendBaseUrl = "https://api.resend.com";
        private String fromEmail = "";
        private String adminNotificationEmail = "";
    }

    @Getter
    @Setter
    public static class Inventory {
        private String baseUrl = "http://localhost:8081";
        private String internalSecret = "change-me";
    }

    @Getter
    @Setter
    public static class ManagedProductSeed {
        private UUID productId;
        private String name;
        private String description;
        private Integer defaultTopUpQuantity;

        public ManagedProductSeed() {
        }

        public ManagedProductSeed(UUID productId, String name, String description, Integer defaultTopUpQuantity) {
            this.productId = productId;
            this.name = name;
            this.description = description;
            this.defaultTopUpQuantity = defaultTopUpQuantity;
        }
    }
}
