# ReelAnalyzer — Social Video RAG Chatbot

> Ingest any two social media videos (YouTube Shorts or Instagram Reels), extract metadata + transcripts, embed them into a vector database, and chat with an AI analyst that reasons across both videos in real time.

![ReelAnalyzer](https://img.shields.io/badge/Stack-FastAPI%20%7C%20Next.js%20%7C%20LangChain%20%7C%20ChromaDB%20%7C%20Groq-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Cost](https://img.shields.io/badge/Cost-100%25%20Free-brightgreen)

---

## What It Does

1. **Paste two video URLs** — YouTube Shorts, Instagram Reels, or a mix
2. **Automatic ingestion** — metadata fetched via YouTube Data API v3 + yt-dlp
3. **Transcript extraction** — youtube-transcript-api (instant) → Whisper AI fallback (first 10s)
4. **Vector embedding** — BGE-small-en-v1.5 embeddings stored in ChromaDB with per-video tagging
5. **RAG chat** — LangChain ConversationalRetrievalChain with Groq LLM, streaming responses, memory, and source citations

### Sample Questions

- *"Why did Video A get more engagement than Video B?"*
- *"Compare the hooks in the first 5 seconds"*
- *"What's the engagement rate of each video?"*
- *"Who is the creator of Video B and what's their follower count?"*
- *"Suggest 3 improvements for the lower-performing video based on what worked in the other"*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User (Browser)                           │
│                     Next.js 14 Frontend                         │
│           Video Cards │ Chat Panel │ SSE Streaming              │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────▼────────────────────────────────────┐
│                      FastAPI Backend                            │
│                                                                 │
│  POST /api/ingest          GET /api/chat/stream                 │
│  ┌─────────────────┐       ┌──────────────────────────────┐    │
│  │ Ingestion Layer │       │     RAG Chain (LangChain)    │    │
│  │                 │       │                              │    │
│  │ YouTube API v3  │       │  ConversationalRetrieval     │    │
│  │ yt-dlp          │       │  Chain + Memory              │    │
│  │ Whisper (10s)   │       │  MMR Retriever               │    │
│  │ BGE Embeddings  │       │  Groq LLM (Llama 3.1 8B)    │    │
│  └────────┬────────┘       └──────────────┬───────────────┘    │
│           │                               │                     │
│  ┌────────▼────────┐       ┌──────────────▼───────────────┐    │
│  │   ChromaDB      │◄──────│   ChromaDB Retriever         │    │
│  │ (Vector Store)  │       │   (filtered by video_id)     │    │
│  │                 │       └──────────────────────────────┘    │
│  │ Metadata chunks │                                            │
│  │ Transcript      │       ┌──────────────────────────────┐    │
│  │ chunks          │       │   Redis Cache (optional)     │    │
│  └─────────────────┘       │   metadata: 1hr TTL          │    │
│                            │   captions: 24hr TTL         │    │
│                            │   whisper: 7 day TTL         │    │
│                            └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | SSE streaming built-in, fast |
| **Backend** | FastAPI + Python | Async-native, LangChain ecosystem |
| **Metadata** | YouTube Data API v3 | Official, free 10k units/day, never blocked |
| **Transcripts** | youtube-transcript-api | Instant captions, no download |
| **Transcripts (fallback)** | faster-whisper (tiny) | First 10s only, ~3s transcription |
| **Embeddings** | BGE-small-en-v1.5 | Free, local, high quality |
| **Vector DB** | ChromaDB | Zero infra cost, persistent |
| **Orchestration** | LangChain | Memory + retrieval + streaming |
| **LLM** | Groq (Llama 3.1 8B) | Free tier, 300 tok/sec |
| **Cache** | Redis | Prevents re-processing same videos |
| **Deployment** | Docker Compose | One command setup |

---

## Scalability — 1000 Creators/Day

### Cost Breakdown

| Resource | Usage | Cost |
|---|---|---|
| Groq LLM | ~10 questions × 1000 creators | **$0** (free tier: 14,400 req/day) |
| BGE Embeddings | Runs locally | **$0** |
| ChromaDB | Local persistent | **$0** |
| YouTube Data API v3 | 2000 videos × 3 units = 6000 units | **$0** (free quota: 10,000/day) |
| yt-dlp metadata | Free | **$0** |
| Whisper (tiny) | ~5s per video, CPU | **$0** |
| Redis | Local or managed | **$0–5/month** |
| Server (EC2 t3.medium) | Optional for production | **~$30/month** |
| **Total** | | **$0–35/month** |

### Architecture Decisions for Scale

**Why YouTube Data API v3 over yt-dlp for metadata?**
yt-dlp triggers YouTube's bot detection from datacenter IPs. The official API never blocks, never rate-limits at our scale, and returns richer data.

**Why Whisper tiny + first 10 seconds only?**
Full video transcription = ~20s per video. First 10s only = ~3s. For hook analysis this is all we need. At 1000 creators/day this saves 4.7 hours of compute daily.

**Why ChromaDB over Pinecone?**
Pinecone costs ~$70/month minimum. ChromaDB is $0 and handles millions of chunks on a single machine. At 1000 creators/day with ~4 chunks per session, that's 4000 new chunks/day — ChromaDB handles this easily.

**Why Groq over OpenAI?**
Groq's free tier provides 14,400 requests/day at 300 tokens/second — faster than GPT-4o and completely free. At 1000 creators × 10 questions = 10,000 requests/day, comfortably within free tier.

**Bottleneck at scale:** Redis cache becomes critical. Same video analyzed twice = 0ms (cached) vs 20s (re-processed). At 1000/day, expect ~20% repeat videos = 200 instant responses.

**Path to 10,000 creators/day:**
- Add Celery + Redis job queue (background processing)
- Run 3-5 uvicorn workers
- Upgrade to Together.ai for LLM (~$2/day at that scale)
- Total cost: ~$100/month

---

## Quickstart

### Prerequisites
- Docker Desktop
- Groq API key (free at [console.groq.com](https://console.groq.com))
- YouTube Data API v3 key (free at [console.cloud.google.com](https://console.cloud.google.com))

### Run with Docker

```bash
git clone https://github.com/your-username/reelanalyzer
cd reelanalyzer
cp .env.example .env
# Fill in GROQ_API_KEY and YOUTUBE_API_KEY in .env
docker-compose up --build
```

Open **http://localhost:3000**

### Run Locally (recommended for development)

**Terminal 1 — Redis:**
```bash
docker-compose up redis -d
```

**Terminal 2 — Backend:**
```bash
cd backend
conda create -n reelanalyzer python=3.12
conda activate reelanalyzer
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

**Terminal 3 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

```env
GROQ_API_KEY=           # Free at console.groq.com
YOUTUBE_API_KEY=        # Free at console.cloud.google.com
GROQ_MODEL=llama-3.1-8b-instant
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
CHROMA_PERSIST_DIR=./chroma_db
ALLOWED_ORIGINS=http://localhost:3000
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Project Structure

```
reelanalyzer/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── core/
│   │   └── config.py              # Pydantic settings
│   ├── routers/
│   │   ├── ingest.py              # POST /api/ingest (Phase 1/2 split)
│   │   ├── chat.py                # GET /api/chat/stream (SSE)
│   │   └── proxy.py               # GET /api/proxy/instagram-thumb
│   └── services/
│       ├── ingestion.py           # YouTube API + yt-dlp + Whisper
│       ├── embeddings.py          # BGE embeddings + ChromaDB
│       └── rag.py                 # LangChain RAG chain + streaming
├── frontend/
│   └── src/
│       ├── app/                   # Next.js App Router
│       ├── components/
│       │   ├── video/             # VideoCard, IngestPanel, Skeleton
│       │   └── chat/              # ChatPanel with SSE streaming
│       ├── hooks/useChat.ts       # Streaming chat hook
│       ├── lib/api.ts             # API client + SSE reader
│       └── store/appStore.ts      # Zustand global state
├── docker-compose.yml
└── .env.example
```

---

## Known Limitations

| Limitation | Reason | Workaround |
|---|---|---|
| Instagram follower count unavailable | Instagram API requires app review | Use YouTube for full stats |
| Instagram reshares unavailable | Never exposed publicly by Instagram | N/A |
| YouTube Shorts audio blocked in Docker | YouTube blocks datacenter IPs | Run backend locally |
| Instagram thumbnails require proxy | CDN URLs are IP-restricted | Built-in proxy endpoint handles this |
| Captions sometimes fail (XML error) | YouTube rate-limits caption API | Automatic Whisper fallback |

---

## How RAG Works

```
Question: "Why did Video A get more engagement?"
         │
         ▼
ConversationalRetrievalChain
         │
         ├─► Condense question (if follow-up)
         │   "Why did Video A get more engagement than Video B?"
         │
         ├─► MMR Retrieval from ChromaDB
         │   Returns top-4 chunks across both videos:
         │   - Video A metadata chunk (views, likes, engagement rate)
         │   - Video B metadata chunk
         │   - Video A transcript chunk (hook content)
         │   - Video B transcript chunk
         │
         ├─► Inject into system prompt with metadata summary
         │
         ▼
Groq Llama 3.1 8B → Streaming response with citations
```

---

## License

MIT
