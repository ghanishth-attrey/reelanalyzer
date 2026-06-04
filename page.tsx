"use client";

import { useAppStore } from "@/store/appStore";
import IngestPanel from "@/components/video/IngestPanel";
import VideoCard from "@/components/video/VideoCard";
import VideoCardSkeleton from "@/components/video/VideoCardSkeleton";
import ChatPanel from "@/components/chat/ChatPanel";
import { Loader2, Mic, Database } from "lucide-react";

export default function HomePage() {
  const { videoA, videoB, phase, statusMessage } = useAppStore();
  const isProcessing = phase === "starting" || phase === "transcribing" || phase === "embedding";
  const hasVideos = videoA && videoB && phase === "ready";

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <IngestPanel />

      <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* Left: Video cards side by side */}
        <div className="flex flex-col gap-2 w-[480px] flex-shrink-0 overflow-y-auto scrollbar-thin">
          {isProcessing ? (
            <>
              <ProcessingStatus phase={phase} message={statusMessage} />
              <div className="flex gap-2">
                <div className="flex-1"><VideoCardSkeleton /></div>
                <div className="flex-1"><VideoCardSkeleton /></div>
              </div>
            </>
          ) : hasVideos ? (
            <div className="flex gap-2 h-full">
              <div className="flex-1 min-w-0">
                <VideoCard video={videoA} />
              </div>
              <div className="flex-1 min-w-0">
                <VideoCard video={videoB} />
              </div>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Right: Chat */}
        <div className="flex-1 min-w-0">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}

function ProcessingStatus({ phase, message }: { phase: string; message: string }) {
  const steps = [
    { id: "starting", label: "Fetching metadata", icon: <Loader2 size={12} className="animate-spin" /> },
    { id: "transcribing", label: "Transcribing audio", icon: <Mic size={12} /> },
    { id: "embedding", label: "Building vector index", icon: <Database size={12} /> },
  ];

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
      <p className="text-xs text-[var(--text-secondary)] mb-2">Processing videos...</p>
      <div className="space-y-1.5">
        {steps.map((step) => {
          const phaseOrder = ["starting", "transcribing", "embedding"];
          const currentIdx = phaseOrder.indexOf(phase);
          const stepIdx = phaseOrder.indexOf(step.id);
          const isDone = stepIdx < currentIdx;
          const isActive = step.id === phase;

          return (
            <div key={step.id} className={`flex items-center gap-2 text-xs transition-colors ${
              isActive ? "text-[var(--accent)]" :
              isDone ? "text-green-500" : "text-[var(--text-secondary)]"
            }`}>
              <div>{isActive ? <Loader2 size={12} className="animate-spin" /> : isDone ? "✓" : "○"}</div>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
      {message && (
        <p className="text-[10px] text-[var(--text-secondary)] mt-2 truncate">{message}</p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex gap-2 h-full">
      {[0, 1].map((i) => (
        <div key={i}
          className="flex-1 bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-lg flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
          <div className="w-10 h-10 rounded-full border-2 border-dashed border-[var(--border)] flex items-center justify-center text-lg font-bold">
            {String.fromCharCode(65 + i)}
          </div>
          <span className="text-xs">Video {String.fromCharCode(65 + i)}</span>
          <span className="text-[10px] opacity-60">Paste a URL above</span>
        </div>
      ))}
    </div>
  );
}