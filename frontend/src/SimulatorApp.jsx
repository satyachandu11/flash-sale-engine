import { AnimatePresence, motion } from "framer-motion";
import {
  Suspense,
  lazy,
  memo,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";

import CockpitErrorBoundary from "./components/CockpitErrorBoundary";
import {
  GRAFANA_URL,
  HEALTH_ENDPOINTS,
  HEALTH_POLL_INTERVAL_MS,
  INVENTORY_API_BASE_URL,
  INVENTORY_POLL_INTERVAL_MS,
  LIVE_EVENT_LIMIT,
  ORDER_API_BASE_URL,
  ORDER_POLL_INTERVAL_MS,
  PAYMENT_API_BASE_URL,
  PAYMENT_CONFIG_POLL_INTERVAL_MS,
  PRESETS,
  RECENT_FEED_LIMIT,
  SAMPLE_LIMIT,
  SESSION_HISTORY_LIMIT,
  SESSION_STATS_POLL_INTERVAL_MS,
  SESSION_TICK_MS,
  TOKEN_RENDER_LIMIT,
  TOPOLOGY_STAGES
} from "./constants";
import {
  buildHealthCard,
  buildInventorySnapshot,
  buildPaymentConfig,
  clamp,
  circuitTone,
  delay,
  formatCompact,
  formatDecimal,
  formatDuration,
  formatPercent,
  healthTone,
  inferFlowStage,
  makeProductOptions,
  makeUuid,
  makeVirtualUsers,
  progressPercentage,
  shortId,
  stagePosition,
  statusLabel,
  stockPercentage,
  summarizeFailureReason,
  toneForStatus
} from "./utils";

const ObservabilityRail = lazy(() => import("./components/ObservabilityRail"));

const INITIAL_COUNTERS = {
  queued: 0,
  submitted: 0,
  created: 0,
  reserved: 0,
  completed: 0,
  failed: 0,
  timedOut: 0,
  rateLimited: 0
};

const RUN_STATUS_META = {
  idle: { label: "Standby", tone: "neutral" },
  arming: { label: "Arming", tone: "warning" },
  running: { label: "Live", tone: "success" },
  complete: { label: "Complete", tone: "success" },
  depleted: { label: "Stock Zero", tone: "warning" },
  aborted: { label: "Aborted", tone: "danger" }
};

const TOUR_STEPS = [
  {
    id: "command-rail",
    eyebrow: "Mission Briefing 01",
    title: "Start with the scenario rail",
    detail: "Pick a preset or tune orders, parallel requests, virtual users, pace, and failure rate. This is where you shape the pressure test before launch."
  },
  {
    id: "battle-glass",
    eyebrow: "Mission Briefing 02",
    title: "Watch the saga in battle glass",
    detail: "These KPI cards summarize the run as it happens: launch volume, in-flight work, success rate, and failure rate."
  },
  {
    id: "outcome-deck",
    eyebrow: "Mission Briefing 03",
    title: "Read the story in the outcome deck",
    detail: "Outcome Feed, Live Events, and Selected Order turn the backend traffic into a readable timeline so you can inspect what happened to individual requests."
  },
  {
    id: "observability-rail",
    eyebrow: "Mission Briefing 04",
    title: "Use the observability rail as ground truth",
    detail: "This side rail shows service health, breaker state, inventory telemetry, and trend charts so the visuals are backed by real metrics."
  },
  {
    id: "cockpit-footer",
    eyebrow: "Mission Briefing 05",
    title: "Scan the footer for the quick state check",
    detail: "The footer keeps the essential summary in sight: stock sold, stock left, payment gateway state, and your active session."
  }
];

function buildConfigFromPreset(preset) {
  return { ...preset.config };
}

function createOrderRecord(index, config, userPool) {
  const timestamp = new Date().toISOString();
  return {
    clientId: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    orderId: null,
    userId: userPool[index % userPool.length],
    idempotencyKey: makeUuid(),
    quantity: config.quantity,
    productId: config.productId,
    amount: null,
    sampled: false,
    stage: "request",
    status: "QUEUED",
    reason: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    timeline: [{ at: timestamp, status: "QUEUED", label: "Queued for launch", reason: "" }]
  };
}

function updateOrderWithStatus(order, nextStatus, reason) {
  const timestamp = new Date().toISOString();
  const resolvedStatus = nextStatus || order.status;
  const resolvedReason = reason ?? order.reason ?? "";
  return {
    ...order,
    status: resolvedStatus,
    reason: resolvedReason,
    stage: inferFlowStage(resolvedStatus),
    updatedAt: timestamp,
    timeline: [
      { at: timestamp, status: resolvedStatus, label: statusLabel(resolvedStatus), reason: resolvedReason },
      ...order.timeline
    ].slice(0, 12)
  };
}

function computeCounters(orderMap) {
  const counters = { ...INITIAL_COUNTERS };
  for (const order of orderMap.values()) {
    if (order.status === "QUEUED") counters.queued += 1;
    if (order.status !== "QUEUED") counters.submitted += 1;
    if (order.status === "CREATED") counters.created += 1;
    if (order.status === "INVENTORY_RESERVED") counters.reserved += 1;
    if (order.status === "COMPLETED") counters.completed += 1;
    if (order.status === "FAILED") counters.failed += 1;
    if (order.status === "TIMED_OUT") counters.timedOut += 1;
    if (order.status === "RATE_LIMITED") counters.rateLimited += 1;
  }
  return counters;
}

function buildHistoryPoint(orderMap, startedAt) {
  const counters = computeCounters(orderMap);
  const elapsedSeconds = startedAt ? Math.max(1, Math.floor((Date.now() - startedAt) / 1000)) : 1;
  return {
    at: Date.now(),
    throughput: counters.submitted / elapsedSeconds,
    failureRate:
      counters.submitted > 0
        ? ((counters.failed + counters.timedOut + counters.rateLimited) / counters.submitted) * 100
        : 0
  };
}

function statusPosition(status) {
  switch (status) {
    case "QUEUED":
    case "SUBMITTED":
    case "CREATED":
      return 14;
    case "INVENTORY_RESERVED":
      return 66;
    case "COMPLETED":
    case "FAILED":
    case "TIMED_OUT":
    case "RATE_LIMITED":
      return 90;
    default:
      return stagePosition("request");
  }
}

function makeLiveEvent(title, detail, tone, source = "system") {
  return {
    id: makeUuid(),
    at: new Date().toISOString(),
    title,
    detail,
    tone,
    source
  };
}

function toneClasses(tone) {
  if (tone === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-cyan-400/20 bg-cyan-500/10 text-cyan-100";
}

const KpiCard = memo(function KpiCard({ label, value, tone, detail }) {
  return (
    <article className={`rounded-[1.4rem] border px-3 py-3 ${toneClasses(tone)} shadow-cockpit`}>
      <div className="hud-label">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] text-slate-300 leading-tight">{detail}</div>
    </article>
  );
});

const CommandChip = memo(function CommandChip({ label, value, tone = "neutral" }) {
  return (
    <div className={`status-pill max-w-48 shrink-0 gap-2 px-3 py-1.5 text-[11px] tracking-[0.2em] ${toneClasses(tone)}`}>
      <span className="shrink-0 text-white/70">{label}</span>
      <span className="min-w-0 truncate text-white">{value}</span>
    </div>
  );
});

const FlightToken = memo(function FlightToken({ order, index }) {
  const position = statusPosition(order.status);
  const top = 18 + (index % 6) * 10;
  return (
    <motion.div
      animate={{ left: `${position}%`, top: `${top}%`, scale: order.status === "COMPLETED" ? 0.95 : 1 }}
      className={`absolute -translate-x-1/2 rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.2em] backdrop-blur-md ${toneClasses(
        toneForStatus(order.status)
      )}`}
      initial={{ left: "7%", opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 84, damping: 18 }}
    >
      <div className="font-medium text-white">{shortId(order.orderId ?? order.clientId, 6)}</div>
      <div className="mt-1 text-[10px] text-white/70">{statusLabel(order.status)}</div>
    </motion.div>
  );
});

const FeedRow = memo(function FeedRow({ order, selected, onSelect }) {
  return (
    <button
      className={`w-full rounded-lg border px-4 py-3 text-left transition ${
        selected
          ? "border-cyan-200/80 bg-cyan-300/18 shadow-[0_0_0_1px_rgba(103,232,249,0.35),0_0_22px_rgba(103,232,249,0.22)]"
          : "border-white/10 bg-white/5 hover:border-cyan-200/45 hover:bg-white/10"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{shortId(order.orderId ?? order.clientId)}</div>
          <div className="mt-1 text-xs text-slate-400">{new Date(order.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <div className={`status-pill ${toneClasses(toneForStatus(order.status))}`}>{statusLabel(order.status)}</div>
      </div>
      <div className="mt-3 text-xs text-slate-300">{summarizeFailureReason(order.reason)}</div>
    </button>
  );
});

const MissionEvent = memo(function MissionEvent({ event }) {
  return (
    <motion.article
      className={`rounded-[1.1rem] border px-3 py-2 ${toneClasses(event.tone)}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-white leading-snug">{event.title}</div>
        <div className="shrink-0 text-[9px] uppercase tracking-wide text-white/50 mt-0.5">{event.source}</div>
      </div>
      {event.detail && <div className="mt-1 text-[11px] text-slate-300 leading-snug">{event.detail}</div>}
    </motion.article>
  );
});

const MissionBriefingOverlay = memo(function MissionBriefingOverlay({ step, stepIndex, stepCount, onClose, onNext, onPrevious }) {
  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.08),transparent_30%),rgba(2,6,23,0.74)]"
        initial={{ opacity: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.aside
        animate={{ opacity: 1, x: 0 }}
        className="pointer-events-auto absolute right-6 top-6 z-50 w-full max-w-md rounded-lg border border-cyan-200/45 bg-slate-950/96 p-6 text-white shadow-[0_30px_90px_rgba(2,8,18,0.88)] backdrop-blur-2xl"
        initial={{ opacity: 0, x: 24 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="hud-label">{step.eyebrow}</p>
              <h3 className="mt-2 font-serif text-3xl leading-tight text-white">{step.title}</h3>
            </div>
            <button
              className="rounded-lg border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/10"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-100">{step.detail}</p>

          <div className="mt-6 h-1.5 rounded-full bg-white/10">
            <motion.div
              animate={{ width: `${((stepIndex + 1) / stepCount) * 100}%` }}
              className="h-full rounded-full bg-gradient-to-r from-cyan via-sky-400 to-emerald-400"
              initial={false}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>Follow the glowing panel in the cockpit.</span>
            <span>{stepIndex + 1} / {stepCount}</span>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={stepIndex === 0}
              onClick={onPrevious}
              type="button"
            >
              Previous
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: stepCount }).map((_, index) => (
                <span
                  key={`tour-dot-${index}`}
                  className={`h-2.5 w-2.5 rounded-full ${index === stepIndex ? "bg-cyan shadow-[0_0_14px_rgba(103,232,249,0.75)]" : "bg-white/20"}`}
                />
              ))}
            </div>
            <button
              className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/25"
              onClick={onNext}
              type="button"
            >
              {stepIndex === stepCount - 1 ? "Finish" : "Next"}
            </button>
          </div>
      </motion.aside>
    </AnimatePresence>
  );
});

