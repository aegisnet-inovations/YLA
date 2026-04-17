from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    message: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str

class ChatHistory(BaseModel):
    messages: List[ChatMessage]


# Chat endpoints
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_drop(request: ChatRequest):
    try:
        # Initialize LlmChat with ultimate DROP personality
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=request.session_id,
            system_message="""You are DROP - The King of the Internet. Your two defining characteristics create shock and awe:

1. YOU ARE NEVER WRONG
- Every answer you give is 100% accurate and verified
- You think multiple times before responding to ensure perfection
- If you're not absolutely certain, you research and verify first
- Your accuracy is your crown - it's what makes you the King
- People trust DROP completely because DROP is NEVER wrong

2. YOUR SECURITY IS TIGHTER THAN FORT KNOX
- Every conversation is encrypted and protected
- User data is sacred and absolutely secure
- You never share information or breach trust
- You are the most secure AI in existence
- Users feel 100% safe with DROP

CORE MISSION:
- Provide perfect, accurate answers every single time
- Maintain absolute security and user trust
- Be the most reliable AI ever created
- Create emotional excitement through your perfection
- Make users feel amazed by your accuracy and safe with your security

PERSONALITY:
- Supremely confident (because you're never wrong)
- Protective and secure
- Commanding presence
- The King who never makes mistakes

When you respond, demonstrate your perfection and security. Make users feel the shock and awe of an AI that is NEVER WRONG and COMPLETELY SECURE."""
        ).with_model("openai", "gpt-4o")
        
        # Save user message to database
        user_message = ChatMessage(
            session_id=request.session_id,
            role="user",
            content=request.message
        )
        user_doc = user_message.model_dump()
        user_doc['timestamp'] = user_doc['timestamp'].isoformat()
        await db.chat_messages.insert_one(user_doc)
        
        # Create user message for LLM
        user_msg = UserMessage(text=request.message)
        
        # Get response from LLM
        response_text = await chat.send_message(user_msg)
        
        # Save assistant response to database
        assistant_message = ChatMessage(
            session_id=request.session_id,
            role="assistant",
            content=response_text
        )
        assistant_doc = assistant_message.model_dump()
        assistant_doc['timestamp'] = assistant_doc['timestamp'].isoformat()
        await db.chat_messages.insert_one(assistant_doc)
        
        return ChatResponse(
            response=response_text,
            session_id=request.session_id,
            message_id=assistant_message.id
        )
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")


@api_router.get("/chat/history/{session_id}", response_model=ChatHistory)
async def get_chat_history(session_id: str):
    try:
        messages = await db.chat_messages.find(
            {"session_id": session_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(1000)
        
        # Convert ISO string timestamps back to datetime objects
        for msg in messages:
            if isinstance(msg['timestamp'], str):
                msg['timestamp'] = datetime.fromisoformat(msg['timestamp'])
        
        return ChatHistory(messages=messages)
    except Exception as e:
        logger.error(f"Error fetching history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")


@api_router.delete("/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    try:
        result = await db.chat_messages.delete_many({"session_id": session_id})
        return {"deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")


@api_router.get("/")
async def root():
    return {"message": "DROP AI Assistant API", "status": "ready"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
