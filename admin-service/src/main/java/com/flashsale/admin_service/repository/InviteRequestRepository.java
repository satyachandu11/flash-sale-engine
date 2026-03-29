package com.flashsale.admin_service.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.flashsale.admin_service.entity.InviteRequest;
import com.flashsale.admin_service.entity.InviteRequestStatus;

public interface InviteRequestRepository extends JpaRepository<InviteRequest, UUID> {
    List<InviteRequest> findAllByStatusOrderByRequestedAtAsc(InviteRequestStatus status);
}
