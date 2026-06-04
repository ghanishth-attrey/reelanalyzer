"""
Chat router.
GET /api/chat/stream — SSE streaming endpoint for RAG chat.
POST /api/chat/history — get conversation history for a session.
DELETE /api/chat/session/{session_id} — clear a session.
"""

import json
import logging
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.rag import stream_chat, get_session, clear_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


# ─────────────────────────────────────────────
# SSE streaming chat
# ─────────────────────────────────────────────

@router.get("/stream")
async def chat_stream(
    session_id: str = Query(..., description="Session ID from /api/ingest"),
    question: str = Query(..., description="User question"),
):
    """
    Server-Sent Events streaming endpoint.
    Streams tokens as they're generated, then sends source citations.

    SSE event types:
    - data: {"type": "token", "data": "..."}   — partial token
    - data: {"type": "sources", "data": [...]} — source citations
    - data: {"type": "end", "data": ""}        — stream complete
    - data: {"type": "error", "data": "..."}   — error
    """
    if not session_id or not question:
        raise HTTPException(status_code=400, detail="session_id and question are required.")

    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Please ingest videos first.")

    async def event_generator():
        try:
            async for chunk in stream_chat(session_id, question):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            logger.error(f"SSE stream error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ─────────────────────────────────────────────
# Session info
# ─────────────────────────────────────────────

@router.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """Check if a session exists."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"session_id": session_id, "active": True}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Clear a session and free memory."""
    clear_session(session_id)
    return {"message": f"Session {session_id} cleared."}


# ─────────────────────────────────────────────
# Suggested questions
# ─────────────────────────────────────────────

@router.get("/suggestions")
async def get_suggestions():
    """Return pre-built question suggestions for the UI."""
    return {
        "suggestions": [
            "Why did Video A get more engagement than Video B?",
            "What's the engagement rate of each video?",
            "Compare the hooks in the first 5 seconds of each video.",
            "Who is the creator of each video and what are their follower counts?",
            "Suggest 3 improvements for the lower-performing video based on what worked in the other.",
            "What hashtags did each creator use?",
            "Which video is longer and does duration affect engagement?",
            "What tone and style does each creator use in their script?",
        ]
    }
