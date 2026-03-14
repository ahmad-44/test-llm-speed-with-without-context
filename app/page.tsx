"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Role = "user" | "assistant";
type Mode = "context" | "bare" | "intent";

interface Profile {
  ttft: number;
  total: number;
  tokens: number;
  tokPerSec: number;
  mem0Ms: number;
  apiMs: number;
  classifyMs?: number; // intent tab only
  model?: string;
}

interface IntentScore { name: string; score: number; }

interface Message {
  role: Role;
  content: string;
  imageUrl?: string;       // image generation result
  intent?: string;         // detected intent (intent tab)
  intentScores?: IntentScore[];
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

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", background: "#1e1e1e",
          border: "1px solid #333", borderRadius: 6, padding: "6px 10px",
          fontSize: 11, color: "#ccc", whiteSpace: "nowrap", zIndex: 50,
          pointerEvents: "none", lineHeight: 1.5,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid #333",
          }} />
        </div>
      )}
    </div>
  );
}

function ProfileTable({ profile, accentColor, isContext }: { profile: Profile; accentColor: string; isContext: boolean }) {
  const [showInfo, setShowInfo] = useState(false);
  const showClassify = profile.classifyMs !== undefined;

  const cells = [
    {
      label: "TTFT",
      value: fmtMs(profile.ttft),
      tooltip: "Time to First Token — from when you hit Send to when the first word appeared.",
    },
    {
      label: "Total",
      value: fmtMs(profile.total),
      tooltip: "Total response time — from Send to the very last word.",
    },
    {
      label: "Tokens",
      value: String(profile.tokens),
      tooltip: "Number of word-pieces streamed from the model.",
    },
    {
      label: "Tok/s",
      value: profile.tokPerSec.toFixed(1),
      tooltip: "How fast the model was typing — tokens per second during streaming.",
    },
    ...(showClassify ? [{
      label: "Intent",
      value: fmtMs(profile.classifyMs!),
      tooltip: "Time to classify your message intent using pgvector similarity search.",
    }] : []),
    ...(isContext || showClassify ? [{
      label: "mem0",
      value: fmtMs(profile.mem0Ms),
      tooltip: "Time the server spent searching mem0 memory for relevant context.",
    }] : []),
    {
      label: "API",
      value: fmtMs(profile.apiMs),
      tooltip: "Time for the server to connect to OpenAI and start receiving the stream.",
    },
    ...(profile.model ? [{
      label: "Model",
      value: profile.model.replace("gpt-", "").replace("-2026-03-05", ""),
      tooltip: `Model used: ${profile.model}`,
    }] : []),
  ];

  const infoRows = [
    { name: "TTFT",   formula: "firstTokenAt − requestSent",              source: "client" },
    { name: "Total",  formula: "lastTokenAt − requestSent",               source: "client" },
    { name: "Tokens", formula: "count of SSE delta events",               source: "client" },
    { name: "Tok/s",  formula: "Tokens ÷ (Total − TTFT) × 1000",         source: "client" },
    ...(showClassify ? [{ name: "Intent", formula: "pgvector match_intent() time", source: "server" }] : []),
    ...(isContext || showClassify ? [{ name: "mem0", formula: "mem0.search() end − start", source: "server" }] : []),
    { name: "API",   formula: "fetch(OpenAI) end − start",                source: "server" },
  ];

  return (
    <div style={{ marginTop: 10 }}>
      {/* Cells row */}
      <div style={{ display: "flex", alignItems: "stretch", width: "fit-content", maxWidth: "100%" }}>
        <div style={{ display: "flex", borderRadius: "6px 0 0 6px", border: "1px solid #222", overflow: "hidden" }}>
          {cells.map((cell, i) => (
            <Tooltip key={cell.label} text={cell.tooltip}>
              <div style={{
                padding: "5px 10px", cursor: "default",
                borderRight: i < cells.length - 1 ? "1px solid #222" : "none",
                minWidth: 52, background: "#0d0d0d",
              }}>
                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                  {cell.label}
                </div>
                <div style={{ fontSize: 12, color: accentColor, fontFamily: "monospace", fontWeight: 600 }}>
                  {cell.value}
                </div>
              </div>
            </Tooltip>
          ))}
        </div>

        {/* Formulas toggle */}
        <button
          onClick={() => setShowInfo((v) => !v)}
          style={{
            background: showInfo ? "#1e1e1e" : "#0d0d0d",
            border: "1px solid #222", borderLeft: "none",
            borderRadius: 0, padding: "0 10px",
            color: showInfo ? accentColor : "#555", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", display: "flex",
            alignItems: "center", justifyContent: "center",
            transition: "color 0.15s", whiteSpace: "nowrap",
          }}
        >
          formulas
        </button>

        {/* Explain link */}
        <a
          href="/explain"
          style={{
            background: "#0d0d0d", border: "1px solid #222", borderLeft: "none",
            borderRadius: "0 6px 6px 0", padding: "0 10px",
            color: "#555", fontSize: 11, display: "flex",
            alignItems: "center", justifyContent: "center",
            textDecoration: "none", transition: "color 0.15s", whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
        >
          what's this?
        </a>
      </div>

      {/* Expandable info panel */}
      {showInfo && (
        <div style={{
          marginTop: 6, border: "1px solid #222", borderRadius: 6,
          background: "#0d0d0d", overflow: "hidden", fontSize: 11,
          width: "fit-content", maxWidth: "100%",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid #1a1a1a", color: "#666", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            How each value is calculated
          </div>
          {infoRows.map((row, i) => (
            <div key={row.name} style={{
              display: "flex", gap: 0, alignItems: "center",
              borderBottom: i < infoRows.length - 1 ? "1px solid #1a1a1a" : "none",
            }}>
              <div style={{ padding: "5px 10px", minWidth: 52, color: accentColor, fontFamily: "monospace", fontWeight: 600, fontSize: 11 }}>
                {row.name}
              </div>
              <div style={{ padding: "5px 10px", color: "#888", borderLeft: "1px solid #1a1a1a", flex: 1, fontFamily: "monospace", fontSize: 11 }}>
                {row.formula}
              </div>
              <div style={{ padding: "5px 10px", borderLeft: "1px solid #1a1a1a", color: "#555", fontSize: 10, minWidth: 46, textAlign: "center" }}>
                {row.source}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Intent badge ─────────────────────────────────────────────────────────────

const INTENT_COLORS: Record<string, string> = {
  audio_generation: "#f59e0b", code: "#3b82f6", document_edit: "#8b5cf6",
  document_generation: "#6366f1", file_analysis: "#06b6d4", generate_spreadsheet: "#22c55e",
  image_edit: "#ec4899", image_generation: "#f97316", low_effort: "#94a3b8",
  models_information: "#a855f7", pdf_generation: "#ef4444", ppt_generation: "#fb923c",
  reasoning: "#7c6af7", video_generation: "#14b8a6", web_surfing: "#0ea5e9",
};

function IntentBadge({ intent, scores }: { intent: string; scores?: IntentScore[] }) {
  const [show, setShow] = useState(false);
  const color = INTENT_COLORS[intent] ?? "#888";
  return (
    <div style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", cursor: "default" }}>
        {intent.replace(/_/g, " ")}
      </span>
      {show && scores && scores.length > 0 && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 10px", zIndex: 50, minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Confidence scores</div>
          {scores.slice(0, 5).map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: INTENT_COLORS[s.name] ?? "#888", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#aaa", flex: 1 }}>{s.name.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#fff" }}>{(s.score * 100).toFixed(0)}%</span>
              <div style={{ width: 40, height: 3, background: "#222", borderRadius: 2 }}>
                <div style={{ width: `${Math.min(100, s.score * 100)}%`, height: "100%", background: INTENT_COLORS[s.name] ?? "#888", borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Intent chat panel ─────────────────────────────────────────────────────────

function IntentChatPanel({
  messages, streaming, error, input, setInput, onSend, onStop, onClear,
}: {
  messages: Message[]; streaming: boolean; error: string | null;
  input: string; setInput: (v: string) => void;
  onSend: () => void; onStop: () => void; onClear: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accentColor = "#e5a64b";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: "0 40px", textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>🎯</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#777" }}>Intent-aware chat</div>
            <div style={{ fontSize: 13, color: "#444", maxWidth: 360, lineHeight: 1.6 }}>
              Classifies your message, routes to the best model, and uses mem0 memory. Ask for images, code, reasoning — anything.
            </div>
            <a href="/intents" style={{ fontSize: 12, color: accentColor, textDecoration: "none", marginTop: 4 }}>Manage intent classes →</a>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginRight: 10, marginTop: 2 }}>
                    🎯
                  </div>
                )}
                <div style={{ maxWidth: "80%" }}>
                  {/* Intent badge on user messages */}
                  {msg.role === "user" && msg.intent && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                      <IntentBadge intent={msg.intent} scores={msg.intentScores} />
                    </div>
                  )}
                  <div style={{
                    padding: msg.role === "user" ? "10px 14px" : "10px 0",
                    borderRadius: msg.role === "user" ? 16 : 0,
                    background: msg.role === "user" ? "#1f1a10" : "transparent",
                    border: msg.role === "user" ? "1px solid #3a2f14" : "none",
                    color: "#e8e8e8", fontSize: 14, lineHeight: 1.65, wordBreak: "break-word",
                  }}>
                    {msg.imageUrl ? (
                      <img src={msg.imageUrl} alt="Generated" style={{ maxWidth: "100%", borderRadius: 10, display: "block" }} />
                    ) : msg.content === "" && streaming && i === messages.length - 1 ? (
                      <span style={{ color: "#555" }}>●</span>
                    ) : (
                      <MessageContent content={msg.content} />
                    )}
                  </div>
                  {msg.role === "assistant" && msg.profile && (
                    <ProfileTable profile={msg.profile} accentColor={accentColor} isContext={true} />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ maxWidth: 760, margin: "0 auto 8px", padding: "8px 14px", background: "#2a0f0f", border: "1px solid #5c1f1f", borderRadius: 8, color: "#ff6b6b", fontSize: 13, width: "calc(100% - 40px)" }}>
          {error}
        </div>
      )}

      <div style={{ borderTop: "1px solid #1e1e1e", background: "#0d0d0d", padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="Ask anything — intent auto-detected... (Shift+Enter for newline)"
            rows={1}
            disabled={streaming}
            style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 12, color: "#e8e8e8", padding: "10px 14px", fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5, minHeight: 42, maxHeight: 200, transition: "border-color 0.15s" }}
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
          <span style={{ fontSize: 11, color: "#444" }}>intent classifier · mem0 memory · smart model routing</span>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/intents" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>manage intents</a>
            {messages.length > 0 && <button onClick={onClear} style={{ background: "none", border: "none", color: "#444", fontSize: 11, cursor: "pointer", padding: "2px 4px", fontFamily: "inherit" }}>clear chat</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────

function Tab({ active, onClick, label, badge, color, featured }: {
  active: boolean; onClick: () => void; label: string; badge: string; color: string; featured?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 16px",
        background: active
          ? (featured ? `${color}18` : "#1a1a1a")
          : (featured ? `${color}08` : "transparent"),
        border: "none",
        borderBottom: active ? `2px solid ${color}` : `2px solid ${featured ? color + "33" : "transparent"}`,
        boxShadow: featured
          ? (active ? `inset 0 0 40px ${color}14, 0 2px 12px ${color}22` : `inset 0 0 20px ${color}08`)
          : "none",
        color: active ? "#e8e8e8" : (featured ? "#bbb" : "#666"),
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all 0.15s",
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      <span
        style={{
          background: active ? color : (featured ? `${color}33` : "#2a2a2a"),
          color: active ? "#fff" : (featured ? color : "#555"),
          borderRadius: 4,
          padding: "1px 6px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          boxShadow: featured && !active ? `0 0 6px ${color}55` : "none",
        }}
      >
        {badge}
      </span>
      {featured && !active && <span style={{ fontSize: 10, color: color, opacity: 0.7 }}>✦</span>}
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
  const [intentMsgs, setIntentMsgs] = useState<Message[]>([]);
  const [contextInput, setContextInput] = useState("");
  const [bareInput, setBareInput] = useState("");
  const [intentInput, setIntentInput] = useState("");
  const [contextStreaming, setContextStreaming] = useState(false);
  const [bareStreaming, setBareStreaming] = useState(false);
  const [intentStreaming, setIntentStreaming] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [bareError, setBareError] = useState<string | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const contextAbort = useRef<AbortController | null>(null);
  const bareAbort = useRef<AbortController | null>(null);
  const intentAbort = useRef<AbortController | null>(null);

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

  // Intent chat send
  const sendIntent = useCallback(async () => {
    const text = intentInput.trim();
    if (!text || intentStreaming) return;

    setIntentError(null);
    const newMessages: Message[] = [...intentMsgs, { role: "user", content: text }];
    setIntentMsgs(newMessages);
    setIntentInput("");
    setIntentStreaming(true);

    const controller = new AbortController();
    intentAbort.current = controller;
    const startTime = Date.now();

    try {
      const res = await fetch("/api/intent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const contentType = res.headers.get("content-type") ?? "";

      // Image response (non-streaming JSON)
      if (contentType.includes("application/json")) {
        const json = await res.json();
        if (json.type === "image") {
          const total = Date.now() - startTime;
          const profile: Profile = { ttft: total, total, tokens: 0, tokPerSec: 0, mem0Ms: 0, apiMs: json.timing?.apiMs ?? 0, classifyMs: json.timing?.classifyMs, model: "gpt-image-1" };
          // stamp intent on user message
          setIntentMsgs((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], intent: json.intent, intentScores: json.scores };
            return [...updated, { role: "assistant", content: "", imageUrl: json.imageUrl, profile }];
          });
        }
        return;
      }

      // Streaming text response
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let firstTokenAt: number | null = null;
      let tokenCount = 0;
      let meta: { intent?: string; scores?: IntentScore[]; timing?: { classifyMs: number; apiMs: number; mem0Ms: number } } = {};
      setIntentMsgs((prev) => [...prev, { role: "assistant", content: "" }]);

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
            if (json.__meta) {
              meta = json.__meta;
              // stamp intent on user message
              setIntentMsgs((prev) => {
                const updated = [...prev];
                const userIdx = updated.length - 2;
                if (userIdx >= 0) updated[userIdx] = { ...updated[userIdx], intent: meta.intent, intentScores: meta.scores };
                return updated;
              });
              continue;
            }
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              if (!firstTokenAt) firstTokenAt = Date.now();
              tokenCount++;
              assistantContent += token;
              setIntentMsgs((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {}
        }
      }

      const total = Date.now() - startTime;
      const ttft = firstTokenAt ? firstTokenAt - startTime : total;
      const streamDuration = total - ttft;
      const tokPerSec = streamDuration > 50 ? (tokenCount / streamDuration) * 1000 : 0;
      const profile: Profile = {
        ttft, total, tokens: tokenCount, tokPerSec,
        mem0Ms: meta.timing?.mem0Ms ?? 0,
        apiMs: meta.timing?.apiMs ?? 0,
        classifyMs: meta.timing?.classifyMs,
        model: meta.intent ? undefined : undefined,
      };
      setIntentMsgs((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: assistantContent, profile };
        return updated;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setIntentError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIntentStreaming(false);
      intentAbort.current = null;
    }
  }, [intentInput, intentMsgs, intentStreaming]);

  const stopContext = () => { contextAbort.current?.abort(); setContextStreaming(false); };
  const stopBare = () => { bareAbort.current?.abort(); setBareStreaming(false); };
  const stopIntent = () => { intentAbort.current?.abort(); setIntentStreaming(false); };
  const clearContext = () => { if (contextStreaming) stopContext(); setContextMsgs([]); setContextError(null); };
  const clearBare = () => { if (bareStreaming) stopBare(); setBareMsgs([]); setBareError(null); };
  const clearIntent = () => { if (intentStreaming) stopIntent(); setIntentMsgs([]); setIntentError(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #1e1e1e", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #7c6af7, #e5a64b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>⚡</div>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#e8e8e8" }}>GPT-5.4</span>
          <span style={{ fontSize: 11, color: "#444", marginLeft: 8 }}>Speed comparison</span>
        </div>
        <a href="/intents" style={{ marginLeft: "auto", fontSize: 11, color: "#555", textDecoration: "none" }}>Manage Intents</a>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e", background: "#0d0d0d", flexShrink: 0 }}>
        <Tab active={mode === "bare"} onClick={() => setMode("bare")} label="No Context" badge="fast" color="#2ea87e" />
        <Tab active={mode === "context"} onClick={() => setMode("context")} label="With Memory" badge="mem0" color="#7c6af7" />
        <Tab active={mode === "intent"} onClick={() => setMode("intent")} label="Chat + Mem0 + Image Gen/Edit" badge="intent + mem0" color="#e5a64b" featured />
      </div>

      {mode === "context" && (
        <ChatPanel mode="context" messages={contextMsgs} streaming={contextStreaming} error={contextError} input={contextInput} setInput={setContextInput} onSend={sendContext} onStop={stopContext} onClear={clearContext} />
      )}
      {mode === "bare" && (
        <ChatPanel mode="bare" messages={bareMsgs} streaming={bareStreaming} error={bareError} input={bareInput} setInput={setBareInput} onSend={sendBare} onStop={stopBare} onClear={clearBare} />
      )}
      {mode === "intent" && (
        <IntentChatPanel messages={intentMsgs} streaming={intentStreaming} error={intentError} input={intentInput} setInput={setIntentInput} onSend={sendIntent} onStop={stopIntent} onClear={clearIntent} />
      )}
    </div>
  );
}
