from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

ENV_FILE = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    # LLM
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"

    # YouTube API
    youtube_api_key: str = ""

    # Embeddings
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # ChromaDB
    chroma_persist_dir: str = "./chroma_db"
    chroma_collection_name: str = "video_chunks"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    allowed_origins: str = "http://localhost:3000"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379

    # RAG settings
    chunk_size: int = 500
    chunk_overlap: int = 50
    retriever_k: int = 6

    model_config = {
        "env_file": str(ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()