"""
ReelAnalyzer — FastAPI backend entry point.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from core.config import get_settings
from routers import ingest, chat, proxy

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ReelAnalyzer backend...")
    logger.info("Server is live — models load on first request.")
    yield
    logger.info("Shutting down ReelAnalyzer backend.")


app = FastAPI(
    title="ReelAnalyzer API",
    description="Ingest social media videos and chat with an AI analyst.",
    version="1.0.0",
    lifespan=lifespan,
)

origins = settings.allowed_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(ingest.router)
app.include_router(chat.router)
app.include_router(proxy.router)


@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.groq_model, "embedding": settings.embedding_model}


@app.get("/")
async def root():
    return {"message": "ReelAnalyzer API — see /docs for endpoints."}
