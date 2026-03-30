# FlashSale Engine — V2 Todo

Items deferred from V1 to keep the UI stable and simple.

---

## Battle Glass — Inner Panel Tab Switcher (V2)

**What it is:**
A tab switcher inside the Battle Glass section that lets users switch between:
- **Inventory Gauge** — circular SVG stock gauge with available/reserved/sold counts
- **System Topology** — animated token flow canvas (Order → Inventory → Payment → Result) with real-time stage counters (Created / Reserved / Completed / Rejected)
- **Mission + Orders** — Mission Snapshot with progress bar while running, Run Complete summary (tickets sold / rejected / success rate / duration) when done + Sampled Orders SSE cards

**Why deferred:**
The panels worked individually but the available vertical height inside Battle Glass (after the title + 4 KPI cards) was too small on standard viewport heights (~660px). The flex-1 chain gave the tab panels near-zero height, so content was clipped by overflow-hidden. Several layout approaches were attempted (flex fix, overflow-y-auto, min-h guarantees) but the core constraint is a fixed-height cockpit grid where the KPI cards consume most of row 1.

**How to implement in V2:**
1. Compact the KPI cards — remove detail text, reduce `py-3` → `py-2`, `text-2xl` → `text-xl`. Saves ~35px.
2. Reduce Battle Glass title — remove `hud-label` "BATTLE GLASS", `text-3xl` → `text-xl`. Saves ~22px.
3. Change tab panels container to `flex-1 overflow-y-auto` (not `overflow-hidden`) so content scrolls when it overflows instead of clipping to zero.
4. Give the topology canvas `min-h-[8rem] flex-1` instead of fixed `h-44` so it adapts to available space.
5. Restore tab state: `const [innerTab, setInnerTab] = useState("topology")` in SimulatorApp.jsx.
6. Re-enable the hidden block: search for `{false && (` in SimulatorApp.jsx — replace `false` with `innerTab === "topology"` etc., and re-add the tab bar.

**Code location:**
- `frontend/src/SimulatorApp.jsx` — search for `V2: Inner panels` comment around line ~1130
- The full topology + mission panel JSX is preserved in the `{false && (...)}` block, dead-code eliminated at build time but still in source for V2 reference.

---

## Other V2 Ideas

- Responsive layout for viewports below 768px (currently cockpit is designed for 1080p+)
- Keyboard shortcuts for tab switching (1/2/3/4)
- Persist selected tab to localStorage so it survives page refresh
