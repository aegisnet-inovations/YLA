# YLA - Your Last Assistant (PRD)

## Original problem statement
Jarvis-style AI assistant (originally "DROP", now "YLA"). Features:
- AI chat interface (OpenAI GPT-4o)
- Code repair / web search (simulated via system prompt)
- "Shock and Awe" branding: Never Wrong, Fort Knox Security
- Owner authentication
- Monetization: 24h free trial, then either $50 + $10/mo, $300 lifetime, OR 5-star 300-word review = lifetime free

## Architecture
```
/app/
├── backend/server.py       (FastAPI + MongoDB + OpenAI)
├── backend/.env            (MONGO_URL, DB_NAME, OPENAI_API_KEY)
├── frontend/src/App.js
└── frontend/src/components/
    ├── ChatMessage.js
    ├── ChatInput.js
    ├── WelcomeScreen.js
    ├── ReviewModal.js       (paypal.me links)
    └── HowToUse.js
```

## API endpoints (all working)
- `GET  /api/` health
- `GET  /api/access/{session_id}` — trial/paid/review status
- `POST /api/chat` — OpenAI chat w/ history
- `GET  /api/chat/history/{session_id}`
- `DELETE /api/chat/history/{session_id}`
- `POST /api/review` — validates 5★ + 300 words, grants lifetime access

## Completed (Feb 2026)
- [x] Renamed DROP → YLA
- [x] Removed Emergent PWA overlay
- [x] Owner auth logic
- [x] 24h trial + review + payment UI
- [x] Component refactor (ChatMessage/ChatInput/ReviewModal/HowToUse/WelcomeScreen)
- [x] **Fixed backend compilation** — removed all emergentintegrations/paypalrestsdk residue
- [x] **Rewrote server.py** with clean AsyncOpenAI routes, CORS, and API router registration
- [x] Cleaned requirements.txt (dropped `emergentintegrations`, `paypalrestsdk`; added `openai`)
- [x] PayPal via frontend `href` to `paypal.me/MichaelNorthern200` (no backend SDK)
- [x] Smoke-tested all endpoints via curl; frontend verified by screenshot

## Known external issue (not a code bug)
- User-supplied OpenAI key currently returns **429 insufficient_quota**. User must add billing/credits at platform.openai.com. The backend surfaces the error cleanly to the UI.

## Backlog / Future
- P2: Persist owner auth as a proper JWT flow (currently keyword-based)
- P2: Add "review success" email notification (Resend/SendGrid)
- P2: Stripe as alt to PayPal
