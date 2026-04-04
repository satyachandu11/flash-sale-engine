# Admin-Service + Invite-Gated Public Access

## Summary
- Add a new `admin-service` (Spring Boot, port `8083`) that owns invite requests, invite approval/rejection, public access sessions, admin login, and stock top-up orchestration.
- Your concern is correct: with the current public simulation, multiple real users would all drive the same shared demo product and stock pool. This plan gates the public UI before users can reach the simulation.
- Keep the existing public simulation frontend, but refactor it into a lightweight access shell plus a lazy-loaded cockpit so the heavy simulation bundle loads only after invite validation.
- Add a separate `admin-frontend` for admin login, invite review, and stock top-up.
- Make the whole feature removable with a feature flag. When invite mode is disabled, the public site behaves like today and `admin-service` is not required.

## Key Changes
### Service and data model
- Use the existing Postgres instance and add admin-owned tables with JPA `ddl-auto=update` to match the current repo style.
- Add `invite_requests` with: `id`, `name`, `email`, `status (PENDING|APPROVED|REJECTED)`, `requested_at`, `reviewed_at`, `reviewed_by`.
- Add `invite_codes` with: `id`, `request_id`, `email`, `code_hash`, `code_last4`, `created_at`, `expires_at`, `status (ACTIVE|EXPIRED)`, `redemption_count`, `last_redeemed_at`.
- Keep ephemeral `admin_session` and `public_access_session` in Redis with TTL. Public session expiry is capped at the invite’s `expires_at`.
- Add a small expiry reconciler in `admin-service` that marks expired invites for admin filtering and reporting.
- Configure managed products in `admin-service`, seeded initially with the current demo product ID, so the admin UI can render one-click stock cards instead of raw UUID entry.

### APIs and interfaces
- Public `admin-service` endpoints:
  - `POST /public/invite-requests`
  - `POST /public/invites/redeem`
  - `GET /public/session`
  - `POST /public/logout`
- Admin `admin-service` endpoints:
  - `POST /admin/auth/login`
  - `GET /admin/auth/session`
  - `POST /admin/auth/logout`
  - `GET /admin/invite-requests?status=...`
  - `POST /admin/invite-requests/{id}/approve`
  - `POST /admin/invite-requests/{id}/reject`
  - `GET /admin/invites?status=...`
  - `POST /admin/stock/top-ups`
- Add one internal inventory endpoint used only by `admin-service` to add stock for a product. It must increment `total_stock` and `available_stock`, keep `reserved_stock` unchanged, and evict the Redis cache entry.
- Protect that inventory endpoint with a shared internal secret header so browsers cannot call it directly.

### Frontend behavior
- Public frontend:
  - Add routing with `/` for invite entry/request and `/simulator` for the existing flash-sale cockpit.
  - On boot or refresh, call `GET /public/session`. Valid session renders `/simulator`; missing or expired session redirects to `/`.
  - Redeeming an invite creates a first-party session cookie through a proxied `admin-service` path.
  - When `ACCESS_GATE_ENABLED=false`, skip invite/session checks and render the current simulator flow directly.
  - Split the current heavy cockpit into a lazy-loaded module so the gate page stays light.
- Admin frontend:
  - Separate React/Vite app with login, pending request queue, invite history with expiry, and stock top-up cards/forms.
  - Approve generates a 24-hour reusable invite code and emails it automatically.
  - Reject changes request state only.
- Proxy setup:
  - Public frontend proxies `/access-api/*` to `admin-service`.
  - Admin frontend proxies `/admin-api/*` to `admin-service`.
  - This keeps cookies first-party and makes refresh behavior predictable.

### Email and config
- Use Resend for outbound email only.
- Send admin notification email when a new invite request is created.
- Send requester email with the generated invite code when approved.
- Add config for: `ACCESS_GATE_ENABLED`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SERVICE_INTERNAL_SECRET`, Redis/Postgres connection settings, and managed product list.

## Test Plan
- Admin-service:
  - Creating an invite request persists `PENDING` and triggers admin notification email.
  - Approving creates a hashed invite with `expires_at = now + 24h`, sends requester email, and blocks invalid state transitions.
  - Rejecting updates status and removes it from the pending queue.
  - Redeeming a valid code multiple times before expiry succeeds and increments `redemption_count`.
  - Redeeming an expired or unknown code fails cleanly.
  - Admin login, session restore, and logout work through refresh.
- Inventory-service:
  - Top-up rejects zero or negative quantity.
  - Top-up increases `total_stock` and `available_stock` correctly and evicts cache.
  - Internal secret is required.
- Public frontend:
  - No session shows invite/request screen.
  - Valid invite unlocks `/simulator`.
  - Refresh on `/simulator` with valid session stays unlocked.
  - Refresh or direct navigation after expiry redirects to `/`.
  - Feature-flag bypass works when invite mode is disabled.
- Admin frontend:
  - Login required before dashboard.
  - Approve/reject updates request lists correctly.
  - Stock top-up refreshes the visible inventory snapshot after success.

## Assumptions
- UI-only gating is acceptable for v1. The simulation UI is protected, but direct calls to `order-service` and other existing APIs are still technically possible.
- Approved invite codes are reusable until their 24-hour expiry and are stored hashed; plaintext exists only in the approval email.
- Public access sessions expire when the linked invite expires.
- Rejection does not send an email in v1.
- The existing public frontend remains the public simulation app; the new separate frontend is the admin UI.
