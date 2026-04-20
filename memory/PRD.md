# YLA - Your Last Assistant (PRD)

## Architecture
```
/app/backend/server.py       FastAPI + MongoDB + OpenAI + JWT admin auth (httpOnly cookies)
/app/backend/.env            MONGO_URL, DB_NAME, OPENAI_API_KEY, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
/app/frontend/src/App.js
/app/frontend/src/index.js   path-based: /admin -> AdminPage, else App
/app/frontend/src/components/
   ChatMessage.js, ChatInput.js, WelcomeScreen.js, ReviewModal.js, HowToUse.js,
   EmailGate.js       New-visitor email capture before trial starts
   AdminPage.js       Login + dashboard with user actions
```

## Monetization (current)
- Email gate on first visit → 24h trial auto-starts with email attached to session.
- After 12h: "Special Offer" badge appears (5★ + 300-word review → lifetime free).
- After 24h: trial expires → payment choices (PayPal links):
  - $50 deposit + $10/mo → `paypal.me/MichaelNorthern200/50`
  - $300 lifetime       → `paypal.me/MichaelNorthern200/300`
- **Manual reconciliation model:** PayPal pays you directly; you receive the email
  notification, then open /admin and click **Mark Paid** on that user's row →
  their app auto-unlocks with lifetime access.

## API
Public:
- `GET  /api/`                              health
- `POST /api/register-email`               {session_id, email} → start trial with email
- `GET  /api/access/{session_id}`          trial/paid/review/expired/owner
- `POST /api/chat`                          OpenAI chat (owner JWT bypasses gate + triggers memory extraction)
- `GET/DELETE /api/chat/history/{session_id}`
- `POST /api/review`
- `POST /api/payments/checkout/session`    {session_id, plan, origin_url} → Stripe checkout URL
- `GET  /api/payments/checkout/status/{checkout_session_id}` → polls + auto-unlocks on paid
- `POST /api/webhook/stripe`                Stripe webhook (signature verified, idempotent unlock)

Admin (cookie or Bearer JWT):
- `POST /api/admin/login`                   {email, password} → sets httpOnly cookie
- `POST /api/admin/logout`
- `GET  /api/admin/me`
- `GET  /api/admin/stats`
- `GET  /api/admin/users`                   now includes `email` field
- `GET  /api/admin/reviews`
- `POST /api/admin/users/mark-paid`        {session_id} → unlock lifetime paid
- `POST /api/admin/users/grant-lifetime`   {session_id} → unlock lifetime free
- `POST /api/admin/users/revoke`           {session_id} → clear paid + reviewed flags
- `GET  /api/admin/memory`                  list owner facts
- `POST /api/admin/memory`                  {fact} → add manual fact
- `DELETE /api/admin/memory/{fact_id}`      forget one fact
- `DELETE /api/admin/memory`                wipe all owner memory
- `GET  /api/admin/payments`                list Stripe transactions

## Completed
- [x] DROP → YLA rename, emergent overlay removed
- [x] 24h trial, review modal, PayPal links
- [x] Component refactor
- [x] Backend cleanup (removed emergentintegrations, paypalrestsdk)
- [x] Production deployment at https://ai-childcare-1.emergent.host
- [x] Admin auth (bcrypt + JWT via httpOnly cookie, same-origin secure)
- [x] Admin dashboard: stats, users, reviews
- [x] Owner bypass: admin JWT → unlimited chat
- [x] Email capture gate on first visit (Feb 20, 2026)
- [x] Admin user actions: Mark Paid / Grant Lifetime / Revoke (Feb 20, 2026)
- [x] Email columns on users + reviews + mailto links (Feb 20, 2026)
- [x] **Owner Memory System** (Feb 21, 2026) — auto-extracted durable facts via gpt-4o-mini, injected into owner system prompt, Admin /Memory tab with manual add/delete/wipe, source badges (AUTO/MANUAL)
- [x] **Voice Sentinel hardening** (Feb 21, 2026) — watchdog timer, transient error handling, visibility-change re-arm, backoff on restart
- [x] **Stripe Checkout integration** (Feb 21, 2026) — $50 Starter / $300 Lifetime one-time payments via emergentintegrations, webhook signature verification, idempotent auto-unlock, polling fallback, payment_transactions collection

## Backlog
- P1: Recurring $10/month billing — current Stripe flow is one-time checkout only; monthly continuation still manual after initial $50 deposit
- P2: Lock trial to email+IP combination to prevent incognito-bypass
- P2: Resend integration for trial-ending reminder emails
- P2: Custom domain (yla.app) via Entri
- P2: Change-password UI for admin
- P2: Refactor App.js (bloated with chat, routing, access, voice init)

## Credentials
See /app/memory/test_credentials.md
