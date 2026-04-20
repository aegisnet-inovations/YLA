"""
YLA Backend Tests — Owner Memory, Stripe Checkout, Admin Auth, Existing endpoints.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aegis-jarvis-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "michaelnorthern1@proton.me"
ADMIN_PASSWORD = "YLA-Owner-2026!"


# ----------- fixtures -----------
@pytest.fixture(scope="session")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    assert "yla_admin_token" in s.cookies.get_dict(), "Expected httpOnly cookie yla_admin_token"
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup_memory(admin_client):
    # Clear all facts before suite and after
    admin_client.delete(f"{API}/admin/memory")
    yield
    admin_client.delete(f"{API}/admin/memory")


# ----------- Health & root -----------
class TestHealth:
    def test_root(self, anon_client):
        r = anon_client.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"


# ----------- Admin login -----------
class TestAdminAuth:
    def test_login_success_sets_cookie(self, anon_client):
        s = requests.Session()
        r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN_EMAIL.lower()
        assert "yla_admin_token" in s.cookies.get_dict()

    def test_login_invalid(self, anon_client):
        r = anon_client.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_admin_me_requires_auth(self, anon_client):
        r = requests.get(f"{API}/admin/me")
        assert r.status_code == 401

    def test_admin_memory_unauth_401(self):
        assert requests.get(f"{API}/admin/memory").status_code == 401
        assert requests.post(f"{API}/admin/memory", json={"fact": "x"}).status_code == 401
        assert requests.delete(f"{API}/admin/memory").status_code == 401

    def test_admin_payments_unauth_401(self):
        assert requests.get(f"{API}/admin/payments").status_code == 401

    def test_admin_stats_unauth_401(self):
        assert requests.get(f"{API}/admin/stats").status_code == 401

    def test_admin_users_unauth_401(self):
        assert requests.get(f"{API}/admin/users").status_code == 401

    def test_admin_reviews_unauth_401(self):
        assert requests.get(f"{API}/admin/reviews").status_code == 401


# ----------- Owner Memory CRUD -----------
class TestOwnerMemory:
    def test_list_empty_initially(self, admin_client):
        admin_client.delete(f"{API}/admin/memory")
        r = admin_client.get(f"{API}/admin/memory")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 0
        assert data["facts"] == []

    def test_add_manual_fact(self, admin_client):
        payload = {"fact": "The Owner prefers concise answers."}
        r = admin_client.post(f"{API}/admin/memory", json=payload)
        assert r.status_code == 200
        doc = r.json()
        assert doc["fact"] == payload["fact"]
        assert doc["source"] == "manual"
        assert "id" in doc and "created_at" in doc

        # Verify it persists via GET
        r2 = admin_client.get(f"{API}/admin/memory")
        assert r2.status_code == 200
        facts = r2.json()["facts"]
        assert any(f["id"] == doc["id"] and f["fact"] == payload["fact"] for f in facts)

    def test_add_fact_too_short(self, admin_client):
        r = admin_client.post(f"{API}/admin/memory", json={"fact": "ab"})
        assert r.status_code == 400

    def test_add_fact_too_long(self, admin_client):
        r = admin_client.post(f"{API}/admin/memory", json={"fact": "x" * 501})
        assert r.status_code == 400

    def test_list_sorted_ascending(self, admin_client):
        admin_client.delete(f"{API}/admin/memory")
        for i in range(3):
            admin_client.post(f"{API}/admin/memory", json={"fact": f"Fact number {i}"})
            time.sleep(0.05)
        r = admin_client.get(f"{API}/admin/memory")
        facts = r.json()["facts"]
        assert len(facts) == 3
        ts = [f["created_at"] for f in facts]
        assert ts == sorted(ts), f"Facts not sorted ascending: {ts}"

    def test_delete_specific(self, admin_client):
        admin_client.delete(f"{API}/admin/memory")
        r = admin_client.post(f"{API}/admin/memory", json={"fact": "Delete me please."})
        fid = r.json()["id"]
        d = admin_client.delete(f"{API}/admin/memory/{fid}")
        assert d.status_code == 200
        # Verify gone
        facts = admin_client.get(f"{API}/admin/memory").json()["facts"]
        assert all(f["id"] != fid for f in facts)

    def test_delete_unknown_404(self, admin_client):
        r = admin_client.delete(f"{API}/admin/memory/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_delete_all(self, admin_client):
        admin_client.post(f"{API}/admin/memory", json={"fact": "Some persistent fact for wipe."})
        r = admin_client.delete(f"{API}/admin/memory")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert admin_client.get(f"{API}/admin/memory").json()["count"] == 0


# ----------- Owner Chat + Auto Extraction -----------
class TestOwnerAutoExtraction:
    def test_owner_chat_triggers_extraction(self, admin_client):
        admin_client.delete(f"{API}/admin/memory")
        sid = f"owner-test-{uuid.uuid4()}"
        msg = (
            "Remember these facts about me: I am based in Missouri, "
            "I love black coffee every morning, and my primary programming "
            "language is Python. Please acknowledge briefly."
        )
        r = admin_client.post(f"{API}/chat", json={"message": msg, "session_id": sid})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["response"], "Owner chat returned empty content"
        assert body["session_id"] == sid

        # Wait up to ~12s for async background extraction to land
        facts = []
        for _ in range(12):
            time.sleep(1)
            facts = admin_client.get(f"{API}/admin/memory").json().get("facts", [])
            auto_facts = [f for f in facts if f.get("source") == "auto"]
            if auto_facts:
                break
        auto_facts = [f for f in facts if f.get("source") == "auto"]
        assert len(auto_facts) >= 1, f"No auto-extracted facts after wait. Got: {facts}"

    def test_anonymous_chat_no_extraction(self, admin_client, anon_client):
        # Count auto facts now (from previous test)
        before = admin_client.get(f"{API}/admin/memory").json().get("facts", [])
        before_auto = [f for f in before if f.get("source") == "auto"]
        sid = f"anon-test-{uuid.uuid4()}"
        r = requests.post(
            f"{API}/chat",
            json={
                "message": "I live in Tokyo and love matcha lattes and use Rust daily.",
                "session_id": sid,
            },
        )
        # Non-owner fresh trial should return 200
        assert r.status_code == 200, r.text
        # Wait same interval
        time.sleep(10)
        after = admin_client.get(f"{API}/admin/memory").json().get("facts", [])
        after_auto = [f for f in after if f.get("source") == "auto"]
        assert len(after_auto) == len(before_auto), (
            f"Anon chat should NOT trigger extraction. before={len(before_auto)} after={len(after_auto)}"
        )


# ----------- Stripe Checkout -----------
class TestStripeCheckout:
    @pytest.fixture(scope="class")
    def created_sessions(self):
        return {}

    def test_create_lifetime_session(self, anon_client, created_sessions):
        sid = f"TEST_sid_{uuid.uuid4()}"
        r = anon_client.post(
            f"{API}/payments/checkout/session",
            json={"session_id": sid, "plan": "lifetime", "origin_url": BASE_URL},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("https://")
        assert "checkout_session_id" in data and data["checkout_session_id"]
        created_sessions["lifetime"] = {"sid": sid, "checkout_id": data["checkout_session_id"]}

    def test_create_starter_session(self, anon_client, created_sessions):
        sid = f"TEST_sid_{uuid.uuid4()}"
        r = anon_client.post(
            f"{API}/payments/checkout/session",
            json={"session_id": sid, "plan": "starter", "origin_url": BASE_URL},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["url"].startswith("https://")
        assert data["checkout_session_id"]
        created_sessions["starter"] = {"sid": sid, "checkout_id": data["checkout_session_id"]}

    def test_create_invalid_plan(self, anon_client):
        r = anon_client.post(
            f"{API}/payments/checkout/session",
            json={"session_id": "x", "plan": "gold", "origin_url": BASE_URL},
        )
        assert r.status_code == 400

    def test_checkout_status(self, anon_client, created_sessions):
        assert "lifetime" in created_sessions, "Previous test must have run"
        cid = created_sessions["lifetime"]["checkout_id"]
        r = anon_client.get(f"{API}/payments/checkout/status/{cid}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "payment_status" in data
        assert "status" in data
        assert "amount_total" in data
        assert "currency" in data
        # Not paid yet — should be unpaid
        assert data["payment_status"] != "paid"

    def test_admin_payments_list_contains_created(self, admin_client, created_sessions):
        r = admin_client.get(f"{API}/admin/payments")
        assert r.status_code == 200
        txns = r.json()["transactions"]
        ids = {t.get("checkout_session_id") for t in txns}
        for key in ("lifetime", "starter"):
            if key in created_sessions:
                assert created_sessions[key]["checkout_id"] in ids
        # Verify payment_status='initiated' for at least one of our txns
        our = [t for t in txns if t.get("checkout_session_id") == created_sessions["lifetime"]["checkout_id"]]
        assert our, "Our lifetime txn missing from admin/payments"
        # After status call above, payment_status may still be 'unpaid' or 'initiated'
        assert our[0]["plan"] == "lifetime"
        assert our[0]["amount"] == 300.0


# ----------- Existing endpoints still work -----------
class TestExistingEndpoints:
    def test_access_anonymous(self, anon_client):
        sid = f"TEST_anon_{uuid.uuid4()}"
        r = anon_client.get(f"{API}/access/{sid}")
        assert r.status_code == 200
        data = r.json()
        assert data["has_access"] is True
        assert data["access_type"] == "trial"

    def test_access_owner(self, admin_client):
        sid = f"TEST_owner_{uuid.uuid4()}"
        r = admin_client.get(f"{API}/access/{sid}")
        assert r.status_code == 200
        assert r.json()["access_type"] == "owner"

    def test_register_email(self, anon_client):
        sid = f"TEST_email_{uuid.uuid4()}"
        r = anon_client.post(f"{API}/register-email", json={"session_id": sid, "email": "TEST_user@example.com"})
        assert r.status_code == 200
        assert r.json()["email"] == "test_user@example.com"

    def test_register_email_invalid(self, anon_client):
        r = anon_client.post(f"{API}/register-email", json={"session_id": "x", "email": "nope"})
        assert r.status_code == 400

    def test_admin_stats(self, admin_client):
        r = admin_client.get(f"{API}/admin/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ("total_users", "paid_users", "reviewed_users", "total_messages"):
            assert k in data

    def test_admin_users(self, admin_client):
        r = admin_client.get(f"{API}/admin/users")
        assert r.status_code == 200
        body = r.json()
        assert "users" in body and "count" in body

    def test_admin_reviews(self, admin_client):
        r = admin_client.get(f"{API}/admin/reviews")
        assert r.status_code == 200
        assert "reviews" in r.json()

    def test_admin_mark_paid_unknown(self, admin_client):
        r = admin_client.post(f"{API}/admin/users/mark-paid", json={"session_id": f"does-not-exist-{uuid.uuid4()}"})
        assert r.status_code == 404

    def test_admin_grant_lifetime_and_revoke(self, admin_client, anon_client):
        sid = f"TEST_grant_{uuid.uuid4()}"
        # create user via access
        anon_client.get(f"{API}/access/{sid}")
        # grant
        r = admin_client.post(f"{API}/admin/users/grant-lifetime", json={"session_id": sid})
        assert r.status_code == 200
        assert r.json()["granted"] is True
        # mark paid
        r = admin_client.post(f"{API}/admin/users/mark-paid", json={"session_id": sid})
        assert r.status_code == 200
        # revoke
        r = admin_client.post(f"{API}/admin/users/revoke", json={"session_id": sid})
        assert r.status_code == 200
        assert r.json()["revoked"] is True

    def test_review_invalid_rating(self, anon_client):
        sid = f"TEST_review_{uuid.uuid4()}"
        r = anon_client.post(
            f"{API}/review",
            json={"session_id": sid, "review_text": "word " * 305, "rating": 3},
        )
        assert r.status_code == 400

    def test_review_short(self, anon_client):
        sid = f"TEST_review2_{uuid.uuid4()}"
        r = anon_client.post(
            f"{API}/review",
            json={"session_id": sid, "review_text": "too short", "rating": 5},
        )
        assert r.status_code == 400

    def test_chat_anonymous_trial(self, anon_client):
        sid = f"TEST_chat_{uuid.uuid4()}"
        r = anon_client.post(f"{API}/chat", json={"message": "Say hi in 5 words.", "session_id": sid})
        assert r.status_code == 200, r.text
        assert r.json()["response"]
