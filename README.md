# ReelAnalyzer — Social Video RAG Chatbot

Ingest any two social media videos (YouTube or Instagram Reels), extract metadata + transcripts, embed them into a vector DB, and chat with an AI that reasons across both videos.

## Features

- **Multi-platform ingestion** — YouTube + YouTube, Instagram + Instagram, or mixed
- **Auto metadata extraction** — views, likes, comments, duration, upload date, creator, followers, hashtags
- **Engagement rate** computed automatically: `(likes + comments) / views × 100`
- **RAG chat** — LangChain-powered, streaming, with source citations and memory
- **100% free stack** — no paid APIs required

## Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | FastAPI (Python) |
| Transcripts | youtube-transcript-api + yt-dlp |
| Metadata | yt-dlp |
| Embeddings | sentence-transformers (BGE-small-en-v1.5) |
| Vector DB | ChromaDB (persistent, local) |
| Orchestration | LangChain |
| LLM | Groq (Llama 3.1 8B — free tier) |
| Deployment | Docker Compose |

## Quickstart

### 1. Clone & configure

```bash
git clone <your-repo-url>
cd reelanalyzer
cp .env.example .env
# Edit .env and add your GROQ_API_KEY (free at console.groq.com)
```

### 2. Run with Docker

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### 3. Run manually (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Usage

1. Paste two video URLs (YouTube or Instagram) into the input panel
2. Click **Analyze** — metadata + transcripts are ingested and embedded
3. Ask questions in the chat panel:
   - *Why did Video A get more engagement than Video B?*
   - *What's the engagement rate of each video?*
   - *Compare the hooks in the first 5 seconds*
   - *Who is the creator of Video B and what's their follower count?*
   - *Suggest improvements for B based on what worked in A*

## Scalability (1000 creators/day)

| Resource | Cost |
|---|---|
| Groq LLM | $0 (free tier: 14,400 req/day) |
| BGE embeddings | $0 (runs locally) |
| ChromaDB | $0 (local persistent) |
| yt-dlp metadata | $0 |
| EC2 t3.medium (optional) | ~$30/month |
| **Total** | **~$0–30/month** |

At scale beyond free tier limits, switch to Together.ai ($0.10/1M tokens for Llama 3.1 8B) — still ~$2/day at 1000 creators.

## Project Structure

```
reelanalyzer/
├── backend/
│   ├── main.py               # FastAPI app + routes
│   ├── routers/
│   │   ├── ingest.py         # Video ingestion endpoint
│   │   └── chat.py           # RAG chat + SSE streaming
│   ├── services/
│   │   ├── ingestion.py      # yt-dlp + transcript extraction
│   │   ├── embeddings.py     # Chunking + BGE embeddings + ChromaDB
│   │   └── rag.py            # LangChain RAG chain + memory
│   └── core/
│       └── config.py         # Settings + env vars
├── frontend/
│   └── src/
│       ├── app/              # Next.js App Router pages
│       ├── components/       # Video cards, chat panel, UI
│       ├── hooks/            # useChat, useIngest
│       ├── lib/              # API client
│       └── store/            # Zustand state
├── docker-compose.yml
├── .env.example
└── README.md
```
