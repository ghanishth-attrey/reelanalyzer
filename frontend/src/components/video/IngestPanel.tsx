"use client";

import { useState, useEffect, useRef } from "react";
import { ingestVideos, pollUntilReady } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { Youtube, Instagram, Loader2, Zap, RotateCcw, CheckCircle, AlertCircle } from "lucide-react";

export default function IngestPanel() {
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const pollingRef = useRef(false);

  const {
    phase, statusMessage, ingestError, sessionId, jobId,
    startIngestion, setStatusMessage, setReady, setError, resetSession,
  } = useAppStore();

  const isIngesting = phase === "starting" || phase === "transcribing" || phase === "embedding";
  const isReady = phase === "ready";
  const isError = phase === "error";

  const detectPlatform = (url: string) => {
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("instagram.com")) return "instagram";
    return null;
  };

  const PlatformIcon = ({ url }: { url: string }) => {
    const p = detectPlatform(url);
    if (p === "youtube") return <Youtube size={14} className="text-red-500" />;
    if (p === "instagram") return <Instagram size={14} className="text-pink-500" />;
    return null;
  };

  const handleAnalyze = async () => {
    if (!urlA.trim() || !urlB.trim() || isIngesting) return;

    try {
      const res = await ingestVideos(urlA.trim(), urlB.trim());
      startIngestion(res.session_id, res.job_id);

      // Poll for completion
      pollingRef.current = true;
      const cards = await pollUntilReady(
        res.job_id,
        (msg) => setStatusMessage(msg),
      );

      if (pollingRef.current) {
        setReady(cards.video_a, cards.video_b);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ingestion failed";
      setError(msg);
    } finally {
      pollingRef.current = false;
    }
  };

  const handleReset = () => {
    pollingRef.current = false;
    setUrlA("");
    setUrlB("");
    resetSession();
  };

  const phaseLabel = () => {
    if (phase === "starting") return "Fetching metadata...";
    if (phase === "transcribing") return "Transcribing audio...";
    if (phase === "embedding") return "Embedding transcripts...";
    return statusMessage;
  };

  if (isReady || isIngesting) {
    return (
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Zap size={14} className="text-[var(--accent)]" />
            <span className="font-semibold text-white">ReelAnalyzer</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            {isIngesting && <Loader2 size={12} className="animate-spin text-[var(--accent)]" />}
            {isReady && <CheckCircle size={12} className="text-green-500" />}
            <span>{isReady ? "Analysis ready" : phaseLabel()}</span>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition-colors px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
        >
          <RotateCcw size={12} />
          New Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-[var(--accent)]" />
          <h1 className="text-base font-semibold text-white">ReelAnalyzer</h1>
          <span className="text-xs text-[var(--text-secondary)] ml-1">
            — Compare any two social videos with AI
          </span>
        </div>

        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-secondary)] mb-1 flex items-center gap-1.5">
              <PlatformIcon url={urlA} />
              Video A — YouTube or Instagram
            </label>
            <input
              type="url"
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              placeholder="https://youtube.com/shorts/... or https://instagram.com/reels/..."
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-2 text-sm text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            />
          </div>

          <div className="flex-1">
            <label className="text-xs text-[var(--text-secondary)] mb-1 flex items-center gap-1.5">
              <PlatformIcon url={urlB} />
              Video B — YouTube or Instagram
            </label>
            <input
              type="url"
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="https://youtube.com/shorts/... or https://instagram.com/reels/..."
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-2 text-sm text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            />
          </div>

          <div className="pt-5">
            <button
              onClick={handleAnalyze}
              disabled={isIngesting || !urlA || !urlB}
              className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2 rounded transition-colors whitespace-nowrap"
            >
              <Zap size={14} />
              Analyze
            </button>
          </div>
        </div>

        {isError && ingestError && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{ingestError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
