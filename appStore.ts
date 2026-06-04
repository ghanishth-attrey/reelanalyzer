import { create } from "zustand";
import { VideoCardData, ChatSource } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  streaming?: boolean;
  timestamp: number;
}

type IngestPhase = "idle" | "starting" | "transcribing" | "embedding" | "ready" | "error";

interface AppState {
  // Session
  sessionId: string | null;
  jobId: string | null;
  videoA: VideoCardData | null;
  videoB: VideoCardData | null;

  // Ingestion state
  phase: IngestPhase;
  statusMessage: string;
  ingestError: string | null;
  chatReady: boolean;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;

  // Actions
  startIngestion: (sessionId: string, jobId: string) => void;
  setStatusMessage: (msg: string) => void;
  setReady: (a: VideoCardData, b: VideoCardData) => void;
  setError: (e: string) => void;
  resetSession: () => void;

  addMessage: (msg: ChatMessage) => void;
  appendToken: (id: string, token: string) => void;
  finalizeMessage: (id: string, sources?: ChatSource[]) => void;
  setStreaming: (v: boolean, id?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessionId: null,
  jobId: null,
  videoA: null,
  videoB: null,
  phase: "idle",
  statusMessage: "",
  ingestError: null,
  chatReady: false,
  messages: [],
  isStreaming: false,
  streamingMessageId: null,

  startIngestion: (sessionId, jobId) =>
    set({ sessionId, jobId, phase: "starting", statusMessage: "Starting...", ingestError: null, chatReady: false, messages: [] }),

  setStatusMessage: (msg) => set((s) => ({
    statusMessage: msg,
    phase: msg.toLowerCase().includes("embed") ? "embedding" : msg.toLowerCase().includes("transcri") ? "transcribing" : s.phase,
  })),

  setReady: (a, b) =>
    set({ videoA: a, videoB: b, phase: "ready", chatReady: true, statusMessage: "Ready" }),

  setError: (e) =>
    set({ phase: "error", ingestError: e, statusMessage: "Failed" }),

  resetSession: () =>
    set({
      sessionId: null, jobId: null, videoA: null, videoB: null,
      phase: "idle", statusMessage: "", ingestError: null,
      chatReady: false, messages: [],
    }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  appendToken: (id, token) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + token } : m
      ),
    })),

  finalizeMessage: (id, sources) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, streaming: false, sources } : m
      ),
      isStreaming: false,
      streamingMessageId: null,
    })),

  setStreaming: (v, id) =>
    set({ isStreaming: v, streamingMessageId: id || null }),
}));
