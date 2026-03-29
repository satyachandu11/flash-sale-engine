export const ORDER_API_BASE_URL = import.meta.env.VITE_ORDER_API_BASE_URL ?? "http://localhost:8080";
export const INVENTORY_API_BASE_URL = import.meta.env.VITE_INVENTORY_API_BASE_URL ?? "http://localhost:8081";
export const PAYMENT_API_BASE_URL = import.meta.env.VITE_PAYMENT_API_BASE_URL ?? "http://localhost:8082";
export const GRAFANA_URL = import.meta.env.VITE_GRAFANA_URL ?? "http://localhost:3000";

export const HEALTH_ENDPOINTS = {
  order: `${ORDER_API_BASE_URL}/actuator/health`,
  inventory: `${INVENTORY_API_BASE_URL}/actuator/health`,
  payment: `${PAYMENT_API_BASE_URL}/actuator/health`
};

export const DEMO_PRODUCT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
export const BAD_PRODUCT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c6";

export const SAMPLE_LIMIT = 20;
export const TOKEN_RENDER_LIMIT = 16;
export const RECENT_FEED_LIMIT = 40;
export const LIVE_EVENT_LIMIT = 60;
export const SESSION_HISTORY_LIMIT = 24;
export const ORDER_POLL_INTERVAL_MS = 2500;
export const HEALTH_POLL_INTERVAL_MS = 5000;
export const INVENTORY_POLL_INTERVAL_MS = 1800;
export const PAYMENT_CONFIG_POLL_INTERVAL_MS = 2500;
export const SESSION_TICK_MS = 1000;
export const SESSION_STATS_POLL_INTERVAL_MS = 2000;

export const PRESETS = [
  {
    id: "normal-load",
    name: "Normal Load",
    subtitle: "Mission control baseline",
    color: "#59f0c2",
    mission: "120 fans try to buy concert tickets at the same moment. Watch the engine handle the surge without breaking.",
    config: {
      totalOrders: 120,
      concurrency: 16,
      virtualUsers: 64,
      quantity: 1,
      productId: DEMO_PRODUCT_ID,
      paceMs: 70,
      failureRate: 0.2
    }
  },
  {
    id: "inventory-pressure",
    name: "Inventory Pressure",
    subtitle: "Deplete stock in view",
    color: "#ffb347",
    mission: "260 orders compete for 100 tickets. Stock depletes in real time — watch the last ticket sell out.",
    config: {
      totalOrders: 260,
      concurrency: 22,
      virtualUsers: 48,
      quantity: 1,
      productId: DEMO_PRODUCT_ID,
      paceMs: 48,
      failureRate: 0.25
    }
  },
  {
    id: "payment-failures",
    name: "Payment Failures",
    subtitle: "Trip the breaker",
    color: "#ff7a93",
    mission: "75% of payments will fail. The circuit breaker trips open within seconds — watch it cut losses and recover automatically.",
    config: {
      totalOrders: 180,
      concurrency: 18,
      virtualUsers: 32,
      quantity: 1,
      productId: DEMO_PRODUCT_ID,
      paceMs: 60,
      failureRate: 0.75
    }
  },
  {
    id: "rate-limit",
    name: "Rate Limit Burst",
    subtitle: "Overheat a tiny pilot pool",
    color: "#7aa6ff",
    mission: "4 users fire 90 rapid requests. Redis blocks each one after 10 requests per minute — fair queuing in action.",
    config: {
      totalOrders: 90,
      concurrency: 12,
      virtualUsers: 4,
      quantity: 1,
      productId: DEMO_PRODUCT_ID,
      paceMs: 25,
      failureRate: 0.2
    }
  }
];

export const STATUS_META = {
  QUEUED: { label: "Waiting to launch", tone: "neutral" },
  SUBMITTED: { label: "Sent to order service", tone: "neutral" },
  CREATED: { label: "Order accepted — in saga", tone: "neutral" },
  INVENTORY_RESERVED: { label: "Stock secured — charging card...", tone: "warning" },
  COMPLETED: { label: "Ticket secured!", tone: "success" },
  FAILED: { label: "Order failed", tone: "danger" },
  RATE_LIMITED: { label: "Too many requests — blocked", tone: "danger" },
  TIMED_OUT: { label: "Request timed out", tone: "danger" }
};

export const TOPOLOGY_STAGES = [
  { key: "request", label: "Order Intake", caption: "POST /orders + outbox", position: 10 },
  { key: "inventory", label: "Inventory Lock", caption: "reserve / fail", position: 40 },
  { key: "payment", label: "Payment Gateway", caption: "charge / breaker", position: 68 },
  { key: "result", label: "Resolution", caption: "complete / fail / compensate", position: 90 }
];
