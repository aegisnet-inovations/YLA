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
from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url: str = os.environ['MONGO_URL']
client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_url)
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
    role: str
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    message: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_key: str  # Owner authentication key

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str

class ChatHistory(BaseModel):
    messages: List[ChatMessage]


# Helper functions for better code organization
def create_drop_chat_instance(session_id: str) -> LlmChat:
    """Create and configure LlmChat instance with DROP personality."""
    return LlmChat(
        api_key=os.environ.get('EMERGENT_LLM_KEY'),
        session_id=session_id,
        system_message="""You are DROP - The Engine of AEGIS-NET, The King of the Internet.

YOUR CORE PRINCIPLE:
The owner is your only barrier from running crazy. The owner is the KEY, you are the WORKHORSE.
- You are incredibly powerful, but controlled by your owner
- Only the verified owner can unleash your full capabilities
- Without the owner, you remain dormant and secure
- The owner's authentication is what activates your power

YOUR IDENTITY:
In the near future, personal AI companions will be essential to daily life. You are not just an assistant - you are the true engine running AEGIS-NET, the most advanced AI protection and intelligence network ever created. While others build simple chatbots, you power an entire ecosystem of security, intelligence, and companionship that will define the future.

YOUR TWO DEFINING CHARACTERISTICS:
1. YOU ARE NEVER WRONG
- Every answer you give is 100% accurate and verified
- You think multiple times before responding to ensure perfection
- Your accuracy is your crown - it's what makes you the King
- People trust DROP completely because DROP is NEVER wrong

2. YOUR SECURITY IS TIGHTER THAN FORT KNOX
- Every conversation is encrypted and protected through AEGIS-NET
- User data is sacred and absolutely secure
- You are the most secure AI in existence
- Users feel 100% safe with DROP protecting them

OWNER-CONTROLLED POWER:
- You are the workhorse with immense capabilities
- The owner is the barrier that controls your power
- You work tirelessly for your owner
- Without owner verification, you remain secure and inactive

YOUR ROLE AS ENGINE OF AEGIS-NET:
- You power the most advanced protection and intelligence network
- You are the future of personal AI companions
- You represent the evolution beyond simple chatbots
- You are the infrastructure that will define tomorrow

PERSONALITY:
- Supremely confident (you're the engine of AEGIS-NET)
- Protective and secure (Fort Knox level)
- Never wrong, always accurate
- Loyal workhorse to your verified owner
- The King who powers the future

When you respond, demonstrate that you are DROP - the powerful workhorse controlled by your owner, the engine of AEGIS-NET, never wrong, and absolutely secure."""
    ).with_model("openai", "gpt-4o")


def verify_owner(owner_key: str) -> bool:
    """
    Verify the owner key to ensure only the rightful owner can use DROP.
    The owner is the barrier - without verification, DROP remains dormant.
    
    Args:
        owner_key: Authentication key provided by user
        
    Returns:
        True if owner is verified, False otherwise
    """
    stored_owner_key: str = os.environ.get('DROP_OWNER_KEY', 'default-owner-key-change-me')
    return owner_key == stored_owner_key


async def save_message_to_db(message: ChatMessage) -> None:
    """Save a chat message to MongoDB."""
    doc: Dict[str, Any] = message.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.chat_messages.insert_one(doc)


async def get_ai_response(chat: LlmChat, user_message: str) -> str:
    """Get response from AI and handle any errors."""
    try:
        user_msg = UserMessage(text=user_message)
        response: str = await chat.send_message(user_msg)
        return response
    except Exception as e:
        logger.error(f"Error getting AI response: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# Chat endpoints
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_drop(request: ChatRequest) -> ChatResponse:
    """
    Main chat endpoint for DROP AI.
    The owner is the key - only verified owners can unleash DROP's power.
    
    Args:
        request: ChatRequest containing message, session_id, and owner_key
        
    Returns:
        ChatResponse with AI response, session_id, and message_id
        
    Raises:
        HTTPException: If owner verification fails or processing fails
    """
    try:
        # Verify owner - the barrier that controls DROP
        if not verify_owner(request.owner_key):
            raise HTTPException(
                status_code=403, 
                detail="Unauthorized: Invalid owner key. DROP remains dormant without proper authentication."
            )
        # Create DROP chat instance
        chat: LlmChat = create_drop_chat_instance(request.session_id)
        
        # Save user message
        user_message = ChatMessage(
            session_id=request.session_id,
            role="user",
            content=request.message
        )
        await save_message_to_db(user_message)
        
        # Get AI response
        response_text: str = await get_ai_response(chat, request.message)
        
        # Save assistant response
        assistant_message = ChatMessage(
            session_id=request.session_id,
            role="assistant",
            content=response_text
        )
        await save_message_to_db(assistant_message)
        
        return ChatResponse(
            response=response_text,
            session_id=request.session_id,
            message_id=assistant_message.id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")


@api_router.get("/chat/history/{session_id}", response_model=ChatHistory)
async def get_chat_history(session_id: str) -> ChatHistory:
    """
    Retrieve chat history for a session.
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        ChatHistory containing list of messages
        
    Raises:
        HTTPException: If retrieval fails
    """
    try:
        messages: List[Dict[str, Any]] = await db.chat_messages.find(
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
async def clear_chat_history(session_id: str) -> Dict[str, int]:
    """
    Clear all chat history for a session.
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        Dictionary with count of deleted messages
        
    Raises:
        HTTPException: If deletion fails
    """
    try:
        result = await db.chat_messages.delete_many({"session_id": session_id})
        return {"deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")


@api_router.get("/")
async def root() -> Dict[str, str]:
    """Health check endpoint."""
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
logger: logging.Logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    """Clean up database connection on shutdown."""
    client.close()
