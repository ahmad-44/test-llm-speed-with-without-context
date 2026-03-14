"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Role = "user" | "assistant";
type Mode = "context" | "bare";

interface Profile {
  ttft: number;      // client: ms from send → first token
  total: number;     // client: ms from send → last token
  tokens: number;    // token count
  tokPerSec: number; // tokens / streaming duration
  mem0Ms: number;    // server: mem0 search time
  apiMs: number;     // server: OpenAI connect time
}

interface Message {
  role: Role;
  content: string;
  profile?: Profile;
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
}

function MessageContent({ content }: { content: string }) {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const segments: { start: number; end: number; lang: string; code: string }[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(escaped)) !== null) {
    segments.push({ start: m.index, end: m.index + m[0].length, lang: m[1], code: m[2] });
  }

  if (segments.length === 0) {
    return <span className="prose" dangerouslySetInnerHTML={{ __html: formatInline(escaped) }} />;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let k = 0;
  for (const seg of segments) {
    if (cursor < seg.start)
      nodes.push(<span key={k++} className="prose" dangerouslySetInnerHTML={{ __html: formatInline(escaped.slice(cursor, seg.start)) }} />);
    nodes.push(
      <pre key={k++}>
        {seg.lang && <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>{seg.lang}</div>}
        <code>{seg.code}</code>
      </pre>
    );
    cursor = seg.end;
  }
  if (cursor < escaped.length)
    nodes.push(<span key={k++} className="prose" dangerouslySetInnerHTML={{ __html: formatInline(escaped.slice(cursor)) }} />);
  return <>{nodes}</>;
}

// ── Speed profiler table ─────────────────────────────────────────────────────

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function ProfileTable({ profile, accentColor, isContext }: { profile: Profile; accentColor: string; isContext: boolean }) {
  const cells = [
    { label: "TTFT",   value: fmtMs(profile.ttft),             title: "Time to first token (client)" },
    { label: "Total",  value: fmtMs(profile.total),            title: "Total response time (client)" },
    { label: "Tokens", value: String(profile.tokens),          title: "Tokens streamed" },
    { label: "Tok/s",  value: profile.tokPerSec.toFixed(1),    title: "Tokens per second" },
    ...(isContext ? [{ label: "mem0", value: fmtMs(profile.mem0Ms), title: "mem0 memory search (server)" }] : []),
    { label: "API",    value: fmtMs(profile.apiMs),            title: "OpenAI connect time (server)" },
  ];

  return (
    <div style={{ marginTop: 10, display: "flex", borderRadius: 6, border: "1px solid #222", overflow: "hidden", width: "fit-content", maxWidth: "100%" }}>
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          title={cell.title}
          style={{
            padding: "5px 10px",
            borderRight: i < cells.length - 1 ? "1px solid #222" : "none",
            minWidth: 52,
          }}
        >
          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
            {cell.label}
          </div>
          <div style={{ fontSize: 12, color: accentColor, fontFamily: "monospace", fontWeight: 600 }}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────

function Tab({ active, onClick, label, badge, color }: {
  active: boolean; onClick: () => void; label: string; badge: string; color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 16px",
        background: active ? "#1a1a1a" : "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
        color: active ? "#e8e8e8" : "#666",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          background: active ? color : "#2a2a2a",
          color: active ? "#fff" : "#555",
          borderRadius: 4,
          padding: "1px 6px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
        }}
      >
        {badge}
      </span>
      {label}
    </button>
  );
}

// ── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  mode,
  messages,
  streaming,
  error,
  input,
  setInput,
  onSend,
  onStop,
  onClear,
}: {
  mode: Mode;
  messages: Message[];
  streaming: boolean;
  error: string | null;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const isContext = mode === "context";
  const accentColor = isContext ? "#7c6af7" : "#2ea87e";
  const emptyIcon = isContext ? "🧠" : "⚡";
  const emptyTitle = isContext ? "Memory mode" : "No context mode";
  const emptyDesc = isContext ? "Uses mem0 — retrieves relevant memories, sends last 3 messages only." : "Sends only your current message. No history, no memory. Maximum speed.";
  const placeholder = isContext
    ? "Message with memory... (Shift+Enter for newline)"
    : "Message without context... (Shift+Enter for newline)";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: "0 40px", textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>{emptyIcon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#777" }}>{emptyTitle}</div>
            <div style={{ fontSize: 13, color: "#444", maxWidth: 340, lineHeight: 1.6 }}>{emptyDesc}</div>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                {msg.role === "assistant" && (
                  <div style={{
                    width: 26, height: 26, borderRadius: 7,
                    background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, flexShrink: 0, marginRight: 10, marginTop: 2,
                  }}>
                    {isContext ? "🧠" : "⚡"}
                  </div>
                )}
                <div style={{ maxWidth: "80%" }}>
                  <div style={{
                    padding: msg.role === "user" ? "10px 14px" : "10px 0",
                    borderRadius: msg.role === "user" ? 16 : 0,
                    background: msg.role === "user" ? (isContext ? "#1e1b3a" : "#0e2620") : "transparent",
                    border: msg.role === "user" ? `1px solid ${isContext ? "#2e2560" : "#1a3d30"}` : "none",
                    color: "#e8e8e8", fontSize: 14, lineHeight: 1.65, wordBreak: "break-word",
                  }}>
                    {msg.content === "" && streaming && i === messages.length - 1 ? (
                      <span style={{ color: "#555" }}>●</span>
                    ) : (
                      <MessageContent content={msg.content} />
                    )}
                  </div>
                  {msg.role === "assistant" && msg.profile && (
                    <ProfileTable profile={msg.profile} accentColor={accentColor} isContext={isContext} />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ maxWidth: 760, margin: "0 auto 8px", padding: "8px 14px", background: "#2a0f0f", border: "1px solid #5c1f1f", borderRadius: 8, color: "#ff6b6b", fontSize: 13, width: "calc(100% - 40px)" }}>
          {error}
        </div>
      )}

      {/* Input bar */}
      <div style={{ borderTop: "1px solid #1e1e1e", background: "#0d0d0d", padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKey}
            placeholder={placeholder}
            rows={1}
            disabled={streaming}
            style={{
              flex: 1, background: "#1a1a1a", border: `1px solid #2e2e2e`,
              borderRadius: 12, color: "#e8e8e8", padding: "10px 14px",
              fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit",
              lineHeight: 1.5, minHeight: 42, maxHeight: 200, transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.target.style.borderColor = accentColor)}
            onBlur={(e) => (e.target.style.borderColor = "#2e2e2e")}
          />
          {streaming ? (
            <button onClick={onStop} style={{ background: "#222", border: "1px solid #3e3e3e", color: "#e8e8e8", borderRadius: 10, width: 42, height: 42, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontFamily: "inherit" }}>■</button>
          ) : (
            <button onClick={onSend} disabled={!input.trim()} style={{ background: input.trim() ? `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)` : "#1e1e1e", border: "none", color: input.trim() ? "#fff" : "#444", borderRadius: 10, width: 42, height: 42, cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18, transition: "background 0.15s", fontFamily: "inherit" }}>↑</button>
          )}
        </div>
        <div style={{ maxWidth: 760, margin: "6px auto 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#444" }}>
            {isContext ? "mem0 memory · last 3 msgs sent" : "single message · no history"}
          </span>
          {messages.length > 0 && (
            <button onClick={onClear} style={{ background: "none", border: "none", color: "#444", fontSize: 11, cursor: "pointer", padding: "2px 4px", fontFamily: "inherit" }}>
              clear chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("context");
  const [contextMsgs, setContextMsgs] = useState<Message[]>([]);
  const [bareMsgs, setBareMsgs] = useState<Message[]>([]);
  const [contextInput, setContextInput] = useState("");
  const [bareInput, setBareInput] = useState("");
  const [contextStreaming, setContextStreaming] = useState(false);
  const [bareStreaming, setBareStreaming] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [bareError, setBareError] = useState<string | null>(null);
  const contextAbort = useRef<AbortController | null>(null);
  const bareAbort = useRef<AbortController | null>(null);

  async function runChat(
    mode: Mode,
    input: string,
    messages: Message[],
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setInput: (v: string) => void,
    setStreaming: (v: boolean) => void,
    setError: (v: string | null) => void,
    abortRef: React.MutableRefObject<AbortController | null>
  ) {
    const text = input.trim();
    if (!text) return;

    setError(null);
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const startTime = Date.now();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, useContext: mode === "context" }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = "Request failed";
        try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
        throw new Error(msg);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let firstTokenAt: number | null = null;
      let tokenCount = 0;
      let serverTiming = { mem0Ms: 0, apiMs: 0 };
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            // Server timing event
            if (json.__timing) {
              serverTiming = { mem0Ms: json.__timing.mem0_ms ?? 0, apiMs: json.__timing.api_connect_ms ?? 0 };
              continue;
            }
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              if (!firstTokenAt) firstTokenAt = Date.now();
              tokenCount++;
              assistantContent += token;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {}
        }
      }

      // Build profile
      const total = Date.now() - startTime;
      const ttft = firstTokenAt ? firstTokenAt - startTime : total;
      const streamDuration = total - ttft;
      const tokPerSec = streamDuration > 50 ? (tokenCount / streamDuration) * 1000 : 0;
      const profile: Profile = { ttft, total, tokens: tokenCount, tokPerSec, ...serverTiming };

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: assistantContent, profile };
        return updated;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" && !last.content ? prev.slice(0, -1) : prev;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const sendContext = useCallback(() => {
    if (contextStreaming) return;
    runChat("context", contextInput, contextMsgs, setContextMsgs, setContextInput, setContextStreaming, setContextError, contextAbort);
  }, [contextInput, contextMsgs, contextStreaming]);

  const sendBare = useCallback(() => {
    if (bareStreaming) return;
    runChat("bare", bareInput, bareMsgs, setBareMsgs, setBareInput, setBareStreaming, setBareError, bareAbort);
  }, [bareInput, bareMsgs, bareStreaming]);

  const stopContext = () => { contextAbort.current?.abort(); setContextStreaming(false); };
  const stopBare = () => { bareAbort.current?.abort(); setBareStreaming(false); };
  const clearContext = () => { if (contextStreaming) stopContext(); setContextMsgs([]); setContextError(null); };
  const clearBare = () => { if (bareStreaming) stopBare(); setBareMsgs([]); setBareError(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #1e1e1e", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #7c6af7, #2ea87e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>⚡</div>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#e8e8e8" }}>GPT-5.4</span>
          <span style={{ fontSize: 11, color: "#444", marginLeft: 8 }}>Speed comparison</span>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", background: "#0d0d0d", flexShrink: 0 }}>
        <Tab active={mode === "context"} onClick={() => setMode("context")} label="With Memory" badge="mem0" color="#7c6af7" />
        <Tab active={mode === "bare"} onClick={() => setMode("bare")} label="No Context" badge="fast" color="#2ea87e" />
      </div>

      {/* Chat panel — only active mode rendered, other kept in state */}
      {mode === "context" ? (
        <ChatPanel
          mode="context"
          messages={contextMsgs}
          streaming={contextStreaming}
          error={contextError}
          input={contextInput}
          setInput={setContextInput}
          onSend={sendContext}
          onStop={stopContext}
          onClear={clearContext}
        />
      ) : (
        <ChatPanel
          mode="bare"
          messages={bareMsgs}
          streaming={bareStreaming}
          error={bareError}
          input={bareInput}
          setInput={setBareInput}
          onSend={sendBare}
          onStop={stopBare}
          onClear={clearBare}
        />
      )}
    </div>
  );
}
