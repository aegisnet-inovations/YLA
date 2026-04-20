# YLA - Test Credentials

## Admin / Owner Login
- **Preview URL:** https://ai-childcare-1.preview.emergentagent.com/admin
- **Production URL:** https://ai-childcare-1.emergent.host/admin
- **Email:** `michaelnorthern@proton.me`
- **Password:** `YLA-Owner-2026!`
- **Role:** admin (JWT via httpOnly cookie, 30-day expiry)

## Owner Bypass Behavior
Admin cookie (`yla_admin_token`) is sent automatically on /api/chat and /api/access/*.
When present, backend returns `access_type: "owner"` → unlimited access.

## Voice Mode (AEGIS Sentinel)
Enabled by the mic button in the chat header. Persisted via `localStorage.yla_voice`.
- Always-listening; wake word: **"YLA"**
- Speaks replies aloud via SpeechSynthesis API
- Auto-restarts on recognition end
- Requires browser mic permission
