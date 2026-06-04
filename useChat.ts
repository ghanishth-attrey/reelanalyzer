import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { streamChat, ChatSource } from "@/lib/api";
import { useAppStore, ChatMessage } from "@/store/appStore";

// Fallback uuid if package not available
function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChat() {
  const {
    sessionId,
    isStreaming,
    addMessage,
    appendToken,
    finalizeMessage,
    setStreaming,
  } = useAppStore();

  const sendMessage = useCallback(
    async (question: string) => {
      if (!sessionId || isStreaming || !question.trim()) return;

      // Add user message
      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: question.trim(),
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      // Add empty assistant message (will be streamed into)
      const assistantId = makeId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        timestamp: Date.now(),
      };
      addMessage(assistantMsg);
      setStreaming(true, assistantId);

      try {
        let sources: ChatSource[] | undefined;

        for await (const chunk of streamChat(sessionId, question)) {
          if (chunk.type === "token") {
            appendToken(assistantId, chunk.data as string);
          } else if (chunk.type === "sources") {
            sources = chunk.data as ChatSource[];
          } else if (chunk.type === "error") {
            appendToken(
              assistantId,
              `\n\n⚠️ Error: ${chunk.data}`
            );
            break;
          } else if (chunk.type === "end") {
            break;
          }
        }

        finalizeMessage(assistantId, sources);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        appendToken(assistantId, `\n\n⚠️ Connection error: ${msg}`);
        finalizeMessage(assistantId);
      }
    },
    [sessionId, isStreaming, addMessage, appendToken, finalizeMessage, setStreaming]
  );

  return { sendMessage };
}
