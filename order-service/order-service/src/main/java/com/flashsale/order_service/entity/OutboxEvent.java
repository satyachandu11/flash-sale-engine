package com.flashsale.order_service.entity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "outbox_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OutboxEvent {
    
    @Id
    private UUID id;

    private String topic;

    @Column(columnDefinition = "TEXT")
    private String payload;

    private boolean published = false;

    private Instant createdAt = Instant.now();

    public OutboxEvent(String topic, String payload) {
        this.id = UUID.randomUUID();
        this.topic = topic;
        this.payload = payload;
    }

    public void markPublished() {
        this.published = true;
    }
}
