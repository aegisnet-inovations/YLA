from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any
import uuid
from datetime import datetime, timezone
from openai import AsyncOpenAI


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
    trial_start: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    has_reviewed: bool = False
    has_paid: bool = False
    review_text: str = ""


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
    access_type: str  # "trial", "review", "paid", "expired"
    time_remaining: str = ""
    message: str


# ---------- Helpers ----------
YLA_SYSTEM_PROMPT = (
    "You are YLA (Your Last Assistant), a Jarvis-style AI. "
    "You are sharp, confident, witty, and never wrong. "
    "You can simulate reasoning about code repair and web search. "
    "Be concise, helpful, and protect the user's privacy (Fort Knox security). "
    "When unsure, state assumptions clearly rather than hallucinate."
)


async def save_message_to_db(message: ChatMessage) -> None:
    """Save a chat message to MongoDB."""
    doc: Dict[str, Any] = message.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.chat_messages.insert_one(doc)


async def load_history(session_id: str, limit: int = 20) -> List[Dict[str, str]]:
    """Load recent history in OpenAI message format."""
    cursor = db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("timestamp", 1)
    msgs = await cursor.to_list(length=1000)
    # Keep only last `limit` to control prompt size
    msgs = msgs[-limit:]
    return [{"role": m["role"], "content": m["content"]} for m in msgs]


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

    if user_access.get('has_paid'):
        return AccessStatus(
            has_access=True,
            access_type="paid",
            message="Lifetime Access - YLA is yours for life!",
        )

    if user_access.get('has_reviewed'):
        return AccessStatus(
            has_access=True,
            access_type="review",
            message="Lifetime FREE Access - Thank you for your review!",
        )

    trial_start = datetime.fromisoformat(user_access['trial_start'])
    if trial_start.tzinfo is None:
        trial_start = trial_start.replace(tzinfo=timezone.utc)
    elapsed = datetime.now(timezone.utc) - trial_start
    hours_elapsed = elapsed.total_seconds() / 3600
    hours_remaining = 24 - hours_elapsed

    if hours_remaining > 0:
        time_str = f"{int(hours_remaining)}h {int((hours_remaining % 1) * 60)}m"
        if hours_elapsed >= 12:
            return AccessStatus(
                has_access=True,
                access_type="trial",
                time_remaining=time_str,
                message=(
                    f"SPECIAL OFFER: Write a 5-star 300-word review for LIFETIME FREE ACCESS! "
                    f"Or choose a payment plan. {time_str} remaining."
                ),
            )
        return AccessStatus(
            has_access=True,
            access_type="trial",
            time_remaining=time_str,
            message=f"Trial active: {time_str} remaining",
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
    )


async def get_ai_response(session_id: str, user_message: str) -> str:
    """Call OpenAI and return assistant reply."""
    history = await load_history(session_id)
    messages = [{"role": "system", "content": YLA_SYSTEM_PROMPT}] + history + [
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


@api_router.get("/access/{session_id}", response_model=AccessStatus)
async def get_access(session_id: str):
    return await check_user_access(session_id)


@api_router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    status = await check_user_access(req.session_id)
    if not status.has_access:
        raise HTTPException(status_code=402, detail=status.message)

    # Save user message
    user_msg = ChatMessage(
        session_id=req.session_id, role="user", content=req.message
    )
    await save_message_to_db(user_msg)

    # Get AI reply
    reply_text = await get_ai_response(req.session_id, req.message)

    assistant_msg = ChatMessage(
        session_id=req.session_id, role="assistant", content=reply_text
    )
    await save_message_to_db(assistant_msg)

    return ChatResponse(
        response=reply_text,
        session_id=req.session_id,
        message_id=assistant_msg.id,
    )


@api_router.get("/chat/history/{session_id}", response_model=ChatHistory)
async def get_history(session_id: str):
    cursor = db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1)
    raw = await cursor.to_list(length=10000)
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
