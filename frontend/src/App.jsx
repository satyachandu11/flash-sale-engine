import { Suspense, lazy, useEffect, useEffectEvent, useState } from "react";

import { ACCESS_API_BASE_URL, ACCESS_GATE_ENABLED } from "./constants";

const SimulatorApp = lazy(() => import("./SimulatorApp"));

const EMPTY_REQUEST_FORM = {
  name: "",
  email: ""
};

const MOBILE_VIEWPORT_QUERY = "(max-width: 1023px), (hover: none) and (pointer: coarse) and (max-width: 1280px)";

function currentPath() {
  return window.location.pathname === "/simulator" ? "/simulator" : "/";
}

function readErrorMessage(payload) {
  if (!payload) return "Something went wrong.";
  if (typeof payload === "string") return payload;
  if (typeof payload.message === "string" && payload.message) return payload.message;
  return "Something went wrong.";
}

async function accessFetch(path, options = {}) {
  const response = await fetch(`${ACCESS_API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }
  return payload;
}

function formatExpiry(expiresAt) {
  return new Date(expiresAt).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function isMobileViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}

function MobileRelayScreen({ authenticated, sessionName, sessionExpiresAt }) {
  const [copyState, setCopyState] = useState("idle");

  const handleCopyLink = useEffectEvent(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setCopyState("copied");
        window.setTimeout(() => setCopyState("idle"), 2000);
        return;
      }
      setCopyState("unsupported");
    } catch (_error) {
      setCopyState("unsupported");
    }
  });

  return (
    <div className="mobile-relay-shell relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(103,232,249,0.22),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(74,222,128,0.16),_transparent_32%),linear-gradient(180deg,_#020712_0%,_#07111d_55%,_#03070d_100%)] px-5 py-6 text-slate-100">
      <div className="starfield absolute inset-0 opacity-80" />
      <div className="mobile-relay-orbit mobile-relay-orbit-one" />
      <div className="mobile-relay-orbit mobile-relay-orbit-two" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-50">
            <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
            Mobile relay
          </div>

          <section className="mt-6 rounded-[2rem] border border-white/10 bg-slate-950/45 p-5 shadow-cockpit backdrop-blur-xl">
            <p className="hud-label">Flash Sale Engine</p>
            <h1 className="mt-3 font-serif text-5xl leading-[0.92] text-white">
              This cockpit wants a bigger windshield.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              You can open the project from your phone, but the real experience lives on desktop or laptop where the dashboard can show the live saga, event flow, service health, inventory pressure, and backend observability all at once.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-[1.6rem] border border-cyan-300/15 bg-cyan-300/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="hud-label">Why desktop</p>
                    <div className="mt-1 text-lg font-semibold text-white">Too much motion for a tiny screen</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Panels</div>
                    <div className="mt-1 text-lg font-semibold text-white">3 zones</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-200">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="hud-label">Live feed</div>
                    <div className="mt-1 font-semibold text-white">Orders</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="hud-label">Pulse</div>
                    <div className="mt-1 font-semibold text-white">Metrics</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="hud-label">Rail</div>
                    <div className="mt-1 font-semibold text-white">Grafana</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
                <p className="hud-label">Mission preview</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Inventory drain</div>
                      <div className="text-xs text-slate-300">Watch stock disappear in real time.</div>
                    </div>
                    <div className="text-lg font-semibold text-emerald-100">100 to 0</div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Circuit breaker</div>
                      <div className="text-xs text-slate-300">See payment failures trip and recover.</div>
                    </div>
                    <div className="text-lg font-semibold text-amber-100">LIVE</div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Saga trail</div>
                      <div className="text-xs text-slate-300">Order, inventory, payment, resolution.</div>
                    </div>
                    <div className="text-lg font-semibold text-cyan-100">4 hops</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 shadow-cockpit backdrop-blur-xl">
          <div className="mobile-relay-device mx-auto mb-5">
            <div className="mobile-relay-device-screen">
              <div className="mobile-relay-device-grid">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>

          <p className="hud-label">Best next move</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Open this same link on a desktop or laptop.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {authenticated
              ? `${sessionName || "Your"} session is already active${sessionExpiresAt ? ` until ${formatExpiry(sessionExpiresAt)}` : ""}.`
              : "The simulator and access flow are tuned for a larger screen so the backend story can breathe."}
          </p>

          <button
            className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/12 px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-50 transition hover:bg-cyan-300/18"
            onClick={handleCopyLink}
            type="button"
          >
            {copyState === "copied" ? "Link copied" : "Copy this link for desktop"}
          </button>

          <p className="mt-3 text-center text-xs text-slate-400">
            {copyState === "unsupported"
              ? "Copy is blocked on this browser, but the current URL will work on desktop."
              : "Tip: send it to yourself and open it on a wider screen."}
          </p>
        </section>
      </div>
    </div>
  );
}

function LoadingScreen({ title, detail }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(103,232,249,0.18),_transparent_42%),linear-gradient(180deg,_#03111c_0%,_#020712_100%)] px-6 py-10 text-slate-100">
      <div className="starfield absolute inset-0 opacity-80" />
      <div className="relative mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <section className="glass-panel w-full max-w-xl px-8 py-10 text-center">
          <p className="hud-label">Access Control</p>
          <h1 className="mt-4 font-serif text-4xl text-white">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
        </section>
      </div>
    </div>
  );
}

function AccessGate({
  inviteCode,
  onInviteCodeChange,
  onRedeem,
  redeemPending,
  redeemError,
  requestForm,
  onRequestFieldChange,
  onRequestInvite,
  requestPending,
  requestMessage,
  requestError
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(103,232,249,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(15,118,110,0.22),_transparent_34%),linear-gradient(180deg,_#03111c_0%,_#020712_100%)] px-6 py-10 text-slate-100">
      <div className="starfield absolute inset-0 opacity-90" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center">
        <header className="max-w-3xl">
          <p className="hud-label">Limited Access</p>
          <h1 className="mt-4 font-serif text-5xl leading-tight text-white">
            100 tickets. One second to claim yours.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            This is a live flash-sale engine — real queues, real stock pressure, real failures. Access is invite-only so the shared pool stays fair. Got a code? You're in. Don't have one? Request a spot.
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="glass-panel px-7 py-7">
            <p className="hud-label">You're on the list</p>
            <h2 className="mt-3 font-serif text-3xl text-white">Got your code?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Paste your invite code below and step straight into the cockpit. Codes stay active for 24 hours — your session survives page refreshes until it expires.
            </p>

            <label className="mt-7 block text-sm text-slate-200" htmlFor="invite-code">
              Invite code
            </label>
            <input
              autoCapitalize="characters"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base uppercase tracking-[0.28em] text-white outline-none transition focus:border-cyan-300/40"
              id="invite-code"
              onChange={(event) => onInviteCodeChange(event.target.value.toUpperCase())}
              placeholder="FS-ABCD-EFGH"
              value={inviteCode}
            />

            {redeemError ? <p className="mt-3 text-sm text-rose-300">{redeemError}</p> : null}

            <button
              className="mt-6 inline-flex min-w-44 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/12 px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-50 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={redeemPending || !inviteCode.trim()}
              onClick={onRedeem}
              type="button"
            >
              {redeemPending ? "Unlocking..." : "Enter the cockpit"}
            </button>
          </section>

          <section className="glass-panel px-7 py-7">
            <p className="hud-label">Join the waitlist</p>
            <h2 className="mt-3 font-serif text-3xl text-white">Want in?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Drop your name and email. Every request hits the admin dashboard directly — if you make the cut, your personal invite code arrives by email.
            </p>

            <div className="mt-7 space-y-4">
              <div>
                <label className="block text-sm text-slate-200" htmlFor="request-name">
                  Name
                </label>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-300/40"
                  id="request-name"
                  onChange={(event) => onRequestFieldChange("name", event.target.value)}
                  placeholder="Your full name"
                  value={requestForm.name}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-200" htmlFor="request-email">
                  Email
                </label>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-300/40"
                  id="request-email"
                  onChange={(event) => onRequestFieldChange("email", event.target.value)}
                  placeholder="name@example.com"
                  type="email"
                  value={requestForm.email}
                />
              </div>
            </div>

            {requestMessage ? <p className="mt-4 text-sm text-emerald-300">{requestMessage}</p> : null}
            {requestError ? <p className="mt-4 text-sm text-rose-300">{requestError}</p> : null}

            <button
              className="mt-6 inline-flex min-w-44 items-center justify-center rounded-full border border-white/12 bg-white/8 px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={requestPending || !requestForm.name.trim() || !requestForm.email.trim()}
              onClick={onRequestInvite}
              type="button"
            >
              {requestPending ? "Sending..." : "Request my spot"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mobileViewport, setMobileViewport] = useState(isMobileViewport);
  const [path, setPath] = useState(currentPath);
  const [sessionState, setSessionState] = useState({
    status: ACCESS_GATE_ENABLED ? "checking" : "authenticated",
    data: null
  });
  const [inviteCode, setInviteCode] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [redeemPending, setRedeemPending] = useState(false);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST_FORM);
  const [requestError, setRequestError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestPending, setRequestPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const navigate = useEffectEvent((nextPath, replace = false) => {
    if (replace) {
      window.history.replaceState(null, "", nextPath);
    } else {
      window.history.pushState(null, "", nextPath);
    }
    setPath(currentPath());
  });

  const refreshSession = useEffectEvent(async () => {
    if (!ACCESS_GATE_ENABLED) {
      setSessionState({ status: "authenticated", data: null });
      return;
    }

    setSessionState((current) => ({ ...current, status: "checking" }));
    try {
      const payload = await accessFetch("/public/session", { method: "GET" });
      setSessionState({ status: "authenticated", data: payload });
    } catch (error) {
      setSessionState({ status: "guest", data: null });
    }
  });

  useEffect(() => {
    const handlePopState = () => setPath(currentPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const syncViewport = () => setMobileViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    window.addEventListener("resize", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    refreshSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- refreshSession is a useEffectEvent (non-reactive)

  useEffect(() => {
    if (!ACCESS_GATE_ENABLED) {
      return;
    }
    if (sessionState.status === "authenticated" && path !== "/simulator") {
      navigate("/simulator", true);
    }
    if (sessionState.status === "guest" && path !== "/") {
      navigate("/", true);
    }
  }, [path, sessionState.status]); // eslint-disable-line react-hooks/exhaustive-deps -- navigate is a useEffectEvent (non-reactive)

  const handleRedeem = useEffectEvent(async () => {
    setRedeemPending(true);
    setRedeemError("");
    try {
      const payload = await accessFetch("/public/invites/redeem", {
        method: "POST",
        body: JSON.stringify({ code: inviteCode.trim() })
      });
      setSessionState({ status: "authenticated", data: payload });
      navigate("/simulator");
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : "Unable to redeem invite");
    } finally {
      setRedeemPending(false);
    }
  });

  const handleRequestInvite = useEffectEvent(() => {
    setRequestError("");
    setRequestMessage("");
    setRequestPending(true);

    accessFetch("/public/invite-requests", {
      method: "POST",
      body: JSON.stringify(requestForm)
    })
      .then(() => {
        setRequestForm(EMPTY_REQUEST_FORM);
        setRequestMessage("Invite request submitted. The admin will review it and email you if approved.");
      })
      .catch((error) => {
        setRequestError(error instanceof Error ? error.message : "Unable to submit invite request");
      })
      .finally(() => {
        setRequestPending(false);
      });
  });

  const handleLogout = useEffectEvent(() => {
    setLogoutPending(true);
    accessFetch("/public/logout", { method: "POST" })
      .catch(() => {
        // Best effort logout. We still clear local access state below.
      })
      .finally(() => {
        setLogoutPending(false);
        setSessionState({ status: "guest", data: null });
        navigate("/", true);
      });
  });

  if (!ACCESS_GATE_ENABLED) {
    return (
      <Suspense fallback={<LoadingScreen detail="Streaming the cockpit bundle and observability rail." title="Loading simulator" />}>
        <SimulatorApp />
      </Suspense>
    );
  }

  if (sessionState.status === "checking") {
    return <LoadingScreen detail="Checking your invite session and restoring access if the browser was refreshed." title="Restoring access" />;
  }

  if (mobileViewport) {
    return (
      <MobileRelayScreen
        authenticated={sessionState.status === "authenticated"}
        sessionExpiresAt={sessionState.data?.expiresAt}
        sessionName={sessionState.data?.name}
      />
    );
  }

  if (path === "/simulator" && sessionState.status === "authenticated") {
    return (
      <Suspense fallback={<LoadingScreen detail="Streaming the cockpit bundle and observability rail." title="Loading simulator" />}>
        <SimulatorApp
          sessionName={sessionState.data?.name}
          sessionEmail={sessionState.data?.email}
          sessionExpiresAt={sessionState.data?.expiresAt}
          onLogout={handleLogout}
          logoutPending={logoutPending}
        />
      </Suspense>
    );
  }

  return (
    <AccessGate
      inviteCode={inviteCode}
      onInviteCodeChange={setInviteCode}
      onRedeem={handleRedeem}
      redeemError={redeemError}
      redeemPending={redeemPending}
      onRequestFieldChange={(field, value) => setRequestForm((current) => ({ ...current, [field]: value }))}
      onRequestInvite={handleRequestInvite}
      requestError={requestError}
      requestForm={requestForm}
      requestMessage={requestMessage}
      requestPending={requestPending}
    />
  );
}
