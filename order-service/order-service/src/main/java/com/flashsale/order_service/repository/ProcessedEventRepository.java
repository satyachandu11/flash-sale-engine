package com.flashsale.order_service.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.flashsale.order_service.entity.ProcessedEvent;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, UUID> {

}
