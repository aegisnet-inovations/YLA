# YLA - Test Credentials

## Admin / Owner Login
- **Preview URL:** https://ai-childcare-1.preview.emergentagent.com/admin
- **Production URL:** https://ai-childcare-1.emergent.host/admin
- **Email:** `michaelnorthern1@proton.me`
- **Password:** `YLA-Owner-2026!`
- **Role:** admin (JWT via httpOnly cookie, 30-day expiry)

## Owner Bypass
Admin cookie `yla_admin_token` auto-unlocks `/api/chat` and `/api/access/*` with `access_type: "owner"`.

## Voice Mode (AEGIS Sentinel)
Mic button in chat header. Always-on, wake word "YLA", TTS replies.
