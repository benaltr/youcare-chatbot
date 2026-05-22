"use client";

import { useState } from "react";

const DEMO_TENANT_SLUG = "studio-lume";
const PHONE = "+972501234567"; // Fixed for demo

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function WidgetPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStatus("streaming");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: DEMO_TENANT_SLUG,
          phone: PHONE,
          messages: messages.concat(userMessage).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      let assistantMessage = "";
      const assistantId = (Date.now() + 1).toString();

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        if (value) {
          const text = decoder.decode(value, { stream: !done });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.slice(6));
                if (json.type === "text-delta" && json.delta) {
                  assistantMessage += json.delta;
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated[updated.length - 1]?.id !== assistantId) {
                      updated.push({
                        id: assistantId,
                        role: "assistant",
                        content: assistantMessage,
                      });
                    } else {
                      updated[updated.length - 1].content = assistantMessage;
                    }
                    return updated;
                  });
                }
              } catch {
                // Skip parsing errors
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error: ${err.message}`,
        },
      ]);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col h-[600px] overflow-hidden">
        <header className="px-6 py-4 border-b border-stone-100 bg-white">
          <h1 className="text-lg font-semibold text-stone-900">Studio Lume</h1>
          <p className="text-xs text-stone-500">Shelly • שיחה</p>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-stone-400 mt-12 px-4" dir="rtl">
              שלום ✨ אני Shelly, איך אוכל לעזור?
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} role={m.role}>
                {m.content}
              </MessageBubble>
            ))
          )}
          {status === "streaming" && (
            <div className="text-xs text-stone-400 italic">Shelly מקלידה...</div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-stone-100 px-4 py-3 bg-white flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="הקלידי הודעה..."
            dir="auto"
            className="flex-1 rounded-full border border-stone-200 px-4 py-2 text-sm focus:outline-none focus:border-stone-400"
            disabled={status === "streaming"}
          />
          <button
            type="submit"
            disabled={!input.trim() || status === "streaming"}
            className="rounded-full bg-stone-900 text-white px-5 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-800 transition"
          >
            שלחי
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ role, children }: { role: string; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-stone-900 text-white rounded-br-sm"
            : "bg-stone-100 text-stone-900 rounded-bl-sm"
        }`}
        dir="auto"
      >
        {children}
      </div>
    </div>
  );
}
