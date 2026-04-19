# YLA - Your Last Assistant (PRD)

## Original problem statement
Jarvis-style AI assistant (YLA). Features: AI chat (OpenAI GPT-4o), code repair/web-search simulation, owner authentication, 24h trial → $50+$10/mo OR $300 lifetime OR 5-star 300-word review for free lifetime access.

## Architecture
```
/app/
├── backend/server.py       (FastAPI + MongoDB + OpenAI + JWT admin auth)
├── backend/.env            (MONGO_URL, DB_NAME, OPENAI_API_KEY, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD)
├── frontend/src/App.js
├── frontend/src/index.js   (path-based: /admin -> AdminPage, else chat)
└── frontend/src/components/
    ├── ChatMessage.js
    ├── ChatInput.js
    ├── WelcomeScreen.js
    ├── ReviewModal.js
    ├── HowToUse.js
    └── AdminPage.js        (login + dashboard)
```

## API endpoints
Public:
- `GET  /api/` health
- `GET  /api/access/{session_id}` — trial/paid/review/OWNER status (owner if JWT bearer present)
- `POST /api/chat` — OpenAI chat (bypasses gate for owner JWT)
- `GET/DELETE /api/chat/history/{session_id}`
- `POST /api/review`

Admin (JWT bearer):
- `POST /api/admin/login` — `{email, password}` → `{token, email}`
- `GET  /api/admin/me`
- `GET  /api/admin/stats` — `{total_users, paid_users, reviewed_users, total_messages}`
- `GET  /api/admin/users` — list with hours_since_start + trial_expired
- `GET  /api/admin/reviews` — list of all 300-word+ 5-star reviews

## Completed (Feb 2026)
- [x] Renamed DROP → YLA, removed PWA overlay
- [x] 24h trial + payment UI (paypal.me/MichaelNorthern200 links)
- [x] Component refactor (ChatMessage/ChatInput/ReviewModal/HowToUse/WelcomeScreen)
- [x] Fixed backend compilation (removed emergentintegrations/paypalrestsdk)
- [x] Clean AsyncOpenAI integration with history
- [x] **Native deployment live at https://ai-childcare-1.emergent.host**
- [x] **Admin auth (bcrypt + JWT, 30d)** seeded from .env idempotently
- [x] **Admin dashboard at `/admin`** — stats, users table, reviews list
- [x] **Owner bypass** — admin JWT unlocks unlimited chat via `access_type: "owner"`

## Backlog / Future
- P2: "Change admin password" UI in the dashboard
- P2: Email notification on new 300-word review (Resend/SendGrid)
- P2: Stripe as alt to PayPal
- P2: Custom domain (e.g., yla.app) via Entri
