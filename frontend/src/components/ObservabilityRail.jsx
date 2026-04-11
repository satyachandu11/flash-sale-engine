import { memo } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { GRAFANA_URL } from "../constants";
import { circuitTone, formatCompact, formatDecimal, formatPercent, healthTone } from "../utils";

const CHART_TONES = ["#67e8f9", "#4ade80", "#f59e0b", "#fb7185"];

const CB_LABELS = {
  CLOSED: {
    label: "All clear",
    explanation: "Payments flowing normally through the gateway."
  },
  OPEN: {
    label: "Gateway down",
    explanation: "Too many failures — all payments fast-failing to protect the system."
  },
  HALF_OPEN: {
    label: "Probing recovery",
    explanation: "Sending 3 test payments to check if the gateway has recovered."
  },
  CHECKING: {
    label: "Checking...",
    explanation: "Connecting to payment service."
  }
};

function toneClasses(tone) {
  if (tone === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-cyan-400/20 bg-cyan-500/10 text-cyan-100";
}

function RailTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/90 px-3 py-2 text-xs text-slate-200 shadow-2xl">
      <div className="font-medium text-white">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="mt-1 flex items-center justify-between gap-4">
          <span className="text-slate-400">{entry.name}</span>
          <span style={{ color: entry.color }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

const ObservabilityRail = memo(function ObservabilityRail({
  serviceHealth,
  paymentConfig,
  inventorySnapshot,
  inventoryHistory,
  history,
  counters,
  selectedPresetName,
  runStatus
}) {
  const stageMix = [
    { name: "Created", value: counters.created },
    { name: "Reserved", value: counters.reserved },
    { name: "Completed", value: counters.completed },
    { name: "Failed", value: counters.failed + counters.timedOut + counters.rateLimited }
  ].filter((entry) => entry.value > 0);

  const railHistory = history.map((point, index) => ({
    name: `T-${history.length - index - 1}`,
    Throughput: Number(formatDecimal(point.throughput, 1)),
    Failure: Number(formatDecimal(point.failureRate, 1))
  }));

  const breakerTone = circuitTone(paymentConfig.circuitState);

  return (
    <section className="observability-panel glass-panel flex h-full min-h-0 flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="hud-label">Observability Rail</p>
          <h2 className="mt-2 font-serif text-3xl text-white">Telemetry + truth</h2>
          <p className="mt-2 text-sm text-slate-300">
            Runtime state, backend health, and the metrics layer that backs the cockpit story.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
          <div className="hud-label">Scenario</div>
          <div className="mt-1 text-sm font-medium text-white">{selectedPresetName}</div>
          <div className="mt-1 text-xs text-slate-400">{runStatus.toUpperCase()}</div>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3">
          {Object.values(serviceHealth).map((service) => (
            <article
              key={service.id}
              className={`rounded-3xl border px-4 py-4 ${toneClasses(healthTone(service.status))}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">{service.label}</div>
                <div className="status-pill border-current/40 bg-black/20">{service.status}</div>
              </div>
              <div className="mt-2 text-xs text-slate-300">{service.details}</div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {service.checkedAt ? new Date(service.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : "Awaiting"}
              </div>
            </article>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <article className={`rounded-3xl border px-4 py-4 ${toneClasses(breakerTone)}`}>
            <div className="hud-label">Circuit Breaker</div>
            <div className="mt-3 text-2xl font-semibold text-white">{CB_LABELS[paymentConfig.circuitState]?.label ?? paymentConfig.circuitState}</div>
            <div className="mt-2 text-xs text-slate-300">{CB_LABELS[paymentConfig.circuitState]?.explanation ?? "Connecting to payment service..."}</div>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="hud-label">Gateway Failure Rate</div>
            <div className="mt-3 text-2xl font-semibold text-white">{formatPercent(paymentConfig.failureRate * 100)}</div>
            <div className="mt-2 text-xs text-slate-300">Simulated % of payments the gateway rejects</div>
          </article>
        </div>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="hud-label">Inventory Telemetry</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {inventorySnapshot.loaded ? formatCompact(inventorySnapshot.availableStock) : "--"} available
              </div>
            </div>
            <div className="text-right text-xs text-slate-400">
              <div>Total: {inventorySnapshot.loaded ? formatCompact(inventorySnapshot.totalStock) : "--"}</div>
              <div>Reserved: {inventorySnapshot.loaded ? formatCompact(inventorySnapshot.reservedStock) : "--"}</div>
            </div>
          </div>
          <div className="rail-short-chart mt-4 h-28">
            {inventoryHistory.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={inventoryHistory}>
                  <defs>
                    <linearGradient id="availableFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="reservedFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Tooltip content={<RailTooltip />} />
                  <Area type="monotone" dataKey="availableStock" name="Available" stroke="#4ade80" strokeWidth={2} fill="url(#availableFill)" />
                  <Area type="monotone" dataKey="reservedStock" name="Reserved" stroke="#f59e0b" strokeWidth={1.5} fill="url(#reservedFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Chart fills as the sale runs
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="hud-label">Session Pulse</div>
              <div className="mt-1 text-lg font-semibold text-white">Throughput vs failure trend</div>
            </div>
            <div className="text-xs text-slate-400">Deferred chart updates keep the feed responsive</div>
          </div>
          <div className="rail-tall-chart mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={railHistory}>
                <defs>
                  <linearGradient id="throughputFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#67e8f9" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#67e8f9" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="failureFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#fb7185" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#fb7185" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Tooltip content={<RailTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Throughput"
                  name="Throughput"
                  stroke="#67e8f9"
                  strokeWidth={2}
                  fill="url(#throughputFill)"
                />
                <Area
                  type="monotone"
                  dataKey="Failure"
                  name="Failure"
                  stroke="#fb7185"
                  strokeWidth={2}
                  fill="url(#failureFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="hud-label">Order Mix</div>
              <div className="mt-1 text-lg font-semibold text-white">Stage distribution</div>
            </div>
            <div className="text-xs text-slate-400">Sampled from the current run</div>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_8rem] items-center gap-3">
            <div className="rail-pie-chart h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stageMix} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={3}>
                    {stageMix.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_TONES[index % CHART_TONES.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<RailTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {stageMix.map((entry, index) => (
                <div key={entry.name} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_TONES[index % CHART_TONES.length] }} />
                    <span className="text-slate-300">{entry.name}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">{formatCompact(entry.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="hud-label">Grafana</div>
              <div className="mt-1 text-lg font-semibold text-white">Backend observability</div>
            </div>
            <a
              className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-500/20"
              href={GRAFANA_URL}
              rel="noreferrer"
              target="_blank"
            >
              Open →
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Prometheus metrics scraped every 5s from all 3 services. Opens in a new tab.
          </p>
          <div className="mt-3 space-y-2">
            {[
              { label: "Orders / sec", detail: "HTTP request throughput on order-service" },
              { label: "P95 / P99 latency", detail: "How fast the system is responding under load" },
              { label: "Circuit breaker state", detail: "CLOSED → OPEN → HALF-OPEN transitions over time" },
              { label: "Cache hit / miss rate", detail: "Redis cache effectiveness on inventory reads" },
              { label: "JVM heap memory", detail: "Memory pressure across all three services" }
            ].map((metric) => (
              <div key={metric.label} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-xs font-medium text-white">{metric.label}</span>
                <span className="text-right text-[11px] text-slate-400">{metric.detail}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
});

export default ObservabilityRail;
