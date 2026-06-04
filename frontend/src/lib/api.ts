const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface VideoCardData {
  video_id: string;
  platform: string;
  url: string;
  title: string;
  creator: string;
  creator_followers: number | null;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number;
  duration: number;
  upload_date: string;
  hashtags: string[];
  thumbnail: string;
  description: string;
  hook: string;
  transcript_source: string;
}

export interface IngestResponse {
  session_id: string;
  job_id: string;
  video_a: VideoCardData;
  video_b: VideoCardData;
  status: string;
  message: string;
}

export interface StatusResponse {
  job_id: string;
  session_id: string;
  status: "processing" | "ready" | "error";
  message: string;
  transcript_source_a?: string;
  transcript_source_b?: string;
  error?: string;
}

export interface JobCardsResponse {
  video_a: VideoCardData;
  video_b: VideoCardData;
}

export interface ChatSource {
  video_id: string;
  chunk_index: string;
  title: string;
  creator: string;
  platform: string;
  excerpt: string;
}

export interface SSEChunk {
  type: "token" | "sources" | "end" | "error";
  data: string | ChatSource[];
}

// ─────────────────────────────────────────────
// Ingest — start job
// ─────────────────────────────────────────────

export async function ingestVideos(
  urlA: string,
  urlB: string
): Promise<IngestResponse> {
  const res = await fetch(`${API_URL}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url_a: urlA, url_b: urlB }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────
// Poll job status
// ─────────────────────────────────────────────

export async function getJobStatus(jobId: string): Promise<StatusResponse> {
  const res = await fetch(`${API_URL}/api/ingest/status/${jobId}`);
  if (!res.ok) throw new Error(`Status check failed: HTTP ${res.status}`);
  return res.json();
}

export async function getJobCards(jobId: string): Promise<JobCardsResponse> {
  const res = await fetch(`${API_URL}/api/ingest/job/${jobId}/cards`);
  if (!res.ok) throw new Error(`Cards fetch failed: HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
// Poll until ready (with timeout)
// ─────────────────────────────────────────────

export async function pollUntilReady(
  jobId: string,
  onStatusUpdate: (msg: string) => void,
  intervalMs = 2000,
  timeoutMs = 120000
): Promise<JobCardsResponse> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await getJobStatus(jobId);
    onStatusUpdate(status.message);

    if (status.status === "ready") {
      return getJobCards(jobId);
    }
    if (status.status === "error") {
      throw new Error(status.error || "Ingestion failed");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for ingestion to complete.");
}

// ─────────────────────────────────────────────
// SSE streaming chat
// ─────────────────────────────────────────────

export async function* streamChat(
  sessionId: string,
  question: string
): AsyncGenerator<SSEChunk> {
  const url = `${API_URL}/api/chat/stream?session_id=${encodeURIComponent(
    sessionId
  )}&question=${encodeURIComponent(question)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
  });

  if (!res.ok) throw new Error(`Chat error: HTTP ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const chunk: SSEChunk = JSON.parse(line.slice(6));
          yield chunk;
          if (chunk.type === "end" || chunk.type === "error") return;
        } catch {
          // skip malformed
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const total = Math.floor(seconds); // handle float durations
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatNumber(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function transcriptSourceLabel(source: string): { label: string; color: string } {
  switch (source) {
    case "captions": return { label: "Live Captions", color: "text-green-400" };
    case "whisper": return { label: "Whisper AI", color: "text-blue-400" };
    case "subtitles": return { label: "Subtitles", color: "text-yellow-400" };
    case "description": return { label: "Description only", color: "text-orange-400" };
    default: return { label: "Processing...", color: "text-gray-400" };
  }
}
