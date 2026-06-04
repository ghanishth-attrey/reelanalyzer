"""
Embeddings service.
- Chunks transcripts with overlap
- Embeds using BGE-small-en-v1.5 (free, local, fast)
- Stores in ChromaDB with video_id metadata for filtered retrieval
- Always stores a dedicated metadata chunk per video so stats questions
  (views, likes, engagement rate etc.) are always answerable
- Session-scoped: each ingestion session gets a unique collection ID
"""

import logging
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma

from core.config import get_settings
from services.ingestion import IngestedVideo

logger = logging.getLogger(__name__)
settings = get_settings()


# ─────────────────────────────────────────────
# Singleton embedding model (loaded once)
# ─────────────────────────────────────────────

_embedding_model: Optional[HuggingFaceEmbeddings] = None


def get_embedding_model() -> HuggingFaceEmbeddings:
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _embedding_model = HuggingFaceEmbeddings(
            model_name=settings.embedding_model,
            model_kwargs={"device": "cpu"},
            encode_kwargs={
                "normalize_embeddings": True,
                "batch_size": 32,
            },
        )
        logger.info("Embedding model loaded.")
    return _embedding_model


# ─────────────────────────────────────────────
# ChromaDB client (singleton)
# ─────────────────────────────────────────────

_chroma_client: Optional[chromadb.PersistentClient] = None


def get_chroma_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client


# ─────────────────────────────────────────────
# Text splitter
# ─────────────────────────────────────────────

def get_text_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", ". ", "? ", "! ", " ", ""],
        length_function=len,
    )


# ─────────────────────────────────────────────
# Metadata context builder
# ─────────────────────────────────────────────

def _build_metadata_context(meta) -> str:
    """
    Build a rich text block from metadata.
    Always stored as a dedicated chunk so stats questions are always answerable.
    """
    followers = f"{int(meta.creator_followers):,}" if meta.creator_followers else "Unknown"
    duration = meta.duration or 0
    duration_str = f"{int(duration) // 60}m {int(duration) % 60}s" if duration else "Unknown"
    hashtags_str = ", ".join(meta.hashtags) if meta.hashtags else "None"
    hook = getattr(meta, "hook", "") or "Not available"

    return f"""Video {meta.video_id} Statistics and Info:
Title: {meta.title}
Platform: {meta.platform}
Creator: {meta.creator}
Followers: {followers}
Views: {meta.views:,}
Likes: {meta.likes:,}
Comments: {meta.comments:,}
Engagement Rate: {meta.engagement_rate}%
Duration: {duration_str}
Upload Date: {meta.upload_date}
Hashtags: {hashtags_str}
Hook (first 10 seconds): {hook}
URL: {meta.url}
Description: {meta.description}""".strip()


def build_metadata_summary(videos: list[IngestedVideo]) -> str:
    """Build a system-level metadata summary injected into the RAG prompt."""
    parts = []
    for video in videos:
        parts.append(_build_metadata_context(video.metadata))
    return "\n\n---\n\n".join(parts)


# ─────────────────────────────────────────────
# Core embedding functions
# ─────────────────────────────────────────────

def embed_and_store(videos: list[IngestedVideo], session_id: str) -> Chroma:
    """
    Chunk, embed, and store all videos into a session-scoped ChromaDB collection.

    For each video we store:
    1. A dedicated METADATA chunk (always) — answers stats/info questions
    2. Transcript chunks (if available) — answers content/hook questions

    This ensures both metadata and transcript questions are always answerable.
    """
    splitter = get_text_splitter()
    embeddings = get_embedding_model()
    collection_name = f"session_{session_id}"

    all_texts = []
    all_metadatas = []

    for video in videos:
        meta = video.metadata
        transcript = video.transcript

        base_meta = {
            "video_id": meta.video_id,
            "platform": meta.platform,
            "title": meta.title,
            "creator": meta.creator,
            "creator_followers": str(meta.creator_followers or "Unknown"),
            "views": str(meta.views),
            "likes": str(meta.likes),
            "comments": str(meta.comments),
            "engagement_rate": str(meta.engagement_rate),
            "duration": str(meta.duration),
            "upload_date": meta.upload_date,
            "hashtags": ",".join(meta.hashtags),
            "url": meta.url,
        }

        # 1. Always store a dedicated metadata chunk
        metadata_text = _build_metadata_context(meta)
        all_texts.append(metadata_text)
        all_metadatas.append({
            **base_meta,
            "chunk_index": "metadata",
            "chunk_type": "metadata",
        })

        # 2. Store transcript chunks if we have real transcript content
        if transcript and not transcript.startswith("["):
            chunks = splitter.split_text(transcript)
            logger.info(f"Video {meta.video_id}: {len(chunks)} transcript chunks + 1 metadata chunk")
            for i, chunk in enumerate(chunks):
                all_texts.append(chunk)
                all_metadatas.append({
                    **base_meta,
                    "chunk_index": str(i),
                    "chunk_type": "transcript",
                })
        else:
            logger.info(f"Video {meta.video_id}: metadata chunk only (no transcript)")

    # Store in ChromaDB
    vectorstore = Chroma.from_texts(
        texts=all_texts,
        embedding=embeddings,
        metadatas=all_metadatas,
        collection_name=collection_name,
        client=get_chroma_client(),
    )

    logger.info(f"Stored {len(all_texts)} total chunks in collection '{collection_name}'")
    return vectorstore


def load_vectorstore(session_id: str) -> Chroma:
    """Load an existing session vectorstore."""
    collection_name = f"session_{session_id}"
    return Chroma(
        collection_name=collection_name,
        embedding_function=get_embedding_model(),
        client=get_chroma_client(),
    )


def delete_session(session_id: str) -> None:
    """Delete a session's collection to free space."""
    try:
        client = get_chroma_client()
        client.delete_collection(f"session_{session_id}")
        logger.info(f"Deleted collection for session {session_id}")
    except Exception as e:
        logger.warning(f"Could not delete session {session_id}: {e}")