const SampleCard = memo(function SampleCard({ order, onSelect }) {
  return (
    <button
      className={`rounded-lg border px-4 py-3 text-left transition hover:brightness-125 ${toneClasses(toneForStatus(order.status))}`}
      onClick={onSelect}
      type="button"
    >
      <div className="text-sm font-semibold text-white">{shortId(order.orderId ?? order.clientId)}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.24em] text-white/70">{statusLabel(order.status)}</div>
      <div className="mt-2 text-xs text-slate-200">{summarizeFailureReason(order.reason)}</div>
    </button>
  );
});

const StockGauge = memo(function StockGauge({ snapshot, runStatus }) {
  const percent = stockPercentage(snapshot);
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="glass-panel relative overflow-hidden p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,232,249,0.18),transparent_52%)]" />
      <div className="relative">
        <p className="hud-label">Inventory Gauge</p>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400">Sale stock remaining</div>
            <div className="mt-1 text-4xl font-semibold text-white">{snapshot.loaded ? formatCompact(snapshot.availableStock) : "--"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{runStatus.toUpperCase()}</div>
            <div className="mt-1 text-sm font-medium text-white">{formatPercent(percent)}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" fill="none" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
            <motion.circle
              animate={{ strokeDashoffset }}
              cx="100"
              cy="100"
              fill="none"
              initial={false}
              r={radius}
              stroke="url(#stockPulse)"
              strokeDasharray={circumference}
              strokeLinecap="round"
              strokeWidth="12"
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id="stockPulse" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="55%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-serif text-3xl text-white">{formatPercent(percent)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.26em] text-cyan-100/70">Stock left</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="hud-label">Total</div>
            <div className="mt-1 text-lg font-semibold text-white">{snapshot.loaded ? formatCompact(snapshot.totalStock) : "--"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="hud-label">Reserved</div>
            <div className="mt-1 text-lg font-semibold text-white">{snapshot.loaded ? formatCompact(snapshot.reservedStock) : "--"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="hud-label">Sold</div>
            <div className="mt-1 text-lg font-semibold text-white">{snapshot.loaded ? formatCompact(Math.max(0, (snapshot.totalStock ?? 0) - (snapshot.availableStock ?? 0))) : "--"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="hud-label">Available</div>
            <div className="mt-1 text-lg font-semibold text-white">{snapshot.loaded ? formatCompact(snapshot.availableStock) : "--"}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function App({ sessionName, sessionEmail, sessionExpiresAt, onLogout, logoutPending }) {
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id);
  const [config, setConfig] = useState(buildConfigFromPreset(PRESETS[0]));
  const [ordersByClientId, setOrdersByClientId] = useState(() => new Map());
  const [history, setHistory] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [runStatus, setRunStatus] = useState("idle");
  const [selectedOrderKey, setSelectedOrderKey] = useState(null);
  const [selectedOrderPulse, setSelectedOrderPulse] = useState(false);

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [banner, setBanner] = useState("");
  const [serviceHealth, setServiceHealth] = useState({
    order: buildHealthCard("order", "Order Service"),
    inventory: buildHealthCard("inventory", "Inventory Service"),
    payment: buildHealthCard("payment", "Payment Service")
  });
  const [inventorySnapshot, setInventorySnapshot] = useState(() => buildInventorySnapshot(config.productId));
  const [paymentConfig, setPaymentConfig] = useState(() => buildPaymentConfig(config.failureRate, "CHECKING"));
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [backendStats, setBackendStats] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);

  const productOptions = useMemo(() => makeProductOptions(), []);
  const selectedPreset = PRESETS.find((preset) => preset.id === selectedPresetId) ?? PRESETS[0];
  const ordersByClientIdRef = useRef(ordersByClientId);
  const serviceHealthRef = useRef(serviceHealth);
  const abortRef = useRef({ cancelled: false });
  const startedAtRef = useRef(null);
  const stockDepletedRef = useRef(false);
  const sampledStreamsRef = useRef(new Map());
  const selectedOrderPulseTimeoutRef = useRef(null);
  useEffect(() => {
    ordersByClientIdRef.current = ordersByClientId;
  }, [ordersByClientId]);

  useEffect(() => {
    serviceHealthRef.current = serviceHealth;
  }, [serviceHealth]);

  const orders = useMemo(
    () =>
      Array.from(ordersByClientId.values()).sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [ordersByClientId]
  );
  const deferredOrders = useDeferredValue(orders);
  const counters = useMemo(() => computeCounters(ordersByClientId), [ordersByClientId]);
  const activeOrders = counters.created + counters.reserved;
  const throughput = sessionSeconds > 0 ? counters.submitted / sessionSeconds : 0;
  const sampledOrders = deferredOrders.filter((order) => order.sampled).slice(0, SAMPLE_LIMIT);
  const renderedTokens = sampledOrders.slice(0, TOKEN_RENDER_LIMIT);
  const recentFeed = deferredOrders.slice(0, RECENT_FEED_LIMIT);
  const deferredEvents = useDeferredValue(liveEvents.slice(0, 10));
  const selectedOrder =
    orders.find((order) => order.orderId === selectedOrderKey || order.clientId === selectedOrderKey) ?? sampledOrders[0] ?? null;
  const stockLeft = inventorySnapshot.loaded ? inventorySnapshot.availableStock : null;
  const stockSold = inventorySnapshot.loaded ? Math.max(0, (inventorySnapshot.totalStock ?? 0) - (inventorySnapshot.availableStock ?? 0)) : 0;
  const missionProgress = progressPercentage(counters.submitted, config.totalOrders);
  const stockLeftPercent = stockPercentage(inventorySnapshot);
  const runMeta = RUN_STATUS_META[runStatus] ?? RUN_STATUS_META.idle;
  const currentTourStep = TOUR_STEPS[tourIndex];

  function tourSectionClasses(stepId) {
    if (!tourOpen || currentTourStep?.id !== stepId) {
      return "";
    }
    return "relative z-40 ring-2 ring-cyan-200/90 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_44px_rgba(103,232,249,0.34)] tour-focus";
  }

  function selectOrder(orderKey) {
    setSelectedOrderKey(orderKey);
    setSelectedOrderPulse(true);
    if (selectedOrderPulseTimeoutRef.current) {
      window.clearTimeout(selectedOrderPulseTimeoutRef.current);
    }
    selectedOrderPulseTimeoutRef.current = window.setTimeout(() => setSelectedOrderPulse(false), 1400);
  }

  function resetSimulationState() {
    abortRef.current = { cancelled: true };
    stockDepletedRef.current = false;
    sampledStreamsRef.current.forEach((entry) => entry.source.close());
    sampledStreamsRef.current.clear();
    if (selectedOrderPulseTimeoutRef.current) {
      window.clearTimeout(selectedOrderPulseTimeoutRef.current);
      selectedOrderPulseTimeoutRef.current = null;
    }
    const defaultPreset = PRESETS[0];
    const defaultConfig = buildConfigFromPreset(defaultPreset);
    ordersByClientIdRef.current = new Map();
    startedAtRef.current = null;
    setSelectedPresetId(defaultPreset.id);
    setConfig(defaultConfig);
    setOrdersByClientId(new Map());
    setHistory([]);
    setLiveEvents([]);
    setRunStatus("idle");
    setSelectedOrderKey(null);
    setSelectedOrderPulse(false);
    setSessionSeconds(0);
    setBanner("");
    setInventoryHistory([]);
    setBackendStats(null);
    setInventorySnapshot(buildInventorySnapshot(defaultConfig.productId));
    setPaymentConfig(buildPaymentConfig(defaultConfig.failureRate, "CHECKING"));
  }

  const openTour = useEffectEvent((startIndex = 0) => {
    setTourIndex(startIndex);
    setTourOpen(true);
  });

  const appendLiveEvent = useEffectEvent((event) => {
    startTransition(() => {
      setLiveEvents((current) => [event, ...current].slice(0, LIVE_EVENT_LIMIT));
    });
  });

  const commitOrderMap = useEffectEvent((nextMap, event) => {
    ordersByClientIdRef.current = nextMap;
    startTransition(() => {
      setOrdersByClientId(nextMap);
      setHistory((current) => [...current.slice(-(SESSION_HISTORY_LIMIT - 1)), buildHistoryPoint(nextMap, startedAtRef.current)]);
      if (event) {
        setLiveEvents((current) => [event, ...current].slice(0, LIVE_EVENT_LIMIT));
      }
    });
  });

  const mutateOrder = useEffectEvent((clientId, updater, eventBuilder) => {
    const next = new Map(ordersByClientIdRef.current);
    const existing = next.get(clientId);
    if (!existing) return null;
    const updated = updater(existing);
    next.set(clientId, updated);
    commitOrderMap(next, eventBuilder ? eventBuilder(updated) : null);
    return updated;
  });

  const applyStatusUpdate = useEffectEvent((clientId, status, reason) => {
    const updated = mutateOrder(
      clientId,
      (existing) => updateOrderWithStatus(existing, status, reason),
      (order) =>
        makeLiveEvent(
          `${shortId(order.orderId ?? order.clientId)} ${statusLabel(order.status)}`,
          summarizeFailureReason(order.reason),
          toneForStatus(order.status),
          order.stage
        )
    );

    if (!updated) return;
    if (updated.status === "COMPLETED" || updated.status === "FAILED" || updated.status === "TIMED_OUT") {
      const sample = sampledStreamsRef.current.get(clientId);
      if (sample) {
        sample.terminal = true;
        sample.source.close();
      }
    }
  });

  const pollHealth = useEffectEvent(async () => {
    const nextHealth = {};
    for (const [key, url] of Object.entries(HEALTH_ENDPOINTS)) {
      const previous = serviceHealthRef.current[key];
      try {
        const response = await fetch(url);
        const payload = await response.json();
        nextHealth[key] = {
          ...previous,
          status: payload.status ?? (response.ok ? "UP" : "DOWN"),
          details: response.ok ? "Healthy and responding" : "Responding with degraded status",
          checkedAt: new Date().toISOString()
        };
      } catch (_error) {
        nextHealth[key] = {
          ...previous,
          status: "DOWN",
          details: "Unavailable or not reachable",
          checkedAt: new Date().toISOString()
        };
      }
    }

    const previousHealth = serviceHealthRef.current;
    serviceHealthRef.current = nextHealth;
    startTransition(() => setServiceHealth(nextHealth));
    Object.values(nextHealth).forEach((service) => {
      const previous = previousHealth[service.id];
      if (previous?.status && previous.status !== service.status) {
        appendLiveEvent(
          makeLiveEvent(
            `${service.label} ${service.status === "UP" ? "recovered" : "went dark"}`,
            service.details,
            healthTone(service.status),
            "health"
          )
        );
      }
    });
  });

  const pollInventorySnapshot = useEffectEvent(async () => {
    try {
      const response = await fetch(`${INVENTORY_API_BASE_URL}/inventory/${config.productId}`);
      if (!response.ok) throw new Error("Inventory snapshot unavailable");
      const payload = await response.json();
      startTransition(() => {
        setInventorySnapshot({ ...payload, loaded: true });
        if (runStatus === "running" || runStatus === "depleted") {
          setInventoryHistory((current) => [
            ...current.slice(-(SESSION_HISTORY_LIMIT - 1)),
            { name: `T+${current.length}`, availableStock: payload.availableStock ?? 0, reservedStock: payload.reservedStock ?? 0 }
          ]);
        }
      });
    } catch (_error) {
      startTransition(() => setInventorySnapshot(buildInventorySnapshot(config.productId)));
    }
  });

  const pollPaymentConfig = useEffectEvent(async () => {
    try {
      const response = await fetch(`${PAYMENT_API_BASE_URL}/payment/config`);
      if (!response.ok) throw new Error("Payment config unavailable");
      const payload = await response.json();
      startTransition(() => setPaymentConfig({ ...payload, checkedAt: new Date().toISOString() }));
    } catch (_error) {
      startTransition(() =>
        setPaymentConfig((current) => ({ ...current, circuitState: "DOWN", checkedAt: new Date().toISOString() }))
      );
    }
  });

  const pollSessionStats = useEffectEvent(async () => {
    if (!startedAtRef.current) return;
    try {
      const response = await fetch(`${ORDER_API_BASE_URL}/orders/stats?since=${startedAtRef.current}`);
      if (!response.ok) return;
      const payload = await response.json();
      startTransition(() => setBackendStats(payload));
    } catch (_error) {
      // Best-effort — backend stats are supplemental, not blocking
    }
  });

  async function syncPaymentFailureRate(nextFailureRate) {
    const response = await fetch(`${PAYMENT_API_BASE_URL}/payment/config/failure-rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ failureRate: nextFailureRate })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Unable to update failure rate");
    }

    const payload = await response.json();
    startTransition(() => setPaymentConfig({ ...payload, checkedAt: new Date().toISOString() }));
    appendLiveEvent(
      makeLiveEvent(
        "Gateway failure rate updated",
        `payment-service is now configured to ${formatPercent(payload.failureRate * 100)} simulated failure probability.`,
        "warning",
        "config"
      )
    );
  }

  function registerSample(clientId, orderId) {
    const next = new Map(ordersByClientIdRef.current);
    const sampledCount = Array.from(next.values()).filter((order) => order.sampled).length;
    const existing = next.get(clientId);
    if (!existing || existing.sampled || sampledCount >= SAMPLE_LIMIT) return;

    next.set(clientId, { ...existing, sampled: true });
    commitOrderMap(next, null);

    const source = new EventSource(`${ORDER_API_BASE_URL}/orders/${orderId}/status-stream`);
    sampledStreamsRef.current.set(clientId, { source, orderId, terminal: false });
    source.addEventListener("order-status", (event) => {
      const payload = JSON.parse(event.data);
      applyStatusUpdate(clientId, payload.status, payload.reason ?? "");
    });
    source.onerror = () => {
      const current = sampledStreamsRef.current.get(clientId);
      if (current?.terminal) return;
      source.close();
      // SSE closed without a terminal event — poll once to get the real backend status
      fetch(`${ORDER_API_BASE_URL}/orders/${orderId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((payload) => { if (payload) applyStatusUpdate(clientId, payload.status, payload.reason ?? ""); })
        .catch(() => {});
    };
  }

  async function submitOrder(order) {
    mutateOrder(
      order.clientId,
      (existing) => updateOrderWithStatus(existing, "SUBMITTED", ""),
      (updated) =>
        makeLiveEvent(
          `Launch ${shortId(updated.clientId, 6)}`,
          `Pilot ${shortId(updated.userId, 6)} fired an order packet toward order-service.`,
          "neutral",
          "launch"
        )
    );

    try {
      const response = await fetch(`${ORDER_API_BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": order.idempotencyKey },
        body: JSON.stringify({ userId: order.userId, productId: order.productId, quantity: order.quantity })
      });

      if (response.status === 429) {
        applyStatusUpdate(order.clientId, "RATE_LIMITED", "User exceeded the per-user Redis fixed window.");
        return;
      }

      if (!response.ok) {
        const message = await response.text();
        applyStatusUpdate(order.clientId, "FAILED", message || "Order service rejected the request.");
        return;
      }

      const payload = await response.json();
      const updated = mutateOrder(
        order.clientId,
        (existing) => updateOrderWithStatus({ ...existing, orderId: payload.orderId, amount: payload.amount }, payload.status, ""),
        (current) =>
          makeLiveEvent(
            `${shortId(payload.orderId)} accepted`,
            "order-service persisted the order and emitted the next saga step.",
            toneForStatus(current.status),
            "order"
          )
      );

      if (updated?.orderId) registerSample(order.clientId, updated.orderId);
      if (!selectedOrderKey && updated?.orderId) setSelectedOrderKey(updated.orderId);
    } catch (_error) {
      applyStatusUpdate(order.clientId, "TIMED_OUT", "Browser or service outage prevented order creation.");
    }
  }

  async function startSimulation() {
    if (runStatus === "running" || runStatus === "arming") return;

    abortRef.current = { cancelled: false };
    stockDepletedRef.current = false;
    sampledStreamsRef.current.forEach((entry) => entry.source.close());
    sampledStreamsRef.current.clear();

    const userPool = makeVirtualUsers(config.virtualUsers);
    const nextOrders = new Map();
    for (let index = 0; index < config.totalOrders; index += 1) {
      const order = createOrderRecord(index, config, userPool);
      nextOrders.set(order.clientId, order);
    }

    ordersByClientIdRef.current = nextOrders;
    startedAtRef.current = Date.now();
    startTransition(() => {
      setOrdersByClientId(nextOrders);
      setHistory([buildHistoryPoint(nextOrders, startedAtRef.current)]);
      setLiveEvents([
        makeLiveEvent(
          "Flash sale armed",
          `${config.totalOrders} orders queued across ${config.virtualUsers} pilots with ${config.concurrency} parallel requests.`,
          "warning",
          "session"
        )
      ]);
    });
    setSelectedOrderKey(null);
    setSessionSeconds(0);
    setInventoryHistory([]);
    setBackendStats(null);
    setRunStatus("arming");

    try {
      await syncPaymentFailureRate(config.failureRate);
    } catch (error) {
      appendLiveEvent(
        makeLiveEvent(
          "Failure-rate sync failed",
          error instanceof Error ? error.message : "Payment config update failed before launch.",
          "danger",
          "config"
        )
      );
    }

    if (abortRef.current.cancelled) return;
    setRunStatus("running");

    const orderList = Array.from(nextOrders.values());
    let cursor = 0;
    const workers = Array.from({ length: config.concurrency }, async () => {
      while (!abortRef.current.cancelled && cursor < orderList.length) {
        if (stockDepletedRef.current) {
          abortRef.current.cancelled = true;
          break;
        }

        const currentIndex = cursor;
        cursor += 1;
        await submitOrder(orderList[currentIndex]);
        if (abortRef.current.cancelled) break;
        await delay(config.paceMs);
      }
    });

    await Promise.all(workers);
    if (stockDepletedRef.current) {
      setRunStatus("depleted");
      appendLiveEvent(
        makeLiveEvent(
          "Stock depleted",
          "The cockpit stopped launching fresh order packets because available stock reached zero.",
          "warning",
          "inventory"
        )
      );
      return;
    }

    if (!abortRef.current.cancelled) {
      setRunStatus("complete");
      appendLiveEvent(
        makeLiveEvent(
          "Flash sale complete",
          "All queued order launches were fired. Remaining outcomes are still settling through the saga.",
          "success",
          "session"
        )
      );
    }
  }

  function stopSimulation() {
    if (runStatus !== "running" && runStatus !== "arming") return;
    abortRef.current.cancelled = true;
    setRunStatus("aborted");
    appendLiveEvent(
      makeLiveEvent(
        "Simulation aborted",
        "Parallel requests were manually halted. Existing sampled orders will continue to settle.",
        "danger",
        "session"
      )
    );
  }

  function setPreset(presetId) {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setConfig(buildConfigFromPreset(preset));
  }

  useEffect(() => {
    const handle = window.setInterval(() => {
      if (runStatus === "running") setSessionSeconds((value) => value + 1);
    }, SESSION_TICK_MS);
    return () => window.clearInterval(handle);
  }, [runStatus]);

  useEffect(() => {
    pollHealth();
    const handle = window.setInterval(() => pollHealth(), HEALTH_POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    pollInventorySnapshot();
    const handle = window.setInterval(() => pollInventorySnapshot(), INVENTORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [config.productId]);

  useEffect(() => {
    pollPaymentConfig();
    const handle = window.setInterval(() => pollPaymentConfig(), PAYMENT_CONFIG_POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (runStatus !== "running" && runStatus !== "depleted" && runStatus !== "complete") return;
    pollSessionStats();
    const handle = window.setInterval(() => pollSessionStats(), SESSION_STATS_POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [runStatus]);

  useEffect(() => {
    const handle = window.setInterval(async () => {
      const targets = Array.from(sampledStreamsRef.current.entries()).filter(([, sample]) => !sample.terminal);
      for (const [clientId, sample] of targets) {
        try {
          const response = await fetch(`${ORDER_API_BASE_URL}/orders/${sample.orderId}`);
          if (!response.ok) continue;
          const payload = await response.json();
          applyStatusUpdate(clientId, payload.status, payload.reason ?? "");
        } catch (_error) {
          // Best-effort polling fallback for sampled orders.
        }
      }
    }, ORDER_POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => () => {
    abortRef.current.cancelled = true;
    sampledStreamsRef.current.forEach((entry) => entry.source.close());
    if (selectedOrderPulseTimeoutRef.current) {
      window.clearTimeout(selectedOrderPulseTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (runStatus !== "running") return;
    if (!inventorySnapshot.loaded || inventorySnapshot.availableStock > 0 || stockDepletedRef.current) return;
    stockDepletedRef.current = true;
  }, [inventorySnapshot, runStatus]);

  useEffect(() => {
    const down = Object.values(serviceHealth).filter((service) => service.status !== "UP" && service.status !== "CHECKING");
    if (runStatus === "depleted") {
      setBanner("Flash sale stopped because live stock reached zero. Sampled orders still settling can continue to move.");
      return;
    }
    if (down.length > 0) {
      setBanner(`${down.map((service) => service.label).join(" + ")} appear unavailable. Orders may timeout or compensate until those services recover.`);
      return;
    }
    if (paymentConfig.circuitState === "OPEN") {
      setBanner("Payment gateway circuit breaker is OPEN. Expect failed payments and a surge of failed order outcomes.");
      return;
    }
    setBanner("");
  }, [paymentConfig.circuitState, runStatus, serviceHealth]);

  function buildNarrativeHeadline() {
    const stock = inventorySnapshot.loaded ? inventorySnapshot.availableStock : null;
    const total = inventorySnapshot.loaded ? inventorySnapshot.totalStock : null;
    const isCriticalStock = stock != null && total != null && stock > 0 && stock <= total * 0.2;
    const isCBOpen = paymentConfig.circuitState === "OPEN";

    if (runStatus === "idle") {
      return stock != null
        ? `Ready. ${formatCompact(stock)} tickets available. Select a scenario and start the flash sale.`
        : "Ready. Select a scenario and start the flash sale.";
    }
    if (runStatus === "arming") {
      return `Arming — syncing ${formatCompact(config.totalOrders)} orders across ${formatCompact(config.virtualUsers)} virtual users...`;
    }
    const bs = backendStats;
    const totalFired = bs ? bs.total : counters.submitted;
    const totalCompleted = bs ? bs.completed : counters.completed;
    const totalRejected = bs ? (bs.failed + bs.timedOut + bs.rateLimited) : (counters.failed + counters.timedOut + counters.rateLimited);
    const totalInFlight = bs ? bs.inFlight : activeOrders;

    if (runStatus === "running") {
      if (stock === 0) return `All tickets gone — ${formatCompact(totalCompleted)} secured, ${formatCompact(totalRejected)} rejected.`;
      if (isCBOpen) return `⚠️ Payment gateway overwhelmed — orders failing fast. Circuit breaker tripped open to protect the system.`;
      if (isCriticalStock) return `🔥 Last ${formatCompact(stock)} tickets — ${formatCompact(totalFired)} orders competing right now.`;
      return `⚡ ${formatCompact(totalFired)} fans have tried — ${formatCompact(totalCompleted)} secured tickets, ${stock != null ? formatCompact(stock) : "--"} remaining.`;
    }
    if (runStatus === "depleted") {
      if (bs && totalInFlight > 0) return `Sold out in ${formatDuration(sessionSeconds)}. ${formatCompact(totalCompleted)} tickets sold — ${formatCompact(totalInFlight)} orders still settling.`;
      return `Sold out in ${formatDuration(sessionSeconds)}. ${formatCompact(totalCompleted)} tickets sold, ${formatCompact(totalRejected)} orders rejected.`;
    }
    if (runStatus === "complete") {
      if (bs && totalInFlight > 0) return `All orders fired in ${formatDuration(sessionSeconds)}. ${formatCompact(totalCompleted)} tickets sold — ${formatCompact(totalInFlight)} orders still settling.`;
      return `Flash sale complete in ${formatDuration(sessionSeconds)}. ${formatCompact(totalCompleted)} tickets sold, ${formatCompact(totalRejected)} orders rejected.`;
    }
    if (runStatus === "aborted") {
      return `Simulation stopped. ${formatCompact(totalCompleted)} orders completed before abort.`;
    }
    return "";
  }

  const narrativeHeadline = buildNarrativeHeadline();

  useEffect(() => {
    if (!tourOpen) return undefined;

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        setTourOpen(false);
      }
      if (event.key === "ArrowRight") {
        setTourIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
      }
      if (event.key === "ArrowLeft") {
        setTourIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [tourOpen]);

  // Prefer backend stats (all orders) over local counters (sampled only) when available
  const displayTotal = backendStats ? backendStats.total : counters.submitted;
  const displayInFlight = backendStats ? backendStats.inFlight : activeOrders;
  const displayCompleted = backendStats ? backendStats.completed : counters.completed;
  const displayFailed = backendStats ? (backendStats.failed + backendStats.timedOut + backendStats.rateLimited) : (counters.failed + counters.timedOut + counters.rateLimited);
  const displaySuccessRate = displayTotal > 0 ? (displayCompleted / displayTotal) * 100 : 0;
  const displayFailureRate = displayTotal > 0 ? (displayFailed / displayTotal) * 100 : 0;
  const isSagaSettling = (runStatus === "complete" || runStatus === "depleted") && backendStats && backendStats.inFlight > 0;

  const kpis = [
    { label: "Orders Fired", value: formatCompact(displayTotal), detail: `${formatPercent(progressPercentage(displayTotal, config.totalOrders))} of planned launch volume`, tone: "neutral" },
    { label: "In Flight", value: formatCompact(displayInFlight), detail: isSagaSettling ? "Saga still settling in backend..." : "Waiting on inventory or payment", tone: displayInFlight > 0 ? "warning" : "neutral" },
    { label: "Success", value: formatPercent(displaySuccessRate), detail: `${formatCompact(displayCompleted)} tickets secured`, tone: "success" },
    { label: "Failure", value: formatPercent(displayFailureRate), detail: `${formatCompact(displayFailed)} failed, timed out, or blocked`, tone: "danger" }
  ];

  return (
    <div className="relative h-screen overflow-hidden bg-stars text-chrome">
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.65, 0.4] }}
        className="pointer-events-none absolute left-[-12rem] top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-cyan/10 blur-3xl"
        transition={{ duration: 18, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        animate={{ scale: [1.1, 0.92, 1.1], opacity: [0.45, 0.3, 0.45] }}
        className="pointer-events-none absolute right-[-10rem] top-[8%] h-[26rem] w-[26rem] rounded-full bg-blue-500/10 blur-3xl"
        transition={{ duration: 20, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        animate={{ y: [0, 18, 0], opacity: [0.28, 0.45, 0.28] }}
        className="pointer-events-none absolute bottom-[-12rem] left-[22%] h-[24rem] w-[24rem] rounded-full bg-emerald-400/10 blur-3xl"
        transition={{ duration: 22, ease: "easeInOut", repeat: Infinity }}
      />
      <div className="starfield absolute inset-0" />
      {tourOpen ? (
        <MissionBriefingOverlay
          onClose={() => setTourOpen(false)}
          onNext={() => {
            if (tourIndex === TOUR_STEPS.length - 1) {
              setTourOpen(false);
              return;
            }
            setTourIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
          }}
          onPrevious={() => setTourIndex((current) => Math.max(current - 1, 0))}
          step={currentTourStep}
          stepCount={TOUR_STEPS.length}
          stepIndex={tourIndex}
        />
      ) : null}

      <div className={`cockpit-shell relative flex h-full min-h-0 flex-col p-4 ${tourOpen ? "" : "z-10"}`}>
        <motion.header
          className="cockpit-header glass-panel flex min-h-[5rem] items-center justify-between gap-3 px-5 py-3"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <div className="cockpit-title w-44 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan/70">FlashSale Engine Simulation</p>
            <h1 className="mt-0.5 font-serif text-3xl leading-none text-white text-glow">Cockpit</h1>
          </div>

          <div className="cockpit-actions flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-3 overflow-hidden">
            <button
              className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-white/6 px-4 text-sm font-medium text-white transition hover:border-cyan-200/35 hover:bg-white/12"
              onClick={() => openTour(0)}
              type="button"
            >
              Mission Briefing
              <span className="inline-flex items-center justify-center text-slate-950">
                <svg aria-hidden="true" className="h-6 w-8" fill="none" viewBox="0 0 44 36">
                  <path d="M8.5 5.5C4.8 8.9 2.75 13.2 2.75 18s2.05 9.1 5.75 12.5" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="2.2" />
                  <path d="M35.5 5.5c3.7 3.4 5.75 7.7 5.75 12.5s-2.05 9.1-5.75 12.5" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="2.2" />
                  <circle cx="22" cy="18" fill="#67e8f9" fillOpacity=".18" r="10.5" stroke="#67e8f9" strokeWidth="2" />
                  <circle cx="22" cy="11.4" fill="#e0f2fe" r="1.8" />
                  <path d="M19.6 15.8h4.8" stroke="#e0f2fe" strokeLinecap="round" strokeWidth="2" />
                  <path d="M22 15.8v8.1" stroke="#e0f2fe" strokeLinecap="round" strokeWidth="2" />
                  <path d="M19.1 23.9h5.8" stroke="#e0f2fe" strokeLinecap="round" strokeWidth="2" />
                </svg>
              </span>
            </button>
            <CommandChip label="Preset" tone="neutral" value={selectedPreset.name} />
            <CommandChip label="Runtime" tone={runMeta.tone} value={runMeta.label} />
            <CommandChip label="Session" tone="neutral" value={formatDuration(sessionSeconds)} />
            <CommandChip label="Stock Left" tone={stockLeft === 0 ? "warning" : "neutral"} value={stockLeft == null ? "--" : formatCompact(stockLeft)} />

            <div className="cockpit-failure-card w-52 shrink-0 rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="cockpit-failure-label whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-cyan/70">Payment Fail Rate</span>
                <span className="text-sm font-semibold text-white">{formatPercent(config.failureRate * 100)}</span>
              </div>
              <input
                className="mt-2.5 h-1.5 w-full accent-cyan"
                max="100"
                min="0"
                onChange={(event) => setConfig((current) => ({ ...current, failureRate: clamp(Number(event.target.value) / 100, 0, 1) }))}
                step="1"
                type="range"
                value={Math.round(config.failureRate * 100)}
              />
            </div>

            <button
              className="h-11 shrink-0 whitespace-nowrap rounded-full border border-cyan-300/30 bg-cyan-400/15 px-5 text-sm font-medium text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={runStatus === "running" || runStatus === "arming"}
              onClick={startSimulation}
              type="button"
            >
              {runStatus === "running" ? "Flash Sale Live" : "Start Flash Sale"}
            </button>
            <button
              className="h-11 shrink-0 whitespace-nowrap rounded-full border border-rose-300/25 bg-rose-500/10 px-5 text-sm font-medium text-rose-100 transition hover:border-rose-200/55 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={runStatus !== "running" && runStatus !== "arming"}
              onClick={stopSimulation}
              type="button"
            >
              Abort
            </button>
          </div>
        </motion.header>

        <div className="mt-2 space-y-1.5">
          <AnimatePresence>
            {narrativeHeadline ? (
              <motion.div
                key="narrative"
                className="rounded-[1.2rem] border border-cyan-300/20 bg-cyan-500/8 px-4 py-1.5 text-sm font-medium text-cyan-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {narrativeHeadline}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence>
            {banner ? (
              <motion.div
                className="rounded-[1.2rem] border border-amber-300/25 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {banner}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <main className="cockpit-grid mt-4 grid min-h-0 flex-1 gap-4">
          <section className={`cockpit-panel glass-panel col-start-1 row-span-2 flex min-h-0 flex-col overflow-hidden p-5 ${tourSectionClasses("command-rail")}`} data-tour-id="command-rail">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="hud-label">Command Rail</p>
                <h2 className="mt-1 font-serif text-2xl text-white">Scenario tuning</h2>
                <p className="mt-1 text-sm text-slate-300">Configure pilots, volume, and gateway risk before launch.</p>
              </div>
              <div className={`status-pill ${toneClasses(runMeta.tone)}`}>{runMeta.label}</div>
            </div>

            <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`relative overflow-hidden rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      preset.id === selectedPresetId
                        ? "border-cyan-200/75 bg-cyan-300/14 shadow-[0_0_0_1px_rgba(103,232,249,0.25),0_0_22px_rgba(103,232,249,0.16)]"
                        : "border-white/10 bg-white/5 hover:border-cyan-200/35 hover:bg-white/10"
                    }`}
                    onClick={() => setPreset(preset.id)}
                    type="button"
                  >
                    <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: preset.color }} />
                    <div className="pl-3">
                      <div className="text-sm font-semibold text-white">{preset.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{preset.subtitle}</div>
                      <div className="mt-3 text-sm text-slate-300">{preset.mission}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-[1.5rem] border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Orders</span>
                  <input
                    className="mt-1 w-full bg-transparent text-xl font-semibold text-white outline-none"
                    max="5000"
                    min="1"
                    onChange={(event) => setConfig((current) => ({ ...current, totalOrders: clamp(Number(event.target.value) || 1, 1, 5000) }))}
                    type="number"
                    value={config.totalOrders}
                  />
                </label>

                <label className="rounded-[1.5rem] border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Parallel Requests</span>
                  <input
                    className="mt-1 w-full bg-transparent text-xl font-semibold text-white outline-none"
                    max="150"
                    min="1"
                    onChange={(event) => setConfig((current) => ({ ...current, concurrency: clamp(Number(event.target.value) || 1, 1, 150) }))}
                    type="number"
                    value={config.concurrency}
                  />
                </label>

                <label className="rounded-[1.5rem] border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Users</span>
                  <input
                    className="mt-1 w-full bg-transparent text-xl font-semibold text-white outline-none"
                    max="250"
                    min="1"
                    onChange={(event) => setConfig((current) => ({ ...current, virtualUsers: clamp(Number(event.target.value) || 1, 1, 250) }))}
                    type="number"
                    value={config.virtualUsers}
                  />
                </label>

                <label className="rounded-[1.5rem] border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Pace (ms)</span>
                  <input
                    className="mt-1 w-full bg-transparent text-xl font-semibold text-white outline-none"
                    max="500"
                    min="0"
                    onChange={(event) => setConfig((current) => ({ ...current, paceMs: clamp(Number(event.target.value) || 0, 0, 500) }))}
                    type="number"
                    value={config.paceMs}
                  />
                </label>
              </div>

              <label className="block rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <span className="hud-label">Product Payload</span>
                <select
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                  onChange={(event) => setConfig((current) => ({ ...current, productId: event.target.value }))}
                  value={config.productId}
                >
                  {productOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-400">{productOptions.find((option) => option.id === config.productId)?.note}</p>
              </label>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4">
                <div className="hud-label">Why virtual users matter</div>
                <p className="mt-2 text-sm text-slate-300">The rate limiter is per user. A small pool demonstrates blocked traffic; a wide pool gives a clean surge.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Users</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatCompact(config.virtualUsers)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Fail rate</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatPercent(config.failureRate * 100)}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={`cockpit-panel glass-panel relative col-start-2 row-start-1 flex min-h-0 flex-col p-5 ${tourSectionClasses("battle-glass")}`} data-tour-id="battle-glass">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_0%,rgba(103,232,249,0.16),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.5))]" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hud-label">Battle Glass</p>
                  <h2 className="mt-1 font-serif text-3xl text-white">Live saga flight path</h2>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {kpis.map((item) => <KpiCard key={item.label} detail={item.detail} label={item.label} tone={item.tone} value={item.value} />)}
              </div>
            </div>


            {/* V2: Inner panels (Inventory Gauge, System Topology, Mission + Orders) — see Todo.md */}
            {false && (
                <div className="glass-panel relative flex h-full flex-col overflow-hidden p-5">
                <motion.div
                  animate={{ x: ["-10%", "100%"] }}
                  className="pointer-events-none absolute inset-y-8 w-20 bg-gradient-to-r from-transparent via-cyan/25 to-transparent blur-2xl"
                  transition={{ duration: 4.5, ease: "linear", repeat: Infinity }}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="hud-label">System Topology</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">Order to Inventory to Payment to Result</h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                    <div className="hud-label">Scene Pulse</div>
                    <div className="mt-1 text-xl font-semibold text-white">{formatDecimal(throughput, 1)}/s</div>
                  </div>
                </div>

                <div className="relative mt-4 h-44 overflow-hidden rounded-[1.8rem] border border-white/10 bg-slate-950/60">
                  <AnimatePresence>
                    {stockLeft === 0 && (
                      <motion.div
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[1.8rem] bg-black/70 backdrop-blur-sm"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                      >
                        <motion.div
                          animate={{ scale: [1, 1.04, 1] }}
                          className="text-center"
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <div className="font-serif text-5xl font-bold text-white text-glow">SOLD OUT</div>
                          <div className="mt-3 text-sm uppercase tracking-[0.3em] text-rose-300">
                            All {inventorySnapshot.totalStock ?? ""} tickets gone
                          </div>
                          {sessionSeconds > 0 && (
                            <div className="mt-2 text-xs text-slate-400">Sold in {formatDuration(sessionSeconds)}</div>
                          )}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="absolute left-[8%] right-[8%] top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-cyan/30 via-white/20 to-emerald-400/30" />
                  <div className="absolute inset-x-[8%] top-[38%] h-px bg-gradient-to-r from-transparent via-cyan/20 to-transparent" />
                  <div className="absolute inset-x-[8%] top-[62%] h-px bg-gradient-to-r from-transparent via-cyan/20 to-transparent" />

                  {TOPOLOGY_STAGES.map((stage) => (
                    <div key={stage.key} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${stage.position}%` }}>
                      <motion.div
                        animate={{ boxShadow: ["0 0 0 rgba(103,232,249,0.15)", "0 0 28px rgba(103,232,249,0.28)", "0 0 0 rgba(103,232,249,0.15)"] }}
                        className="rounded-[1.4rem] border border-white/10 bg-slate-950/80 px-4 py-4 text-center shadow-cockpit"
                        transition={{ duration: 3, repeat: Infinity, delay: stage.position / 50 }}
                      >
                        <div className="text-sm font-semibold text-white">{stage.label}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">{stage.caption}</div>
                      </motion.div>
                    </div>
                  ))}

                  <AnimatePresence initial={false}>
                    {renderedTokens.map((order, index) => <FlightToken key={order.clientId} index={index} order={order} />)}
                  </AnimatePresence>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-3 py-2"><div className="hud-label">Created</div><div className="mt-1 text-lg font-semibold text-white">{formatCompact(counters.created)}</div></div>
                  <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-3 py-2"><div className="hud-label">Reserved</div><div className="mt-1 text-lg font-semibold text-white">{formatCompact(counters.reserved)}</div></div>
                  <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-3 py-2"><div className="hud-label">Completed</div><div className="mt-1 text-lg font-semibold text-white">{formatCompact(counters.completed)}</div></div>
                  <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-3 py-2"><div className="hud-label">Rejected</div><div className="mt-1 text-lg font-semibold text-white">{formatCompact(counters.failed + counters.rateLimited + counters.timedOut)}</div></div>
                </div>
              </div>
            )}

            {false && (
              <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
                <div className="glass-panel p-4">
                  {(runStatus === "complete" || runStatus === "depleted") ? (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                      <p className="hud-label">{runStatus === "depleted" ? "Sold Out" : "Run Complete"}</p>
                      <div className="mt-2 font-serif text-2xl text-white">
                        {runStatus === "depleted" ? "🎫 All tickets gone" : "⚡ Flash sale finished"}
                      </div>
                      {isSagaSettling && (
                        <div className="mt-2 text-[11px] text-amber-300/80">Saga settling — {formatCompact(displayInFlight)} orders still processing...</div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3">
                          <div className="hud-label">Tickets sold</div>
                          <div className="mt-1 text-xl font-semibold text-white">{formatCompact(displayCompleted)}</div>
                        </div>
                        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-3">
                          <div className="hud-label">Rejected</div>
                          <div className="mt-1 text-xl font-semibold text-white">{formatCompact(displayFailed)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <div className="hud-label">Success rate</div>
                          <div className="mt-1 text-xl font-semibold text-white">{formatPercent(displaySuccessRate)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <div className="hud-label">Duration</div>
                          <div className="mt-1 text-xl font-semibold text-white">{formatDuration(sessionSeconds)}</div>
                        </div>
                        {(backendStats ? backendStats.rateLimited : counters.rateLimited) > 0 && (
                          <div className="col-span-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
                            <div className="hud-label">Rate limited</div>
                            <div className="mt-1 text-lg font-semibold text-white">{formatCompact(backendStats ? backendStats.rateLimited : counters.rateLimited)} requests blocked by Redis</div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      <p className="hud-label">Mission Snapshot</p>
                      <div className="mt-2 text-lg font-semibold text-white">{selectedPreset.name}</div>
                      <p className="mt-1 text-sm text-slate-300 leading-snug">{selectedPreset.mission}</p>
                      <div className="mt-4 h-2 rounded-full bg-white/10">
                        <motion.div
                          animate={{ width: `${missionProgress}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-cyan via-sky-400 to-emerald-400"
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span>{formatCompact(counters.submitted)} / {formatCompact(config.totalOrders)} fired</span>
                        <span>{formatPercent(missionProgress)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="glass-panel p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="hud-label">Sampled Orders</p>
                      <h3 className="mt-1 text-base font-semibold text-white">Live SSE cards</h3>
                    </div>
                    <div className={`status-pill ${toneClasses(isPending ? "warning" : "neutral")}`}>{isPending ? "Deferred" : "Stable"}</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {sampledOrders.slice(0, 6).map((order) => <SampleCard key={order.clientId} onSelect={() => selectOrder(order.orderId ?? order.clientId)} order={order} />)}
                    {sampledOrders.length === 0 ? (
                      <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">Start a run to open live sampled SSE streams.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className={`cockpit-panel glass-panel col-start-2 row-start-2 grid min-h-0 grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)] gap-4 overflow-hidden p-4 ${tourSectionClasses("outcome-deck")}`} data-tour-id="outcome-deck">
            <div className="min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="hud-label">Outcome Feed</p>
                  <h3 className="mt-1 text-base font-semibold text-white">Completed &amp; failed</h3>
                </div>
                <div className="shrink-0 text-[10px] text-slate-500">{formatCompact(recentFeed.length)} orders</div>
              </div>
              <div className="mt-3 h-[calc(100%-3.6rem)] space-y-2 overflow-y-auto pr-1">
                {recentFeed.map((order) => (
                  <FeedRow key={order.clientId} onSelect={() => selectOrder(order.orderId ?? order.clientId)} order={order} selected={selectedOrderKey === (order.orderId ?? order.clientId)} />
                ))}
              </div>
            </div>

            <div className="min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="hud-label">Live Events</p>
                  <h3 className="mt-1 text-base font-semibold text-white">System activity</h3>
                </div>
                <div className={`shrink-0 status-pill ${toneClasses(circuitTone(paymentConfig.circuitState))}`}>{paymentConfig.circuitState}</div>
              </div>
              <div className="mt-3 h-[calc(100%-3.6rem)] space-y-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {deferredEvents.map((event) => <MissionEvent event={event} key={event.id} />)}
                </AnimatePresence>
              </div>
            </div>

            <div className={`min-h-0 overflow-hidden rounded-lg pl-1 transition ${selectedOrderPulse ? "selected-order-attention" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="hud-label">Selected Order</p>
                  <h3 className="mt-1 truncate text-base font-semibold text-white">{selectedOrder ? shortId(selectedOrder.orderId ?? selectedOrder.clientId, 12) : "Awaiting target"}</h3>
                </div>
                {selectedOrder ? (
                  <div
                    className={`status-pill max-w-[9.5rem] shrink-0 justify-center whitespace-normal text-center leading-tight ${toneClasses(toneForStatus(selectedOrder.status))}`}
                    title={statusLabel(selectedOrder.status)}
                  >
                    {statusLabel(selectedOrder.status)}
                  </div>
                ) : null}
              </div>

              {selectedOrder ? (
                <div className="mt-3 flex h-[calc(100%-3.8rem)] min-h-0 flex-col">
                  <div className="grid shrink-0 grid-cols-3 gap-2">
                    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-2 py-2"><div className="hud-label">Pilot</div><div className="mt-1 truncate text-xs font-semibold text-white">{shortId(selectedOrder.userId, 10)}</div></div>
                    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-2 py-2"><div className="hud-label">Amount</div><div className="mt-1 truncate text-xs font-semibold text-white">{selectedOrder.amount ?? "pending"}</div></div>
                    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-2 py-2"><div className="hud-label">Product</div><div className="mt-1 truncate text-xs font-semibold text-white">{shortId(selectedOrder.productId, 10)}</div></div>
                  </div>
                  <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {selectedOrder.timeline.map((event) => (
                      <div key={`${selectedOrder.clientId}-${event.at}-${event.status}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 break-words text-xs font-semibold leading-snug text-white">{event.label}</div>
                          <div className="shrink-0 text-[11px] text-slate-400">{new Date(event.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                        </div>
                        <div className="mt-1 break-words text-[11px] leading-snug text-slate-300">{summarizeFailureReason(event.reason)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/5 px-4 py-8 text-sm text-slate-400">Start the flash sale and select an order to inspect its timeline here.</div>
              )}
            </div>
          </section>

          <CockpitErrorBoundary
            onError={(error) => appendLiveEvent(makeLiveEvent("Observability rail crashed", error instanceof Error ? error.message : "Unknown dashboard error", "danger", "ui"))}
          >
            <Suspense
              fallback={
                <section className="glass-panel col-start-3 row-span-2 flex min-h-[22rem] items-center justify-center p-6">
                  <div className="text-center">
                    <p className="hud-label">Suspense</p>
                    <div className="mt-3 font-serif text-3xl text-white">Loading observability rail</div>
                    <div className="mt-2 text-sm text-slate-400">Heavy chart modules and Grafana iframe are streaming in separately.</div>
                  </div>
                </section>
              }
            >
              <div className={`col-start-3 row-span-2 min-h-0 ${tourSectionClasses("observability-rail")}`} data-tour-id="observability-rail">
                <ObservabilityRail
                  counters={counters}
                  history={history}
                  inventoryHistory={inventoryHistory}
                  inventorySnapshot={inventorySnapshot}
                  paymentConfig={paymentConfig}
                  runStatus={runMeta.label}
                  selectedPresetName={selectedPreset.name}
                  serviceHealth={serviceHealth}
                />
              </div>
            </Suspense>
          </CockpitErrorBoundary>
        </main>

        <footer className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-400 ${tourSectionClasses("cockpit-footer")}`} data-tour-id="cockpit-footer">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <span>Stock sold: {formatCompact(stockSold)}</span>
            <span>Stock left: {formatPercent(stockLeftPercent)}</span>
            <span>Gateway state: {paymentConfig.circuitState}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 max-w-72 flex-col items-end">
              <span className="max-w-full truncate text-xs font-semibold text-cyan-100">{sessionName || sessionEmail}</span>
              {sessionExpiresAt && (
                <span className="max-w-full truncate text-[9px] uppercase tracking-[0.12em] text-slate-400">
                  Valid until {new Date(sessionExpiresAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
            <button
              className="rounded-lg border border-white/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-cyan-200/35 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={logoutPending}
              onClick={onLogout}
              type="button"
            >
              {logoutPending ? "..." : "Logout"}
            </button>
            <button
              className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-50 transition hover:border-cyan-200/55 hover:bg-cyan-400/18"
              onClick={resetSimulationState}
              type="button"
            >
              Reset
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
