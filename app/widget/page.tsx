"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

const DEMO_TENANT_SLUG = "studio-lume";

export default function WidgetPage() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { tenantSlug: DEMO_TENANT_SLUG },
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;
    sendMessage({ text: input });
    setInput("");
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
                {m.parts.map((part) =>
                  part.type === "text" ? (
                    <span key={`${m.id}-${part.text.slice(0, 20)}`}>{part.text}</span>
                  ) : null,
                )}
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
