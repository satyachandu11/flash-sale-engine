package com.flashsale.admin_service.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flashsale.admin_service.config.AdminProperties;
import com.flashsale.admin_service.dto.ApproveInviteResponse;
import com.flashsale.admin_service.dto.InviteCodeResponse;
import com.flashsale.admin_service.dto.InviteRequestResponse;
import com.flashsale.admin_service.entity.InviteCode;
import com.flashsale.admin_service.entity.InviteCodeStatus;
import com.flashsale.admin_service.entity.InviteRequest;
import com.flashsale.admin_service.entity.InviteRequestStatus;
import com.flashsale.admin_service.repository.InviteCodeRepository;
import com.flashsale.admin_service.repository.InviteRequestRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class InviteService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final InviteRequestRepository inviteRequestRepository;
    private final InviteCodeRepository inviteCodeRepository;
    private final EmailService emailService;
    private final AdminProperties adminProperties;
    private final Clock clock;

    @Transactional
    public InviteRequestResponse createInviteRequest(String name, String email) {
        InviteRequest inviteRequest = InviteRequest.builder()
                .id(UUID.randomUUID())
                .name(normalizeName(name))
                .email(normalizeEmail(email))
                .status(InviteRequestStatus.PENDING)
                .requestedAt(Instant.now(clock))
                .build();

        InviteRequest savedRequest = inviteRequestRepository.save(inviteRequest);
        emailService.sendInviteRequestNotification(savedRequest);
        return toRequestResponse(savedRequest);
    }

    @Transactional(readOnly = true)
    public List<InviteRequestResponse> listInviteRequests(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) {
            return inviteRequestRepository.findAll(Sort.by(Sort.Direction.DESC, "requestedAt"))
                    .stream()
                    .map(this::toRequestResponse)
                    .toList();
        }

        InviteRequestStatus inviteRequestStatus = InviteRequestStatus.valueOf(status.toUpperCase(Locale.ROOT));
        return inviteRequestRepository.findAllByStatusOrderByRequestedAtAsc(inviteRequestStatus)
                .stream()
                .map(this::toRequestResponse)
                .toList();
    }

    @Transactional
    public ApproveInviteResponse approveInviteRequest(UUID requestId, String adminUsername) {
        InviteRequest inviteRequest = inviteRequestRepository.findById(requestId)
                .orElseThrow(() -> new NoSuchElementException("Invite request not found: " + requestId));

        if (inviteRequest.getStatus() != InviteRequestStatus.PENDING) {
            throw new IllegalStateException("Only pending invite requests can be approved");
        }

        Instant now = Instant.now(clock);
        Instant expiresAt = now.plus(Duration.ofHours(adminProperties.getInvite().getTtlHours()));
        String plainCode = generateInviteCode();

        InviteCode inviteCode = InviteCode.builder()
                .id(UUID.randomUUID())
                .requestId(inviteRequest.getId())
                .email(inviteRequest.getEmail())
                .codeHash(hashCode(plainCode))
                .codeLast4(last4(plainCode))
                .createdAt(now)
                .expiresAt(expiresAt)
                .status(InviteCodeStatus.ACTIVE)
                .redemptionCount(0)
                .build();

        inviteRequest.setStatus(InviteRequestStatus.APPROVED);
        inviteRequest.setReviewedAt(now);
        inviteRequest.setReviewedBy(adminUsername);

        inviteRequestRepository.save(inviteRequest);
        InviteCode savedInvite = inviteCodeRepository.save(inviteCode);
        try {
            emailService.sendInviteApprovedEmail(inviteRequest, plainCode, expiresAt);
        } catch (Exception e) {
            log.warn("Failed to send invite approved email to {}: {}", inviteRequest.getEmail(), e.getMessage());
        }

        return new ApproveInviteResponse(
                savedInvite.getId(),
                savedInvite.getEmail(),
                plainCode,
                savedInvite.getCodeLast4(),
                savedInvite.getExpiresAt(),
                savedInvite.getRedemptionCount(),
                savedInvite.getStatus().name());
    }

    @Transactional
    public InviteRequestResponse rejectInviteRequest(UUID requestId, String adminUsername) {
        InviteRequest inviteRequest = inviteRequestRepository.findById(requestId)
                .orElseThrow(() -> new NoSuchElementException("Invite request not found: " + requestId));

        if (inviteRequest.getStatus() != InviteRequestStatus.PENDING) {
            throw new IllegalStateException("Only pending invite requests can be rejected");
        }

        inviteRequest.setStatus(InviteRequestStatus.REJECTED);
        inviteRequest.setReviewedAt(Instant.now(clock));
        inviteRequest.setReviewedBy(adminUsername);
        return toRequestResponse(inviteRequestRepository.save(inviteRequest));
    }

    @Transactional(readOnly = true)
    public List<InviteCodeResponse> listInvites(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) {
            return inviteCodeRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt"))
                    .stream()
                    .map(this::toInviteResponse)
                    .toList();
        }

        InviteCodeStatus inviteCodeStatus = InviteCodeStatus.valueOf(status.toUpperCase(Locale.ROOT));
        return inviteCodeRepository.findAllByStatusOrderByCreatedAtDesc(inviteCodeStatus)
                .stream()
                .map(this::toInviteResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public String getRequesterName(UUID requestId) {
        return inviteRequestRepository.findById(requestId)
                .map(InviteRequest::getName)
                .orElse("");
    }

    @Transactional
    public InviteCode redeemInvite(String inviteCode) {
        String hashedCode = hashCode(inviteCode);
        InviteCode storedInvite = inviteCodeRepository.findByCodeHash(hashedCode)
                .orElseThrow(() -> new IllegalArgumentException("Invite code not found"));

        expireIfNeeded(storedInvite);
        if (storedInvite.getStatus() != InviteCodeStatus.ACTIVE) {
            throw new IllegalArgumentException("Invite code has expired");
        }

        storedInvite.setRedemptionCount(storedInvite.getRedemptionCount() + 1);
        storedInvite.setLastRedeemedAt(Instant.now(clock));
        return inviteCodeRepository.save(storedInvite);
    }

    @Transactional
    @Scheduled(fixedDelayString = "${ADMIN_INVITE_EXPIRY_RECONCILE_FIXED_DELAY_MS:60000}")
    public void reconcileExpiredInvites() {
        Instant now = Instant.now(clock);
        List<InviteCode> expiredInvites = inviteCodeRepository.findAllByExpiresAtBeforeAndStatus(now, InviteCodeStatus.ACTIVE);
        for (InviteCode inviteCode : expiredInvites) {
            inviteCode.setStatus(InviteCodeStatus.EXPIRED);
        }
        if (!expiredInvites.isEmpty()) {
            inviteCodeRepository.saveAll(expiredInvites);
        }
    }

    private void expireIfNeeded(InviteCode inviteCode) {
        if (inviteCode.getExpiresAt().isAfter(Instant.now(clock))) {
            return;
        }
        inviteCode.setStatus(InviteCodeStatus.EXPIRED);
        inviteCodeRepository.save(inviteCode);
    }

    private InviteRequestResponse toRequestResponse(InviteRequest inviteRequest) {
        return new InviteRequestResponse(
                inviteRequest.getId(),
                inviteRequest.getName(),
                inviteRequest.getEmail(),
                inviteRequest.getStatus().name(),
                inviteRequest.getRequestedAt(),
                inviteRequest.getReviewedAt(),
                inviteRequest.getReviewedBy());
    }

    private InviteCodeResponse toInviteResponse(InviteCode inviteCode) {
        return new InviteCodeResponse(
                inviteCode.getId(),
                inviteCode.getRequestId(),
                inviteCode.getEmail(),
                inviteCode.getCodeLast4(),
                inviteCode.getCreatedAt(),
                inviteCode.getExpiresAt(),
                inviteCode.getStatus().name(),
                inviteCode.getRedemptionCount(),
                inviteCode.getLastRedeemedAt());
    }

    private String normalizeName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        return trimmed;
    }

    private String normalizeEmail(String email) {
        String trimmed = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }
        return trimmed;
    }

    private String generateInviteCode() {
        return "FS-" + randomBlock(4) + "-" + randomBlock(4);
    }

    private String randomBlock(int length) {
        StringBuilder builder = new StringBuilder(length);
        for (int index = 0; index < length; index += 1) {
            builder.append(ALPHABET[SECURE_RANDOM.nextInt(ALPHABET.length)]);
        }
        return builder.toString();
    }

    private String hashCode(String inviteCode) {
        String normalized = inviteCode == null ? "" : inviteCode.trim().toUpperCase(Locale.ROOT);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Invite code is required");
        }

        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private String last4(String inviteCode) {
        String normalized = inviteCode.trim().toUpperCase(Locale.ROOT);
        return normalized.substring(Math.max(0, normalized.length() - 4));
    }
}
