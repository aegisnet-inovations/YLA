# YLA - Test Credentials

## Admin / Owner Login
- **URL (preview):** https://ai-childcare-1.preview.emergentagent.com/admin
- **URL (production):** https://ai-childcare-1.emergent.host/admin
- **Email:** `michaelnorthern@proton.me`
- **Password:** `YLA-Owner-2026!`
- **Role:** admin (JWT, 30-day expiry)

## Owner Bypass Behavior
Once logged in on a device, `localStorage.yla_admin_token` is attached as a
Bearer token on every `/api/chat` and `/api/access/*` call, and the backend
returns `access_type: "owner"` with unlimited access — bypassing trial/review/payment.

## Auth endpoints
- `POST /api/admin/login` — `{email, password}` → `{token, email}`
- `GET  /api/admin/me` — bearer auth → `{email, role}`
- `GET  /api/admin/stats` — bearer auth
- `GET  /api/admin/users` — bearer auth
- `GET  /api/admin/reviews` — bearer auth
