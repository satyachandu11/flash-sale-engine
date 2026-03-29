import { Suspense, lazy, useEffect, useEffectEvent, useState } from "react";

import { ACCESS_API_BASE_URL, ACCESS_GATE_ENABLED } from "./constants";

const SimulatorApp = lazy(() => import("./SimulatorApp"));

const EMPTY_REQUEST_FORM = {
  name: "",
  email: ""
};

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
