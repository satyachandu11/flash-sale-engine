package com.flashsale.admin_service.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

@Configuration
@RequiredArgsConstructor
public class WebCorsConfig implements WebMvcConfigurer {

    private final AdminProperties adminProperties;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] allowedOrigins = adminProperties.getCorsAllowedOrigins().toArray(String[]::new);
        registry.addMapping("/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
