"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore, ChatMessage } from "@/store/appStore";
import { useChat } from "@/hooks/useChat";
import { ChatSource } from "@/lib/api";
import { Send, Bot, User, BookOpen, Loader2, Lightbulb } from "lucide-react";

const SUGGESTIONS = [
  "Why did Video A get more engagement than Video B?",
  "What's the engagement rate of each video?",
  "Compare the hooks in the first 5 seconds.",
  "Who is the creator of each video?",
  "Suggest improvements for the lower-performing video.",
  "What hashtags did each creator use?",
];

export default function ChatPanel() {
  const { messages, isStreaming, sessionId } = useAppStore();
  const { sendMessage } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const q = input.trim();
    setInput("");
    await sendMessage(q);
  };

  const handleSuggestion = async (s: string) => {
    if (isStreaming) return;
    await sendMessage(s);
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg items-center justify-center gap-3 p-6">
        <Bot size={36} className="text-[var(--text-secondary)]" />
        <p className="text-sm text-[var(--text-secondary)] text-center">
          Ingest two videos to start chatting with the AI analyst.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <Bot size={15} className="text-[var(--accent)]" />
        <span className="text-sm font-semibold text-white">AI Analyst</span>
        <span className="text-xs text-green-500 ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
          Ready
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mb-3">
              <Lightbulb size={12} />
              Suggested questions
            </p>
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSuggestion(s)}
                className="w-full text-left text-xs bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] hover:text-white px-3 py-2 rounded border border-[var(--border)] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={12} className="animate-spin" />
            <span className="text-xs">Thinking…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask anything about the videos…"
            disabled={isStreaming}
            className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-2 text-sm text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded transition-colors"
          >
            {isStreaming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser ? "bg-[var(--accent)]" : "bg-[var(--bg-secondary)]"
        }`}
      >
        {isUser ? (
          <User size={12} className="text-white" />
        ) : (
          <Bot size={12} className="text-[var(--accent)]" />
        )}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Content */}
        <div
          className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
            isUser
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
          } ${message.streaming ? "streaming-cursor" : ""}`}
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content || " "}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <SourcesCitation sources={message.sources} />
        )}
      </div>
    </div>
  );
}

function SourcesCitation({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] hover:text-white transition-colors"
      >
        <BookOpen size={10} />
        {sources.length} source{sources.length > 1 ? "s" : ""} cited
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {sources.map((src, i) => (
            <div
              key={i}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded p-2 text-[10px]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-[var(--accent)] text-white px-1.5 py-0.5 rounded font-bold">
                  Video {src.video_id}
                </span>
                <span className="text-[var(--text-secondary)]">{src.platform}</span>
                <span className="text-[var(--text-secondary)]">Chunk #{src.chunk_index}</span>
              </div>
              <p className="text-[var(--text-secondary)] italic line-clamp-2">
                "{src.excerpt}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
