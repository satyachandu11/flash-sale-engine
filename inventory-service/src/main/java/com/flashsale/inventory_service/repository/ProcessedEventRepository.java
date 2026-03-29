package com.flashsale.inventory_service.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.flashsale.inventory_service.entity.ProcessedEvent;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, UUID> {

}
