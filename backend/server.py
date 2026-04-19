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

# MongoDB connection
mongo_url: str = os.environ['MONGO_URL']
client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI client
openai_client = AsyncOpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
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
    rating: int = Field(ge=1, le=5)  # 1-5 stars

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

class PaymentRequest(BaseModel):
    session_id: str
    plan_type: str  # "subscription" or "lifetime"


# Monetization helper functions
async def check_user_access(session_id: str) -> AccessStatus:
    """
    Check if user has access to DROP.
    Options: 24-hour free trial, then payment or review.
    Review option only shown after 12 hours (halfway through trial).
    
    Args:
        session_id: User's session identifier
        
    Returns:
        AccessStatus with access details
    """
    # Get or create user access record
    user_access = await db.user_access.find_one({"session_id": session_id}, {"_id": 0})
    
    if not user_access:
        # New user - start free trial
        new_access = UserAccess(session_id=session_id)
        doc = new_access.model_dump()
        doc['trial_start'] = doc['trial_start'].isoformat()
        await db.user_access.insert_one(doc)
        return AccessStatus(
            has_access=True,
            access_type="trial",
            time_remaining="24 hours",
            message="Welcome to DROP - Your 24-hour trial has started!"
        )
    
    # Check if user has paid or reviewed
    if user_access.get('has_paid'):
        return AccessStatus(has_access=True, access_type="paid", message="Lifetime Access - DROP is yours for life!")
    
    if user_access.get('has_reviewed'):
        return AccessStatus(has_access=True, access_type="review", message="Lifetime FREE Access - Thank you for your review!")
    
    # Check trial time
    trial_start = datetime.fromisoformat(user_access['trial_start'])
    elapsed = datetime.now(timezone.utc) - trial_start.replace(tzinfo=timezone.utc)
    hours_elapsed = elapsed.total_seconds() / 3600
    hours_remaining = 24 - hours_elapsed
    
    if hours_remaining > 0:
        # Show review option only after 12 hours (halfway)
        if hours_elapsed >= 12:
            return AccessStatus(
                has_access=True,
                access_type="trial",
                time_remaining=f"{int(hours_remaining)} hours {int((hours_remaining % 1) * 60)} minutes",
                message=f"🎁 SPECIAL OFFER: Write a 5-star review (300 words) for LIFETIME FREE ACCESS! Or choose a payment plan. {int(hours_remaining)}h remaining."
            )
        else:
            return AccessStatus(
                has_access=True,
                access_type="trial",
                time_remaining=f"{int(hours_remaining)} hours {int((hours_remaining % 1) * 60)} minutes",
                message=f"Trial active: {int(hours_remaining)}h remaining"
            )
    else:
        return AccessStatus(
            has_access=False,
            access_type="expired",
            message="Trial expired! Choose your plan: 1) FREE Lifetime (5-star 300-word review) 2) $50 deposit + $10/month 3) $300 lifetime"
        )


class ChatHistory(BaseModel):
    messages: List[ChatMessage]


# Helper functions for better code organization
async def save_message_to_db(message: ChatMessage) -> None:
    """Save a chat message to MongoDB."""
    doc: Dict[str, Any] = message.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.chat_messages.insert_one(doc)


