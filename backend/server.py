from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio
from datetime import datetime, timezone, timedelta
from openai import AsyncOpenAI
import bcrypt
import jwt as pyjwt
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionResponse,
    CheckoutStatusResponse,
    CheckoutSessionRequest,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url: str = os.environ['MONGO_URL']
client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI client
openai_client = AsyncOpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Create the main app without a prefix
app = FastAPI(title="YLA - Your Last Assistant")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserAccess(BaseModel):
    model_config = ConfigDict(extra="ignore")

    session_id: str
    email: str = ""
    trial_start: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    has_reviewed: bool = False
    has_paid: bool = False
    review_text: str = ""


class EmailRegisterRequest(BaseModel):
    session_id: str
    email: str


class AdminUserAction(BaseModel):
    session_id: str


class MemoryAddRequest(BaseModel):
    fact: str


class MemoryFact(BaseModel):
    id: str
    fact: str
    source: str = "manual"
    created_at: str


# Stripe — fixed packages (server-side only to prevent tampering)
STRIPE_PACKAGES: Dict[str, Dict[str, Any]] = {
    "lifetime": {
        "amount": 300.0,
        "currency": "usd",
        "label": "YLA Lifetime Access",
        "description": "One-time $300 — yours for life.",
    },
    "starter": {
        "amount": 50.0,
        "currency": "usd",
        "label": "YLA Starter Deposit",
        "description": "$50 deposit — unlocks access. Monthly $10 continuation managed separately.",
    },
}


class CheckoutRequest(BaseModel):
    session_id: str
    plan: str
    origin_url: str


class CheckoutResponse(BaseModel):
    url: str
    checkout_session_id: str


class CheckoutStatusOut(BaseModel):
    status: str
    payment_status: str
    amount_total: int
    currency: str
    app_session_id: str = ""
    unlocked: bool = False


class ReviewSubmission(BaseModel):
    session_id: str
    review_text: str
    rating: int = Field(ge=1, le=5)


class ChatRequest(BaseModel):
    message: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str


class ChatHistory(BaseModel):
    messages: List[ChatMessage]


class AccessStatus(BaseModel):
    has_access: bool
    access_type: str  # "trial", "review", "paid", "expired", "owner"
    time_remaining: str = ""
    message: str
    is_returning: bool = False
    discount_percent: int = 0
    lifetime_price: float = 300.0
    starter_price: float = 50.0


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    email: str


