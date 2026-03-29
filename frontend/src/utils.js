import { BAD_PRODUCT_ID, DEMO_PRODUCT_ID, STATUS_META, TOPOLOGY_STAGES } from "./constants";

export function makeUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function formatCompact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);
}

export function formatPercent(value) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

export function formatDecimal(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function shortId(value, length = 8) {
  if (!value) return "pending";
  return value.slice(0, length);
}

export function statusLabel(status) {
  return STATUS_META[status]?.label ?? status;
}

export function toneForStatus(status) {
  return STATUS_META[status]?.tone ?? "neutral";
}

export function makeProductOptions() {
  return [
    { id: DEMO_PRODUCT_ID, label: "Demo Product", note: "Healthy stock for normal and breaker scenarios" },
    { id: BAD_PRODUCT_ID, label: "Broken Product", note: "Invalid inventory path for failure storytelling" }
  ];
}

export function summarizeFailureReason(reason) {
  return reason || "Awaiting downstream updates";
}

export function healthTone(status) {
  if (status === "UP") return "success";
  if (status === "CHECKING") return "neutral";
  return "danger";
}

export function circuitTone(status) {
  if (!status) return "neutral";
  if (status === "CLOSED") return "success";
  if (status === "HALF_OPEN") return "warning";
  return "danger";
}

export function inferFlowStage(status) {
  switch (status) {
    case "INVENTORY_RESERVED":
      return "inventory";
    case "COMPLETED":
      return "result";
    case "FAILED":
    case "TIMED_OUT":
    case "RATE_LIMITED":
      return "result";
    default:
      return "request";
  }
}

export function stagePosition(stage) {
  return TOPOLOGY_STAGES.find((item) => item.key === stage)?.position ?? 10;
}

export function makeVirtualUsers(count) {
  return Array.from({ length: Math.max(1, count) }, () => makeUuid());
}

export function buildHealthCard(id, label) {
  return { id, label, status: "CHECKING", details: "Waiting for signal", checkedAt: null };
}

export function buildInventorySnapshot(productId) {
  return {
    productId,
    totalStock: 0,
    reservedStock: 0,
    availableStock: 0,
    loaded: false
  };
}

export function buildPaymentConfig(failureRate = 0.2, circuitState = "CHECKING") {
  return {
    failureRate,
    circuitState,
    checkedAt: null
  };
}

export function stockPercentage(snapshot) {
  if (!snapshot?.totalStock) return 0;
  return clamp((snapshot.availableStock / snapshot.totalStock) * 100, 0, 100);
}

export function progressPercentage(completed, total) {
  if (!total) return 0;
  return clamp((completed / total) * 100, 0, 100);
}
