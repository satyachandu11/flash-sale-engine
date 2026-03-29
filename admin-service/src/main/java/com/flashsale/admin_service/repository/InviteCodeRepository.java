package com.flashsale.admin_service.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.flashsale.admin_service.entity.InviteCode;
import com.flashsale.admin_service.entity.InviteCodeStatus;

public interface InviteCodeRepository extends JpaRepository<InviteCode, UUID> {
    Optional<InviteCode> findByCodeHash(String codeHash);
    List<InviteCode> findAllByStatusOrderByCreatedAtDesc(InviteCodeStatus status);
    List<InviteCode> findAllByExpiresAtBeforeAndStatus(Instant expiresAt, InviteCodeStatus status);
}