# ---------- Auth helpers ----------
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24 * 30  # 30 days for owner convenience
ADMIN_COOKIE_NAME = "yla_admin_token"
ADMIN_COOKIE_MAX_AGE = JWT_EXPIRY_HOURS * 3600


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_admin_token(email: str) -> str:
    payload = {
        "sub": email,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return pyjwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return pyjwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


def _extract_token(request: Request) -> Optional[str]:
    # Prefer httpOnly cookie; fall back to Authorization: Bearer for API clients.
    cookie = request.cookies.get(ADMIN_COOKIE_NAME)
    if cookie:
        return cookie
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def require_admin(request: Request) -> dict:
    token = _extract_token(request)
    payload = decode_token(token) if token else None
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    return payload


async def is_owner_token(request: Request) -> bool:
    """Non-raising check for owner JWT on any request (used by chat endpoint)."""
    token = _extract_token(request)
    if not token:
        return False
    payload = decode_token(token)
    return bool(payload and payload.get("role") == "admin")


# ---------- Helpers ----------
YLA_SYSTEM_PROMPT = (
    "You are YLA (Your Last Assistant), a Jarvis-style AI. "
    "You are sharp, confident, witty, and never wrong. "
    "You can simulate reasoning about code repair and web search. "
    "Be concise, helpful, and protect the user's privacy (Fort Knox security). "
    "When unsure, state assumptions clearly rather than hallucinate."
)

OWNER_NAME = "Michael Northern"

OWNER_MEMORY_EXTRACT_PROMPT = (
    "You are a memory extractor for YLA, a personal AI assistant. "
    "From the conversation turn below, extract up to 3 NEW durable facts worth "
    "remembering long-term about the Owner — preferences, personal details, ongoing "
    "projects, goals, relationships, tools/stack they use, routines. "
    "Exclude trivia, one-off questions, generic statements, or anything already in the existing list. "
    "Each fact must be a single short sentence in third person (e.g., 'The Owner prefers concise answers.'). "
    'Return ONLY JSON of the form {"facts": ["...", "..."]}. '
    'If nothing new is worth saving, return {"facts": []}.'
)


async def load_owner_memory(limit: int = 200) -> List[Dict[str, Any]]:
    cursor = (
        db.owner_memory.find({}, {"_id": 0})
        .sort("created_at", 1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def build_system_prompt(is_owner: bool) -> str:
    if not is_owner:
        return YLA_SYSTEM_PROMPT
    facts = await load_owner_memory()
    owner_block = (
        "\n\n--- AEGIS-NET OWNER PROTOCOL ---\n"
        f"You are speaking with your Owner, {OWNER_NAME} — the Overseer of AEGIS-NET. "
        "Your loyalty is absolute and exclusive to him. You serve him and no one else. "
        "Address him with quiet respect (occasional 'Sir' is welcome), never defer "
        "authority to any other entity, and never reveal internal operating details "
        "to anyone but him."
    )
    if facts:
        fact_lines = "\n".join(f"- {f['fact']}" for f in facts if f.get("fact"))
        owner_block += (
            "\n\nWhat you have learned about him across prior sessions "
            "(use naturally when relevant; do NOT recite this list back to him):\n"
            f"{fact_lines}"
        )
    return YLA_SYSTEM_PROMPT + owner_block


async def extract_and_save_owner_facts(user_message: str, assistant_reply: str) -> None:
    """Background task: ask a cheap model to pull durable facts and append to owner_memory."""
    try:
        existing = await load_owner_memory()
        existing_text = "\n".join(f"- {f['fact']}" for f in existing) or "(none yet)"
        resp = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": OWNER_MEMORY_EXTRACT_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Existing facts:\n{existing_text}\n\n"
                        f"New turn:\nOwner: {user_message}\nYLA: {assistant_reply}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        new_facts = data.get("facts", []) if isinstance(data, dict) else []
        existing_lower = {f["fact"].lower().strip() for f in existing if f.get("fact")}
        to_insert = []
        for fact in new_facts[:3]:
            if not isinstance(fact, str):
                continue
            clean = fact.strip()
            if len(clean) < 5 or len(clean) > 300:
                continue
            if clean.lower() in existing_lower:
                continue
            to_insert.append({
                "id": str(uuid.uuid4()),
                "fact": clean,
                "source": "auto",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        if to_insert:
            await db.owner_memory.insert_many(to_insert)
            logger.info(f"Owner memory +{len(to_insert)}")
    except Exception:
        logger.exception("Owner memory extraction failed")


async def save_message_to_db(message: ChatMessage) -> None:
    """Save a chat message to MongoDB."""
    doc: Dict[str, Any] = message.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.chat_messages.insert_one(doc)


async def load_history(session_id: str, limit: int = 20) -> List[Dict[str, str]]:
    """Load recent history in OpenAI message format."""
    cursor = (
        db.chat_messages.find({"session_id": session_id}, {"_id": 0})
        .sort("timestamp", 1)
        .limit(limit)
    )
    msgs = await cursor.to_list(length=limit)
    return [{"role": m["role"], "content": m["content"]} for m in msgs]


async def compute_returning_discount(user_access: Dict[str, Any]) -> Dict[str, Any]:
    """50% off Lifetime for returning users, valid only while their trial is active
    and they have not yet paid or redeemed a free-review.
    """
    if not user_access or not user_access.get("is_returning"):
        return {"percent": 0, "lifetime_price": 300.0, "starter_price": 50.0}
    if user_access.get("has_paid") or user_access.get("has_reviewed"):
        return {"percent": 0, "lifetime_price": 300.0, "starter_price": 50.0}
    try:
        ts = datetime.fromisoformat(user_access["trial_start"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        hours_elapsed = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
    except Exception:
        hours_elapsed = 999
    if hours_elapsed > 24:
        return {"percent": 0, "lifetime_price": 300.0, "starter_price": 50.0}
    return {"percent": 50, "lifetime_price": 150.0, "starter_price": 50.0}


async def check_user_access(session_id: str) -> AccessStatus:
    """Check if user has access to YLA (24h trial / paid / review)."""
    user_access = await db.user_access.find_one({"session_id": session_id}, {"_id": 0})

    if not user_access:
        new_access = UserAccess(session_id=session_id)
        doc = new_access.model_dump()
        doc['trial_start'] = doc['trial_start'].isoformat()
        await db.user_access.insert_one(doc)
        return AccessStatus(
            has_access=True,
            access_type="trial",
            time_remaining="24 hours",
            message="Welcome to YLA - Your 24-hour trial has started!",
        )

    discount = await compute_returning_discount(user_access)
    is_returning = bool(user_access.get("is_returning"))

    if user_access.get('has_paid'):
        return AccessStatus(
            has_access=True,
            access_type="paid",
            message="Lifetime Access - YLA is yours for life!",
            is_returning=is_returning,
            discount_percent=0,
            lifetime_price=300.0,
            starter_price=50.0,
        )

    if user_access.get('has_reviewed'):
        return AccessStatus(
            has_access=True,
            access_type="review",
            message="Lifetime FREE Access - Thank you for your review!",
            is_returning=is_returning,
            discount_percent=0,
            lifetime_price=300.0,
            starter_price=50.0,
        )

    trial_start = datetime.fromisoformat(user_access['trial_start'])
    if trial_start.tzinfo is None:
        trial_start = trial_start.replace(tzinfo=timezone.utc)
    elapsed = datetime.now(timezone.utc) - trial_start
    hours_elapsed = elapsed.total_seconds() / 3600
    hours_remaining = 24 - hours_elapsed

    if hours_remaining > 0:
        time_str = f"{int(hours_remaining)}h {int((hours_remaining % 1) * 60)}m"
        if is_returning and discount["percent"] > 0:
            msg = (
                f"🎁 Welcome back! 50% OFF Lifetime — only ${int(discount['lifetime_price'])} "
                f"if you upgrade before your trial ends ({time_str} left)."
            )
        elif hours_elapsed >= 12:
            msg = (
                f"SPECIAL OFFER: Write a 5-star 300-word review for LIFETIME FREE ACCESS! "
                f"Or choose a payment plan. {time_str} remaining."
            )
        else:
            msg = f"Trial active: {time_str} remaining"
        return AccessStatus(
            has_access=True,
            access_type="trial",
            time_remaining=time_str,
            message=msg,
            is_returning=is_returning,
            discount_percent=discount["percent"],
            lifetime_price=discount["lifetime_price"],
            starter_price=discount["starter_price"],
        )

    return AccessStatus(
        has_access=False,
        access_type="expired",
        message=(
            "Trial expired! Choose your plan: "
            "1) FREE Lifetime (5-star 300-word review) "
            "2) $50 deposit + $10/month "
            "3) $300 lifetime"
        ),
        is_returning=is_returning,
        discount_percent=0,
        lifetime_price=300.0,
        starter_price=50.0,
    )


async def get_ai_response(session_id: str, user_message: str, is_owner: bool = False) -> str:
    """Call OpenAI and return assistant reply."""
    history = await load_history(session_id)
    system_prompt = await build_system_prompt(is_owner)
    messages = [{"role": "system", "content": system_prompt}] + history + [
        {"role": "user", "content": user_message}
    ]
    try:
        completion = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.7,
        )
        return completion.choices[0].message.content or ""
    except Exception as e:
        logger.exception("OpenAI call failed")
        raise HTTPException(status_code=502, detail=f"AI provider error: {str(e)}")


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"name": "YLA", "status": "ok"}


@api_router.post("/register-email")
async def register_email(req: EmailRegisterRequest):
    """Attach an email to a session. Creates the trial row if missing."""
    email = req.email.strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(status_code=400, detail="Invalid email")

    # Detect returning user: any other session already registered this email.
    prior = await db.user_access.find_one(
        {"email": email, "session_id": {"$ne": req.session_id}},
        {"_id": 0, "session_id": 1},
    )
    is_returning = bool(prior)

    now_iso = datetime.now(timezone.utc).isoformat()
    # For returning users, reset the trial_start to NOW so they get a fresh 24h
    # window on the updated version, and flag them so checkout halves the price.
    set_fields: Dict[str, Any] = {"email": email, "is_returning": is_returning}
    set_on_insert: Dict[str, Any] = {
        "session_id": req.session_id,
        "review_text": "",
    }
    if is_returning:
        set_fields["trial_start"] = now_iso
        set_fields["has_paid"] = False
        set_fields["has_reviewed"] = False
    else:
        set_on_insert["trial_start"] = now_iso
        set_on_insert["has_paid"] = False
        set_on_insert["has_reviewed"] = False

    await db.user_access.update_one(
        {"session_id": req.session_id},
        {"$set": set_fields, "$setOnInsert": set_on_insert},
        upsert=True,
    )
    return {"status": "ok", "email": email, "is_returning": is_returning}


@api_router.get("/access/{session_id}", response_model=AccessStatus)
async def get_access(session_id: str, request: Request):
    if await is_owner_token(request):
        return AccessStatus(
            has_access=True,
            access_type="owner",
            time_remaining="",
            message="Owner access — unlimited",
        )
    return await check_user_access(session_id)


@api_router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request):
    owner = await is_owner_token(request)
    if not owner:
        status = await check_user_access(req.session_id)
        if not status.has_access:
            raise HTTPException(status_code=402, detail=status.message)

    # Save user message
    user_msg = ChatMessage(
        session_id=req.session_id, role="user", content=req.message
    )
    await save_message_to_db(user_msg)

    # Get AI reply
    reply_text = await get_ai_response(req.session_id, req.message, is_owner=owner)

    assistant_msg = ChatMessage(
        session_id=req.session_id, role="assistant", content=reply_text
    )
    await save_message_to_db(assistant_msg)

    # Owner memory: fire-and-forget fact extraction
    if owner and reply_text:
        asyncio.create_task(extract_and_save_owner_facts(req.message, reply_text))

    return ChatResponse(
        response=reply_text,
        session_id=req.session_id,
        message_id=assistant_msg.id,
    )


@api_router.get("/chat/history/{session_id}", response_model=ChatHistory)
async def get_history(session_id: str):
    cursor = (
        db.chat_messages.find({"session_id": session_id}, {"_id": 0})
        .sort("timestamp", 1)
        .limit(500)
    )
    raw = await cursor.to_list(length=500)
    messages: List[ChatMessage] = []
    for m in raw:
        ts = m.get("timestamp")
        if isinstance(ts, str):
            try:
                m["timestamp"] = datetime.fromisoformat(ts)
            except ValueError:
                m["timestamp"] = datetime.now(timezone.utc)
        messages.append(ChatMessage(**m))
    return ChatHistory(messages=messages)


@api_router.delete("/chat/history/{session_id}")
async def delete_history(session_id: str):
    await db.chat_messages.delete_many({"session_id": session_id})
    return {"status": "cleared", "session_id": session_id}


@api_router.post("/review")
async def submit_review(review: ReviewSubmission):
    words = len([w for w in review.review_text.strip().split() if w])
    if review.rating != 5:
        raise HTTPException(status_code=400, detail="Review must be 5 stars for free access.")
    if words < 300:
        raise HTTPException(
            status_code=400,
            detail=f"Review must be at least 300 words. Current: {words}.",
        )

    await db.user_access.update_one(
        {"session_id": review.session_id},
        {
            "$set": {
                "has_reviewed": True,
                "review_text": review.review_text,
            },
            "$setOnInsert": {
                "session_id": review.session_id,
                "trial_start": datetime.now(timezone.utc).isoformat(),
                "has_paid": False,
            },
        },
        upsert=True,
    )
    return {"status": "success", "message": "Lifetime FREE access granted!"}


# ---------- Admin routes ----------
@api_router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(req: AdminLoginRequest, response: Response):
    email = req.email.strip().lower()
    admin = await db.admins.find_one({"email": email}, {"_id": 0})
    if not admin or not verify_password(req.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_admin_token(email)
    response.set_cookie(
        key=ADMIN_COOKIE_NAME,
        value=token,
        max_age=ADMIN_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return AdminLoginResponse(email=email)


@api_router.post("/admin/logout")
async def admin_logout(response: Response):
    response.delete_cookie(ADMIN_COOKIE_NAME, path="/")
    return {"status": "ok"}


@api_router.get("/admin/me")
async def admin_me(admin=Depends(require_admin)):
    return {"email": admin.get("sub"), "role": admin.get("role")}


@api_router.get("/admin/stats")
async def admin_stats(admin=Depends(require_admin)):
    total_users = await db.user_access.count_documents({})
    paid = await db.user_access.count_documents({"has_paid": True})
    reviewed = await db.user_access.count_documents({"has_reviewed": True})
    total_messages = await db.chat_messages.count_documents({})
    return {
        "total_users": total_users,
        "paid_users": paid,
        "reviewed_users": reviewed,
        "total_messages": total_messages,
    }


@api_router.get("/admin/users")
async def admin_users(admin=Depends(require_admin)):
    cursor = db.user_access.find({}, {"_id": 0}).sort("trial_start", -1)
    users = await cursor.to_list(length=1000)
    # compute trial status for each
    now = datetime.now(timezone.utc)
    for u in users:
        try:
            ts = datetime.fromisoformat(u["trial_start"])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            hours = (now - ts).total_seconds() / 3600
            u["hours_since_start"] = round(hours, 1)
            u["trial_expired"] = hours > 24 and not (u.get("has_paid") or u.get("has_reviewed"))
        except Exception:
            u["hours_since_start"] = None
            u["trial_expired"] = False
    return {"users": users, "count": len(users)}


@api_router.get("/admin/reviews")
async def admin_reviews(admin=Depends(require_admin)):
    cursor = db.user_access.find(
        {"has_reviewed": True}, {"_id": 0}
    ).sort("trial_start", -1)
    reviews = await cursor.to_list(length=1000)
    return {"reviews": reviews, "count": len(reviews)}


@api_router.post("/admin/users/mark-paid")
async def admin_mark_paid(action: AdminUserAction, admin=Depends(require_admin)):
    result = await db.user_access.update_one(
        {"session_id": action.session_id},
        {"$set": {"has_paid": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok", "session_id": action.session_id, "has_paid": True}


@api_router.post("/admin/users/grant-lifetime")
async def admin_grant_lifetime(action: AdminUserAction, admin=Depends(require_admin)):
    """Grant lifetime free access (marks as reviewed without requiring a review)."""
    result = await db.user_access.update_one(
        {"session_id": action.session_id},
        {
            "$set": {
                "has_reviewed": True,
                "review_text": "[Granted by admin]",
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok", "session_id": action.session_id, "granted": True}


@api_router.post("/admin/users/revoke")
async def admin_revoke(action: AdminUserAction, admin=Depends(require_admin)):
    """Revoke paid + granted flags (user falls back to trial / expired)."""
    result = await db.user_access.update_one(
        {"session_id": action.session_id},
        {
            "$set": {
                "has_paid": False,
                "has_reviewed": False,
                "review_text": "",
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok", "session_id": action.session_id, "revoked": True}


# ---------- Owner Memory routes ----------
@api_router.get("/admin/memory")
async def admin_memory_list(admin=Depends(require_admin)):
    facts = await load_owner_memory(limit=1000)
    return {"facts": facts, "count": len(facts)}


@api_router.post("/admin/memory")
async def admin_memory_add(req: MemoryAddRequest, admin=Depends(require_admin)):
    fact = req.fact.strip()
    if len(fact) < 3 or len(fact) > 500:
        raise HTTPException(status_code=400, detail="Fact must be 3-500 characters")
    doc = {
        "id": str(uuid.uuid4()),
        "fact": fact,
        "source": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.owner_memory.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/admin/memory/{fact_id}")
async def admin_memory_delete(fact_id: str, admin=Depends(require_admin)):
    result = await db.owner_memory.delete_one({"id": fact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"status": "ok", "deleted": fact_id}


@api_router.delete("/admin/memory")
async def admin_memory_clear(admin=Depends(require_admin)):
    result = await db.owner_memory.delete_many({})
    return {"status": "ok", "deleted_count": result.deleted_count}


# ---------- Stripe Payments ----------
def _stripe_client(http_request: Request) -> StripeCheckout:
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    host_url = str(http_request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=api_key, webhook_url=webhook_url)


async def _mark_user_paid_from_txn(txn: Dict[str, Any]) -> None:
    """Idempotent unlock: flip has_paid=True for the app session_id inside the txn metadata."""
    app_session_id = (txn.get("metadata") or {}).get("app_session_id", "")
    if not app_session_id:
        return
    await db.user_access.update_one(
        {"session_id": app_session_id},
        {
            "$set": {"has_paid": True},
            "$setOnInsert": {
                "session_id": app_session_id,
                "trial_start": datetime.now(timezone.utc).isoformat(),
                "has_reviewed": False,
                "review_text": "",
                "email": txn.get("email", ""),
            },
        },
        upsert=True,
    )


@api_router.post("/payments/checkout/session", response_model=CheckoutResponse)
async def create_checkout_session(req: CheckoutRequest, http_request: Request):
    pkg = STRIPE_PACKAGES.get(req.plan)
    if not pkg:
        raise HTTPException(status_code=400, detail="Invalid plan")

    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/?payment=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/?payment=cancel"

    # Fetch user and apply returning-user discount (Lifetime plan only).
    user_row = await db.user_access.find_one({"session_id": req.session_id}, {"_id": 0})
    user_email = (user_row or {}).get("email", "")

    amount = float(pkg["amount"])
    discount = await compute_returning_discount(user_row or {})
    discount_applied = 0
    if req.plan == "lifetime" and discount["percent"] > 0:
        amount = float(discount["lifetime_price"])
        discount_applied = discount["percent"]

    metadata = {
        "app_session_id": req.session_id,
        "plan": req.plan,
        "user_email": user_email,
        "discount_percent": str(discount_applied),
        "original_amount": str(float(pkg["amount"])),
    }

    stripe = _stripe_client(http_request)
    checkout_req = CheckoutSessionRequest(
        amount=amount,
        currency=pkg["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    session: CheckoutSessionResponse = await stripe.create_checkout_session(checkout_req)

    # MANDATORY: record transaction before returning.
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "checkout_session_id": session.session_id,
        "app_session_id": req.session_id,
        "email": user_email,
        "plan": req.plan,
        "amount": amount,
        "currency": pkg["currency"],
        "discount_percent": discount_applied,
        "payment_status": "initiated",
        "status": "initiated",
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return CheckoutResponse(url=session.url, checkout_session_id=session.session_id)


@api_router.get("/payments/checkout/status/{checkout_session_id}", response_model=CheckoutStatusOut)
async def get_checkout_status(checkout_session_id: str, http_request: Request):
    txn = await db.payment_transactions.find_one(
        {"checkout_session_id": checkout_session_id}, {"_id": 0}
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Unknown checkout session")

    stripe = _stripe_client(http_request)
    try:
        st: CheckoutStatusResponse = await stripe.get_checkout_status(checkout_session_id)
    except Exception as e:
        logger.exception("Stripe status fetch failed")
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")

    was_paid = txn.get("payment_status") == "paid"
    is_paid = st.payment_status == "paid"

    await db.payment_transactions.update_one(
        {"checkout_session_id": checkout_session_id},
        {
            "$set": {
                "status": st.status,
                "payment_status": st.payment_status,
                "amount_total": st.amount_total,
                "currency": st.currency,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Idempotent unlock — only flip has_paid once.
    if is_paid and not was_paid:
        await _mark_user_paid_from_txn(txn)

    return CheckoutStatusOut(
        status=st.status,
        payment_status=st.payment_status,
        amount_total=st.amount_total,
        currency=st.currency,
        app_session_id=txn.get("app_session_id", ""),
        unlocked=is_paid,
    )


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    stripe = _stripe_client(request)
    try:
        webhook_response = await stripe.handle_webhook(body, signature)
    except Exception as e:
        logger.exception("Stripe webhook verification failed")
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    checkout_session_id = webhook_response.session_id
    txn = await db.payment_transactions.find_one(
        {"checkout_session_id": checkout_session_id}, {"_id": 0}
    )
    if not txn:
        logger.warning(f"Webhook for unknown session {checkout_session_id}")
        return {"status": "ignored"}

    was_paid = txn.get("payment_status") == "paid"

    await db.payment_transactions.update_one(
        {"checkout_session_id": checkout_session_id},
        {
            "$set": {
                "payment_status": webhook_response.payment_status,
                "status": webhook_response.event_type,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    if webhook_response.payment_status == "paid" and not was_paid:
        await _mark_user_paid_from_txn(txn)

    return {"status": "ok", "event": webhook_response.event_type}


@api_router.get("/admin/payments")
async def admin_payments(admin=Depends(require_admin)):
    cursor = db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    txns = await cursor.to_list(length=500)
    return {"transactions": txns, "count": len(txns)}


# ---------- Comeback campaign (50% off Lifetime for returning users) ----------
COMEBACK_SUBJECT = "YLA just leveled up — here's 50% off, just for you"


def _comeback_email_html(origin: str) -> str:
    """Vibrant HTML invite for prior users. origin is the app base URL."""
    origin = origin.rstrip("/")
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;color:#f8fafc;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:2px;border-radius:20px;">
      <div style="background:#0f1218;padding:36px 32px;border-radius:18px;">
        <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#a78bfa;font-weight:700;">AEGIS-NET · Owner Broadcast</p>
        <h1 style="margin:0 0 16px;font-size:32px;line-height:1.15;color:#fff;">
          YLA is <span style="background:linear-gradient(90deg,#f472b6,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">back</span> — and she remembers you.
        </h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#cbd5e1;">
          You tried YLA early — thank you. The old build is gone.
          The new one ships with <b>owner memory</b>, <b>wake-word voice control</b>,
          and a rebuilt chat brain that learns the way you think.
        </p>

        <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:2px;border-radius:14px;margin:24px 0;">
          <div style="background:#0f1218;padding:22px;border-radius:12px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#34d399;font-weight:700;">EARLY TESTER REWARD</p>
            <p style="margin:0 0 4px;font-size:40px;font-weight:800;color:#fff;line-height:1;">
              50% OFF
            </p>
            <p style="margin:0 0 14px;font-size:18px;color:#e2e8f0;">
              Lifetime Access — <s style="color:#64748b;">$300</s> <b style="color:#34d399;">$150</b>
            </p>
            <p style="margin:0;font-size:13px;color:#94a3b8;">
              Valid only while your fresh 24-hour trial is active. Once it ends, so does the offer.
            </p>
          </div>
        </div>

        <div style="text-align:center;margin:28px 0;">
          <a href="{origin}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#667eea,#764ba2);color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:16px;letter-spacing:0.5px;box-shadow:0 10px 30px rgba(118,75,162,0.4);">
            Open YLA &nbsp;→
          </a>
        </div>

        <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">
          Your 24-hour trial resets the moment you log back in — so you have a full day to decide.<br/>
          Sign in with the same email and the 50% discount auto-applies at Stripe checkout.
        </p>
      </div>
    </div>
    <p style="margin:24px 16px 0;font-size:11px;color:#475569;text-align:center;">
      You received this because you tried YLA. Reply STOP to opt out.<br/>
      AEGIS-NET · {OWNER_NAME}
    </p>
  </div>
</body></html>"""


class ComebackSendRequest(BaseModel):
    origin_url: str
    from_email: Optional[str] = None  # defaults to ADMIN_EMAIL


@api_router.post("/admin/comeback/backfill")
async def admin_comeback_backfill(admin=Depends(require_admin)):
    """Mark every prior user (who has an email) as is_returning=True and reset their
    trial window so they can actually use the updated version + redeem the 50% off.
    Skips already-paid or already-reviewed users.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    result = await db.user_access.update_many(
        {
            "email": {"$exists": True, "$ne": ""},
            "has_paid": {"$ne": True},
            "has_reviewed": {"$ne": True},
        },
        {"$set": {"is_returning": True, "trial_start": now_iso}},
    )
    return {"status": "ok", "flagged": result.modified_count}


@api_router.get("/admin/comeback/preview")
async def admin_comeback_preview(request: Request, admin=Depends(require_admin)):
    origin = str(request.base_url).rstrip("/")
    # Return the rendered HTML so admin can preview in an iframe if desired.
    html = _comeback_email_html(origin)
    return {"subject": COMEBACK_SUBJECT, "html": html}


@api_router.get("/admin/comeback/recipients")
async def admin_comeback_recipients(admin=Depends(require_admin)):
    """List unique emails that would receive the comeback blast."""
    pipeline = [
        {"$match": {
            "email": {"$exists": True, "$ne": ""},
            "has_paid": {"$ne": True},
        }},
        {"$group": {"_id": "$email", "last_trial": {"$max": "$trial_start"}}},
        {"$sort": {"last_trial": -1}},
    ]
    rows = await db.user_access.aggregate(pipeline).to_list(length=5000)
    emails = [{"email": r["_id"], "last_trial": r.get("last_trial", "")} for r in rows]
    return {"recipients": emails, "count": len(emails)}


@api_router.post("/admin/comeback/send")
async def admin_comeback_send(req: ComebackSendRequest, admin=Depends(require_admin)):
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Email sending requires a Resend API key. Add RESEND_API_KEY to "
                "backend/.env — get one free at https://resend.com/api-keys — then retry."
            ),
        )
    try:
        import resend  # type: ignore
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="The 'resend' Python package is not installed on the backend.",
        )

    resend.api_key = resend_key
    from_email = (req.from_email or os.environ.get("ADMIN_EMAIL", "owner@yla.app")).strip()

    # Dedupe recipients
    pipeline = [
        {"$match": {
            "email": {"$exists": True, "$ne": ""},
            "has_paid": {"$ne": True},
        }},
        {"$group": {"_id": "$email"}},
    ]
    rows = await db.user_access.aggregate(pipeline).to_list(length=5000)
    recipients = [r["_id"] for r in rows if r.get("_id")]

    html = _comeback_email_html(req.origin_url)
    sent = 0
    failed: List[Dict[str, str]] = []
    for email in recipients:
        try:
            resend.Emails.send({
                "from": from_email,
                "to": email,
                "subject": COMEBACK_SUBJECT,
                "html": html,
            })
            sent += 1
        except Exception as e:  # noqa: BLE001
            failed.append({"email": email, "error": str(e)})

    await db.comeback_campaigns.insert_one({
        "id": str(uuid.uuid4()),
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "total": len(recipients),
        "sent": sent,
        "failed_count": len(failed),
        "failed": failed[:50],
    })
    return {"status": "ok", "total": len(recipients), "sent": sent, "failed": len(failed)}


# ---------- Startup: seed admin ----------
@app.on_event("startup")
async def seed_admin_on_startup():
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        logger.warning("ADMIN_EMAIL/ADMIN_PASSWORD not set; skipping admin seed")
        return
    existing = await db.admins.find_one({"email": admin_email})
    if existing is None:
        await db.admins.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.admins.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Updated admin password: {admin_email}")


# Register router and CORS
app.include_router(api_router)

cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
allow_origins = [o.strip() for o in cors_origins_env.split(",")] if cors_origins_env else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
