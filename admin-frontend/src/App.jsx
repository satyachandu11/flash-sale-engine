import { useEffect, useEffectEvent, useState } from "react";

const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL ?? "/admin-api";

async function apiFetch(path, options = {}) {
  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
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
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(payload?.message || "Request failed");
  }

  return payload;
}

function formatDateTime(value) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function LoginScreen({ form, onChange, onSubmit, error, pending }) {
  return (
    <div className="screen">
      <section className="login-card">
        <p className="eyebrow">Admin Console</p>
        <h1>Review invite access and refill stock without touching the simulation frontend.</h1>
        <p className="muted">
          This console uses the new admin-service session cookie, so refresh restores the dashboard when the admin session is still valid.
        </p>

        <label htmlFor="username">Username</label>
        <input id="username" onChange={(event) => onChange("username", event.target.value)} value={form.username} />

        <label htmlFor="password">Password</label>
        <input id="password" onChange={(event) => onChange("password", event.target.value)} type="password" value={form.password} />

        {error ? <div className="error-banner">{error}</div> : null}

        <button className="primary-button" disabled={pending || !form.username || !form.password} onClick={onSubmit} type="button">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </section>
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export default function App() {
  const [sessionState, setSessionState] = useState({ status: "checking", data: null });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [pendingRequests, setPendingRequests] = useState([]);
  const [inviteHistory, setInviteHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [topUpDrafts, setTopUpDrafts] = useState({});
  const [topUpState, setTopUpState] = useState({});
  const [actionBusy, setActionBusy] = useState({});
  const [approvedCodes, setApprovedCodes] = useState({});

  const hydrateDashboard = useEffectEvent(async () => {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const [requests, invites, managedProducts] = await Promise.all([
        apiFetch("/admin/invite-requests?status=PENDING"),
        apiFetch("/admin/invites?status=ALL"),
        apiFetch("/admin/products")
      ]);

      setPendingRequests(requests);
      setInviteHistory(invites);
      setProducts(managedProducts);
      setTopUpDrafts((current) => {
        const next = { ...current };
        for (const product of managedProducts) {
          if (!next[product.productId]) {
            next[product.productId] = String(product.defaultTopUpQuantity);
          }
        }
        return next;
      });
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Unable to load dashboard");
    } finally {
      setDashboardLoading(false);
    }
  });

  const restoreSession = useEffectEvent(async () => {
    try {
      const payload = await apiFetch("/admin/auth/session");
      setSessionState({ status: "authenticated", data: payload });
    } catch (error) {
      setSessionState((current) =>
        current.status === "authenticated" ? current : { status: "guest", data: null }
      );
    }
  });

  useEffect(() => {
    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionState.status === "authenticated") {
      hydrateDashboard();
    }
  }, [sessionState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useEffectEvent(async () => {
    setLoginPending(true);
    setLoginError("");
    try {
      const payload = await apiFetch("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm)
      });
      setSessionState({ status: "authenticated", data: payload });
      setLoginForm((current) => ({ ...current, password: "" }));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoginPending(false);
    }
  });

  const handleLogout = useEffectEvent(async () => {
    try {
      await apiFetch("/admin/auth/logout", { method: "POST" });
    } catch (error) {
      // Best effort logout.
    } finally {
      setSessionState({ status: "guest", data: null });
      setPendingRequests([]);
      setInviteHistory([]);
      setProducts([]);
    }
  });

  const runInviteAction = useEffectEvent(async (requestId, action) => {
    setActionBusy((current) => ({ ...current, [requestId]: action }));
    setDashboardError("");

    try {
      const result = await apiFetch(`/admin/invite-requests/${requestId}/${action}`, { method: "POST" });
      if (action === "approve" && result?.inviteCode) {
        setApprovedCodes((current) => ({ ...current, [result.inviteId]: result.inviteCode }));
      }
      await hydrateDashboard();
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : `Unable to ${action} invite request`);
    } finally {
      setActionBusy((current) => ({ ...current, [requestId]: "" }));
    }
  });

  const handleTopUp = useEffectEvent(async (productId) => {
    const quantity = Number(topUpDrafts[productId]);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTopUpState((current) => ({
        ...current,
        [productId]: { type: "error", message: "Enter a quantity greater than zero." }
      }));
      return;
    }

    setActionBusy((current) => ({ ...current, [productId]: "top-up" }));

    try {
      const payload = await apiFetch("/admin/stock/top-ups", {
        method: "POST",
        body: JSON.stringify({ productId, quantity })
      });
      setTopUpState((current) => ({
        ...current,
        [productId]: {
          type: "success",
          message: `Top-up applied. Available stock is now ${payload.inventory.availableStock}.`,
          inventory: payload.inventory
        }
      }));
      await hydrateDashboard();
    } catch (error) {
      setTopUpState((current) => ({
        ...current,
        [productId]: {
          type: "error",
          message: error instanceof Error ? error.message : "Unable to top up stock."
        }
      }));
    } finally {
      setActionBusy((current) => ({ ...current, [productId]: "" }));
    }
  });

  if (sessionState.status === "checking") {
    return (
      <div className="screen">
        <section className="login-card">
          <p className="eyebrow">Admin Console</p>
          <h1>Restoring admin session</h1>
          <p className="muted">Checking the browser cookie and loading dashboard access.</p>
        </section>
      </div>
    );
  }

  if (sessionState.status !== "authenticated") {
    return (
      <LoginScreen
        error={loginError}
        form={loginForm}
        onChange={(field, value) => setLoginForm((current) => ({ ...current, [field]: value }))}
        onSubmit={handleLogin}
        pending={loginPending}
      />
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">FlashSale Admin Console</p>
          <h1>Invite operations and stock recovery</h1>
          <p className="muted">
            Signed in as <strong>{sessionState.data.username}</strong>. Session expires {formatDateTime(sessionState.data.expiresAt)}.
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={hydrateDashboard} type="button">
            Refresh
          </button>
          <button className="secondary-button" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      {dashboardError ? <div className="error-banner">{dashboardError}</div> : null}

      <main className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Pending Requests</p>
              <h2>Review queue</h2>
            </div>
            <span className="count-pill">{pendingRequests.length}</span>
          </div>

          {dashboardLoading ? <EmptyState detail="Fetching invite requests and invite history." title="Loading dashboard..." /> : null}
          {!dashboardLoading && pendingRequests.length === 0 ? (
            <EmptyState detail="New public requests will appear here for approval or rejection." title="No pending requests" />
          ) : null}

          <div className="list-stack">
            {pendingRequests.map((request) => (
              <article className="request-card" key={request.id}>
                <div className="request-meta">
                  <div>
                    <strong>{request.name}</strong>
                    <span>{request.email}</span>
                  </div>
                  <span>{formatDateTime(request.requestedAt)}</span>
                </div>
                <div className="request-actions">
                  <button
                    className="primary-button"
                    disabled={Boolean(actionBusy[request.id])}
                    onClick={() => runInviteAction(request.id, "approve")}
                    type="button"
                  >
                    {actionBusy[request.id] === "approve" ? "Approving..." : "Approve"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={Boolean(actionBusy[request.id])}
                    onClick={() => runInviteAction(request.id, "reject")}
                    type="button"
                  >
                    {actionBusy[request.id] === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Managed Products</p>
              <h2>One-click stock top-up</h2>
            </div>
            <span className="count-pill">{products.length}</span>
          </div>

          {products.length === 0 ? <EmptyState detail="Seeded managed products will render here." title="No managed products" /> : null}

          <div className="product-grid">
            {products.map((product) => {
              const topUpInfo = topUpState[product.productId];
              return (
                <article className="product-card" key={product.productId}>
                  <div>
                    <strong>{product.name}</strong>
                    <p>{product.description}</p>
                    <span className="mono">{product.productId}</span>
                  </div>

                  <label htmlFor={`top-up-${product.productId}`}>Top-up quantity</label>
                  <div className="inline-form">
                    <input
                      id={`top-up-${product.productId}`}
                      min="1"
                      onChange={(event) => setTopUpDrafts((current) => ({ ...current, [product.productId]: event.target.value }))}
                      type="number"
                      value={topUpDrafts[product.productId] ?? product.defaultTopUpQuantity}
                    />
                    <button
                      className="primary-button"
                      disabled={actionBusy[product.productId] === "top-up"}
                      onClick={() => handleTopUp(product.productId)}
                      type="button"
                    >
                      {actionBusy[product.productId] === "top-up" ? "Applying..." : "Top up"}
                    </button>
                  </div>

                  {topUpInfo ? (
                    <div className={`inventory-box ${topUpInfo.type}`}>
                      <span>{topUpInfo.message}</span>
                      {topUpInfo.inventory ? (
                        <div className="inventory-metrics">
                          <span>Total: {topUpInfo.inventory.totalStock}</span>
                          <span>Reserved: {topUpInfo.inventory.reservedStock}</span>
                          <span>Available: {topUpInfo.inventory.availableStock}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Invite History</p>
              <h2>Approved and expired codes</h2>
            </div>
            <span className="count-pill">{inviteHistory.length}</span>
          </div>

          {inviteHistory.length === 0 ? (
            <EmptyState detail="Approved invite codes and expiry state will appear here." title="No invites yet" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Redemptions</th>
                    <th>Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td className="mono">
                        {approvedCodes[invite.id] ?? `•••• ${invite.codeLast4}`}
                      </td>
                      <td>{invite.status}</td>
                      <td>{formatDateTime(invite.expiresAt)}</td>
                      <td>{invite.redemptionCount}</td>
                      <td>{formatDateTime(invite.lastRedeemedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
