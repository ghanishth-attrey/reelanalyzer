"""
RAG chain service.
- LangChain ConversationalRetrievalChain
- Groq LLM (Llama 3.1 8B) — free, fast streaming
- Memory across turns (ConversationBufferMemory)
- Source citations: which video + which chunk
- Session-scoped: each ingestion creates a new chain

Fix: streaming callback tracks which LLM is running to avoid
     the condense-question LLM's end event breaking the stream.
"""

import asyncio
import logging
from typing import AsyncGenerator, Optional
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain.callbacks.base import AsyncCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_chroma import Chroma

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ─────────────────────────────────────────────
# Streaming callback handler
# ─────────────────────────────────────────────

class StreamingCallback(AsyncCallbackHandler):
    """
    Async callback that yields tokens to a queue for SSE streaming.

    Key fix: ConversationalRetrievalChain uses TWO LLM calls:
    1. condense_question_llm — rewrites the follow-up question (non-streaming)
    2. main llm — generates the answer (streaming)

    We track token count to detect when we're in the answer phase.
    The end signal is only sent after the answer LLM finishes.
    """

    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self.token_count = 0
        self.llm_call_count = 0

    async def on_llm_start(self, serialized, prompts, **kwargs) -> None:
        self.llm_call_count += 1

    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        self.token_count += 1
        await self.queue.put({"type": "token", "data": token})

    async def on_llm_end(self, response: LLMResult, **kwargs) -> None:
        # Only send end signal after the answer LLM (which produces tokens)
        # The condense LLM produces no tokens so token_count stays 0
        if self.token_count > 0:
            await self.queue.put({"type": "end", "data": ""})

    async def on_llm_error(self, error: Exception, **kwargs) -> None:
        await self.queue.put({"type": "error", "data": str(error)})


# ─────────────────────────────────────────────
# System prompt
# ─────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """You are ReelAnalyzer AI — an expert social media content strategist and video analyst.

You have access to transcripts, metadata, and engagement data for two videos (Video A and Video B).

METADATA SUMMARY:
{metadata_summary}

INSTRUCTIONS:
- Always cite your sources: mention "Video A" or "Video B" and reference the specific part of the transcript or data.
- When comparing engagement, use the exact engagement rates provided.
- For hook analysis, focus on the first lines of the transcript.
- Be specific, actionable, and data-driven in your suggestions.
- If asked about follower count, views, likes, or comments — use the metadata above directly.
- Format numbers with commas for readability.
- Keep answers concise but complete.

Context from video transcripts and metadata:
{context}
"""

CONDENSE_QUESTION_PROMPT = PromptTemplate.from_template("""
Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone question.
If the follow-up is already standalone, return it as-is.

Chat History:
{chat_history}

Follow-up Question: {question}

Standalone question:""")


# ─────────────────────────────────────────────
# Session store
# ─────────────────────────────────────────────

_sessions: dict[str, dict] = {}


def create_rag_chain(
    session_id: str,
    vectorstore: Chroma,
    metadata_summary: str,
) -> ConversationalRetrievalChain:
    """Build and register a RAG chain for a session."""

    # Streaming LLM for answers
    llm = ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        temperature=0.3,
        streaming=True,
        max_tokens=1024,
    )

    # Non-streaming LLM for question condensation
    condense_llm = ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        temperature=0,
        streaming=False,
        max_tokens=256,
    )

    # Memory
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        output_key="answer",
        return_messages=True,
    )

    # Retriever
    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": settings.retriever_k,
            "fetch_k": settings.retriever_k * 3,
        },
    )

    # QA prompt with metadata injected
    qa_system_prompt = SYSTEM_PROMPT_TEMPLATE.replace(
        "{metadata_summary}", metadata_summary
    )

    combine_docs_prompt = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(qa_system_prompt),
        HumanMessagePromptTemplate.from_template("{question}"),
    ])

    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        condense_question_llm=condense_llm,
        condense_question_prompt=CONDENSE_QUESTION_PROMPT,
        combine_docs_chain_kwargs={"prompt": combine_docs_prompt},
        return_source_documents=True,
        output_key="answer",
        verbose=False,
    )

    _sessions[session_id] = {
        "chain": chain,
        "memory": memory,
        "metadata_summary": metadata_summary,
        "vectorstore": vectorstore,
    }

    logger.info(f"RAG chain created for session {session_id}")
    return chain


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def clear_session(session_id: str) -> None:
    if session_id in _sessions:
        del _sessions[session_id]
        logger.info(f"Cleared session {session_id}")


# ─────────────────────────────────────────────
# Streaming chat
# ─────────────────────────────────────────────

async def stream_chat(
    session_id: str,
    question: str,
) -> AsyncGenerator[dict, None]:
    """
    Stream a RAG response for a question.
    Yields dicts: {"type": "token"|"sources"|"end"|"error", "data": ...}

    Uses a fresh StreamingCallback per call so token_count resets correctly.
    """
    session = get_session(session_id)
    if not session:
        yield {"type": "error", "data": "Session not found. Please ingest videos first."}
        return

    chain: ConversationalRetrievalChain = session["chain"]
    queue: asyncio.Queue = asyncio.Queue()
    callback = StreamingCallback(queue)

    async def run_chain():
        try:
            result = await chain.ainvoke(
                {"question": question},
                config={"callbacks": [callback]},
            )
            sources = _format_sources(result.get("source_documents", []))
            await queue.put({"type": "sources", "data": sources})
        except Exception as e:
            logger.error(f"Chain error: {e}", exc_info=True)
            await queue.put({"type": "error", "data": str(e)})

    task = asyncio.create_task(run_chain())

    while True:
        try:
            item = await asyncio.wait_for(queue.get(), timeout=45.0)
            yield item
            if item["type"] in ("end", "error"):
                break
            if item["type"] == "sources":
                yield {"type": "end", "data": ""}
                break
        except asyncio.TimeoutError:
            yield {"type": "error", "data": "Response timed out. Please try again."}
            break

    await task


def _format_sources(source_docs: list) -> list[dict]:
    """Format source documents into citation objects."""
    seen = set()
    sources = []

    for doc in source_docs:
        meta = doc.metadata
        video_id = meta.get("video_id", "?")
        chunk_idx = meta.get("chunk_index", "?")
        key = f"{video_id}-{chunk_idx}"

        if key in seen:
            continue
        seen.add(key)

        sources.append({
            "video_id": video_id,
            "chunk_index": chunk_idx,
            "title": meta.get("title", "Unknown"),
            "creator": meta.get("creator", "Unknown"),
            "platform": meta.get("platform", "Unknown"),
            "excerpt": doc.page_content[:150] + "..." if len(doc.page_content) > 150 else doc.page_content,
        })

    return sources
