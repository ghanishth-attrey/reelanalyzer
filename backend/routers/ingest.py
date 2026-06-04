"""
Ingest router — Phase 1/2 split for fast demo UX.

Phase 1 (POST /api/ingest): metadata only, returns cards + job_id in <3s
Phase 2 (background task): transcription + embedding, updates job status
GET /api/ingest/status/{job_id}: frontend polls this until chat is ready
"""

import uuid
import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, field_validator

from services.ingestion import ingest_video, IngestedVideo, VideoMetadata
from services.embeddings import embed_and_store, build_metadata_summary
from services.rag import create_rag_chain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["ingest"])


# ─────────────────────────────────────────────
# In-memory job store
# ─────────────────────────────────────────────

class JobStatus:
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


_jobs: dict[str, dict] = {}


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


# ─────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────

class IngestRequest(BaseModel):
    url_a: str
    url_b: str

    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("Must be a valid URL")
        return v


class VideoCardData(BaseModel):
    video_id: str
    platform: str
    url: str
    title: str
    creator: str
    creator_followers: Optional[int] = None
    views: int
    likes: int
    comments: int
    engagement_rate: float
    duration: float  # float to handle yt-dlp returning e.g. 103.803
    upload_date: str
    hashtags: list[str]
    thumbnail: str
    description: str
    hook: str = ""
    transcript_source: str = "none"

    @property
    def duration_seconds(self) -> int:
        return int(self.duration)


class IngestResponse(BaseModel):
    session_id: str
    job_id: str
    video_a: VideoCardData
    video_b: VideoCardData
    status: str
    message: str


class StatusResponse(BaseModel):
    job_id: str
    session_id: str
    status: str
    message: str
    transcript_source_a: Optional[str] = None
    transcript_source_b: Optional[str] = None
    error: Optional[str] = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def to_card(v: IngestedVideo) -> VideoCardData:
    m = v.metadata
    return VideoCardData(
        video_id=m.video_id,
        platform=m.platform,
        url=m.url,
        title=m.title,
        creator=m.creator,
        creator_followers=m.creator_followers,
        views=m.views,
        likes=m.likes,
        comments=m.comments,
        engagement_rate=m.engagement_rate,
        duration=m.duration,
        upload_date=m.upload_date,
        hashtags=m.hashtags,
        thumbnail=m.thumbnail,
        description=m.description,
        hook=m.hook,
        transcript_source=m.transcript_source,
    )


# ─────────────────────────────────────────────
# Background task: transcription + embedding
# ─────────────────────────────────────────────

async def _run_transcription_and_embedding(
    job_id: str,
    session_id: str,
    url_a: str,
    url_b: str,
):
    """
    Runs after metadata is returned to frontend.
    Does the heavy lifting: full transcript, Whisper if needed, embedding.
    Updates job status when complete.
    """
    try:
        _jobs[job_id]["status"] = JobStatus.PROCESSING
        _jobs[job_id]["message"] = "Transcribing audio..."

        logger.info(f"Job {job_id}: starting full ingestion")

        # Full ingestion (transcript + metadata)
        video_a, video_b = await asyncio.gather(
            ingest_video(url_a, "A"),
            ingest_video(url_b, "B"),
        )

        _jobs[job_id]["message"] = "Embedding transcripts..."

        # Embed and store
        vectorstore = embed_and_store([video_a, video_b], session_id)
        metadata_summary = build_metadata_summary([video_a, video_b])
        create_rag_chain(session_id, vectorstore, metadata_summary)

        # Update job with final data
        _jobs[job_id].update({
            "status": JobStatus.READY,
            "message": "Ready",
            "video_a": to_card(video_a).model_dump(),
            "video_b": to_card(video_b).model_dump(),
            "transcript_source_a": video_a.metadata.transcript_source,
            "transcript_source_b": video_b.metadata.transcript_source,
        })

        logger.info(f"Job {job_id}: complete. Sources: A={video_a.metadata.transcript_source}, B={video_b.metadata.transcript_source}")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        _jobs[job_id].update({
            "status": JobStatus.ERROR,
            "message": "Ingestion failed",
            "error": str(e),
        })


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest, background_tasks: BackgroundTasks):
    """
    Phase 1: validate URLs, fetch metadata fast, return cards.
    Phase 2: background task handles transcription + embedding.
    """
    url_a = req.url_a.strip()
    url_b = req.url_b.strip()

    if not url_a.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL A is not valid")
    if not url_b.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL B is not valid")

    session_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # Register job
    _jobs[job_id] = {
        "status": JobStatus.PROCESSING,
        "session_id": session_id,
        "message": "Starting ingestion...",
        "url_a": url_a,
        "url_b": url_b,
    }

    # Start full ingestion as background task
    background_tasks.add_task(
        _run_transcription_and_embedding,
        job_id, session_id, url_a, url_b,
    )

    # Return immediately with processing status
    # Frontend will poll /status/{job_id}
    logger.info(f"Job {job_id} queued for session {session_id}")

    # Return placeholder cards — frontend will update when status=ready
    placeholder_a = VideoCardData(
        video_id="A", platform="unknown", url=url_a,
        title="Processing...", creator="", creator_followers=None,
        views=0, likes=0, comments=0, engagement_rate=0.0,
        duration=0, upload_date="", hashtags=[], thumbnail="",
        description="", hook="", transcript_source="none",
    )
    placeholder_b = VideoCardData(
        video_id="B", platform="unknown", url=url_b,
        title="Processing...", creator="", creator_followers=None,
        views=0, likes=0, comments=0, engagement_rate=0.0,
        duration=0, upload_date="", hashtags=[], thumbnail="",
        description="", hook="", transcript_source="none",
    )

    return IngestResponse(
        session_id=session_id,
        job_id=job_id,
        video_a=placeholder_a,
        video_b=placeholder_b,
        status=JobStatus.PROCESSING,
        message="Ingestion started. Poll /api/ingest/status/{job_id} for updates.",
    )


@router.get("/ingest/status/{job_id}", response_model=StatusResponse)
async def get_status(job_id: str):
    """
    Poll this endpoint to check ingestion + embedding progress.
    Returns status: processing | ready | error
    When status=ready, video cards have full data and chat is available.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return StatusResponse(
        job_id=job_id,
        session_id=job.get("session_id", ""),
        status=job.get("status", "processing"),
        message=job.get("message", ""),
        transcript_source_a=job.get("transcript_source_a"),
        transcript_source_b=job.get("transcript_source_b"),
        error=job.get("error"),
    )


@router.get("/ingest/job/{job_id}/cards")
async def get_job_cards(job_id: str):
    """Get full video card data once job is ready."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != JobStatus.READY:
        raise HTTPException(status_code=202, detail="Job not ready yet")
    return {
        "video_a": job.get("video_a"),
        "video_b": job.get("video_b"),
    }
