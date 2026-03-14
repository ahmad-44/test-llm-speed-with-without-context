"use client";

import { useEffect, useState, useRef } from "react";
import { getIntentColor, getIntentModel } from "@/lib/intents";

interface IntentClass {
  id: string;
  name: string;
  description: string;
  color: string;
  intent_examples: { count: number }[];
}

interface Example {
  id: string;
  class_name: string;
  message: string;
  created_at: string;
}

interface ScoreRow { name: string; score: number; }

const S = {
  bg: "#0f0f0f", surface: "#111", surface2: "#1a1a1a",
  border: "#222", text: "#e8e8e8", muted: "#666", faint: "#444",
};

function Badge({ name, color }: { name: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {name}
    </span>
  );
}

const MODEL_META: Record<string, { label: string; color: string; note?: string }> = {
  "gpt-image-1":        { label: "gpt-image-1",        color: "#f97316" },
  "gpt-5.4-2026-03-05": { label: "gpt-5.4",            color: "#7c6af7" },
  "gpt-4o":             { label: "gpt-4o",             color: "#3b82f6" },
  "gpt-4o-mini":        { label: "gpt-4o-mini",        color: "#94a3b8" },
  "o3-mini":            { label: "o3-mini",            color: "#a855f7" },
};

function ModelBadge({ intentName }: { intentName: string }) {
  const { model, extraParams } = getIntentModel(intentName);
  const meta = MODEL_META[model] ?? { label: model, color: "#666" };
  const effort = extraParams?.reasoning_effort as string | undefined;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ background: meta.color + "1a", color: meta.color, border: `1px solid ${meta.color}33`, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", fontFamily: "monospace" }}>
        {meta.label}
      </span>
      {effort && (
        <span style={{ background: "#1a1a1a", color: "#555", border: "1px solid #2a2a2a", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "monospace" }}>
          {effort}
        </span>
      )}
    </span>
  );
}

function IntentDocs() {
  const D = {
    section: { marginBottom: 28 } as React.CSSProperties,
    h2: { fontSize: 13, fontWeight: 700, color: "#e8e8e8", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
    p: { fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 8 } as React.CSSProperties,
    li: { fontSize: 13, color: "#999", lineHeight: 1.9, paddingLeft: 16, position: "relative" } as React.CSSProperties,
    code: { background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace", fontSize: 12, color: "#c8a6ff" } as React.CSSProperties,
    chip: (color: string) => ({ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" as const }),
    card: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "18px 20px" } as React.CSSProperties,
    row: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 } as React.CSSProperties,
    dot: (color: string) => ({ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }),
  };

  const models: { intent: string; color: string; model: string; note: string }[] = [
    { intent: "image_generation",   color: "#f97316", model: "gpt-image-1",           note: "Generates a new image from scratch" },
    { intent: "image_edit",         color: "#ec4899", model: "gpt-image-1",           note: "Edits the last generated image in chat" },
    { intent: "reasoning",          color: "#7c6af7", model: "gpt-5.4 (effort:high)", note: "Step-by-step analysis and math" },
    { intent: "low_effort",         color: "#94a3b8", model: "gpt-5.4 (effort:low)",  note: "Greetings, small talk, simple questions" },
    { intent: "models_information", color: "#a855f7", model: "gpt-5.4",               note: "Questions about AI models and capabilities" },
    { intent: "everything else",    color: "#3b82f6", model: "gpt-4o",                note: "Code, documents, data, web, PDFs…" },
  ];

  return (
    <div>
      {/* Overview */}
      <div style={D.card}>
        <div style={{ ...D.h2, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>🧠</span> How Intent Classification Works
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            ["1", "#7c6af7", "Embed", "Your message is converted into a 1536-dimension vector using OpenAI's text-embedding-3-small model. This vector captures the meaning of your text as numbers."],
            ["2", "#3b82f6", "Search", "The vector is compared against all stored example embeddings in Supabase using cosine similarity (pgvector). The top 15 most similar examples are retrieved."],
            ["3", "#22c55e", "Aggregate", "Results are grouped by class. The average similarity score per class is computed. The class with the highest average wins."],
            ["4", "#e5a64b", "Route", "The winning intent determines which AI model is called — gpt-image-1, gpt-5.4 (reasoning/low_effort/models_information), or gpt-4o."],
          ].map(([num, color, title, desc]) => (
            <div key={num} style={{ display: "flex", gap: 14, paddingBottom: 16, borderLeft: `2px solid #1e1e1e`, marginLeft: 12, paddingLeft: 20, position: "relative" }}>
              <div style={{ position: "absolute", left: -9, top: 0, width: 16, height: 16, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#000", flexShrink: 0 }}>{num}</div>
              <div> 
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8e8", marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 12, color: "#888", lineHeight: 1.65 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* Model Routing */}
      <div style={D.card}>
        <div style={D.h2}><span>🔀</span> Model Routing</div>
        <p style={{ ...D.p, marginBottom: 14 }}>Based on the detected intent, the system automatically picks the best model:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {models.map(({ intent, color, model, note }) => (
            <div key={intent} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 7, padding: "8px 12px" }}>
              <span style={D.chip(color)}>{intent}</span>
              <span style={{ fontSize: 12, color: "#555", flexShrink: 0 }}>→</span>
              <code style={D.code}>{model}</code>
              <span style={{ fontSize: 12, color: "#666", marginLeft: 4 }}>{note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* Examples & Embeddings */}
      <div style={D.card}>
        <div style={D.h2}><span>📚</span> Classes & Examples</div>
        <p style={D.p}>Each <strong style={{ color: "#e8e8e8" }}>intent class</strong> is a category (e.g. <code style={D.code}>code</code>, <code style={D.code}>image_generation</code>). Each class has <strong style={{ color: "#e8e8e8" }}>example messages</strong> — real phrases a user might type for that intent.</p>
        <p style={D.p}>The classifier learns purely from these examples. More examples = better accuracy.</p>

        <div style={{ background: "#0d1f0d", border: "1px solid #1a3a1a", borderRadius: 8, padding: "12px 16px", marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>✓ Auto-embedding — no manual step needed</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {[
              "Adding a new example → embedding computed instantly on save",
              "Editing an existing example → re-embedded automatically on save",
              "Deleting an example → removed from the vector index immediately",
            ].map((txt) => (
              <li key={txt} style={{ fontSize: 12, color: "#6dbb6d", lineHeight: 1.8, paddingLeft: 14, position: "relative" }}>
                <span style={{ position: "absolute", left: 0 }}>·</span>{txt}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* Buttons explained */}
      <div style={D.card}>
        <div style={D.h2}><span>🛠</span> Header Buttons Explained</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Seed Examples", color: "#4ade80", desc: "Wipes and re-inserts all built-in examples from lib/intents.ts with fresh embeddings. Use this to reset to defaults or after adding new built-in examples in code. Warning: overwrites any manual examples for seeded classes." },
            { label: "↺ Recompute Embeddings", color: "#666", desc: "Re-embeds every existing example in the database without deleting anything. Use this if you switch embedding models or notice classification drift. Takes a few seconds for large datasets." },
            { label: "+ New Class", color: "#9484ff", desc: "Creates a new intent class with a name, description, and color. After creating, click it in the sidebar and add at least 7 examples before using it in chat." },
            { label: "✨ AI Generate Examples", color: "#7c6af7", desc: "Visible when a class is selected. Uses GPT-4o-mini to generate N diverse, realistic examples for that class in batches of 100. Examples are embedded and saved automatically. Duplicates are silently skipped via a unique (class_name, message) constraint." },
          ].map(({ label, color, desc }) => (
            <div key={label} style={D.row}>
              <span style={{ ...D.chip(color), marginTop: 2, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 12, color: "#888", lineHeight: 1.65 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* Scoring explained */}
      <div style={D.card}>
        <div style={D.h2}><span>📊</span> How Confidence Scores Work</div>
        <p style={D.p}>The score shown (e.g. "72% confidence") is the <strong style={{ color: "#e8e8e8" }}>average cosine similarity</strong> of the top 15 nearest examples for that class — not the score of a single best match.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {[
            ["Why scores look lower than expected", "Even an exact copy of an example won't show 100%. Cosine similarity between two independently computed embeddings of the same text lands at ~0.99 due to floating point rounding, and then it's averaged with the other 14 retrieved results — which brings the displayed number down further."],
            ["The winner is still correct", "The winning class is the one with the highest average, so even a 55% score beats a 40% score. The classifier picks the right intent even when absolute numbers look low."],
            ["More examples = more stable scores", "With 500 examples per class the average is computed over many diverse hits, dampening outliers. This makes the classifier more robust than with 7–30 examples, even though individual scores may look similar."],
            ["Why top-15 average (not max)", "Using the best single match would be fragile — one rogue example that overlaps two classes could hijack the result. Averaging the top 15 balances precision and stability, especially at higher example counts."],
          ].map(([title, desc]) => (
            <div key={title as string} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 7, padding: "9px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8e8", marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 12, color: "#777", lineHeight: 1.55 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 20 }} />

      {/* Tips */}
      <div style={D.card}>
        <div style={D.h2}><span>💡</span> Tips for Good Classification</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            ["Use natural language", "Write examples the way a real user would type them, not formal definitions."],
            ["Vary phrasing", "Include short, long, formal and casual variants. Don't repeat the same sentence slightly rephrased."],
            ["Cover edge cases", "Add examples that are close to other classes so the boundary is clear."],
            ["7+ examples minimum", "Below 7 examples, classification is unreliable. More is better up to ~30."],
            ["AI Generate for scale", "Use the '✨ AI Generate Examples' button on any class to generate up to 500 diverse examples instantly using GPT-4o-mini. Duplicates are automatically skipped."],
            ["Image edit needs prior image", "The image_edit intent only activates the edit endpoint if there is already a generated image earlier in the conversation. Otherwise it falls back to generation."],
            ["Test after changes", "Use the Test Classification panel above to check your message before sending it to chat."],
          ].map(([title, desc]) => (
            <li key={title as string} style={{ display: "flex", gap: 10, background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 7, padding: "9px 12px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e8e8e8", minWidth: 160, flexShrink: 0 }}>{title}</span>
              <span style={{ fontSize: 12, color: "#777", lineHeight: 1.55 }}>{desc}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ height: 20 }} />

      {/* 15 classes reference */}
      <div style={D.card}>
        <div style={D.h2}><span>🗂</span> Built-in Classes Reference</div>

        <p style={{ ...D.p, marginBottom: 10 }}>
          <strong style={{ color: "#4ade80" }}>Actively working in this app:</strong>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
          {[
            { name: "image_generation", color: "#f97316" },
            { name: "image_edit", color: "#ec4899" },
            { name: "reasoning", color: "#7c6af7" },
            { name: "low_effort", color: "#94a3b8" },
            { name: "models_information", color: "#a855f7" },
          ].map(({ name, color }) => (
            <span key={name} style={D.chip(color)}>{name}</span>
          ))}
        </div>

        <p style={{ ...D.p, marginBottom: 10 }}>
          <strong style={{ color: "#666" }}>Demo only — routed to gpt-4o but not fully implemented:</strong>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
          {[
            { name: "audio_generation", color: "#f59e0b" }, { name: "code", color: "#3b82f6" },
            { name: "document_edit", color: "#8b5cf6" }, { name: "document_generation", color: "#6366f1" },
            { name: "file_analysis", color: "#06b6d4" }, { name: "generate_spreadsheet", color: "#22c55e" },
            { name: "pdf_generation", color: "#ef4444" }, { name: "ppt_generation", color: "#fb923c" },
            { name: "video_generation", color: "#14b8a6" }, { name: "web_surfing", color: "#0ea5e9" },
          ].map(({ name, color }) => (
            <span key={name} style={{ ...D.chip(color), opacity: 0.5 }}>{name}</span>
          ))}
        </div>

        <p style={{ ...D.p, marginTop: 4, marginBottom: 0 }}>The demo classes are included to show how the classifier scales. You can add your own examples, rename them, or wire them up to any model or tool in your own app.</p>
      </div>
    </div>
  );
}

export default function IntentsPage() {
  const [classes, setClasses] = useState<IntentClass[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [seedDone, setSeedDone] = useState(false);

  // Test panel
  const [testMsg, setTestMsg] = useState("");
  const [testResult, setTestResult] = useState<{ intent: string; scores: ScoreRow[] } | null>(null);
  const [testing, setTesting] = useState(false);

  // Add example
  const [newExample, setNewExample] = useState("");
  const [adding, setAdding] = useState(false);

  // Generate examples
  const [generating, setGenerating] = useState(false);
  const [generateCount, setGenerateCount] = useState(500);

  // Edit example
  const [editId, setEditId] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState("");

  // Add class
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassDesc, setNewClassDesc] = useState("");
  const [newClassColor, setNewClassColor] = useState("#7c6af7");

  async function loadClasses() {
    setLoading(true);
    const res = await fetch("/api/intents/classes");
    setClasses(await res.json());
    setLoading(false);
  }

  async function loadExamples(name: string) {
    const res = await fetch(`/api/intents/examples?class=${encodeURIComponent(name)}`);
    setExamples(await res.json());
  }

  useEffect(() => { loadClasses(); }, []);

  useEffect(() => {
    if (selected) loadExamples(selected);
    else setExamples([]);
  }, [selected]);

  async function seed() {
    setSeeding(true);
    await fetch("/api/intents/seed", { method: "POST" });
    await loadClasses();
    if (selected) await loadExamples(selected);
    setSeeding(false);
    setSeedDone(true);
    setTimeout(() => setSeedDone(false), 3000);
  }

  async function recompute() {
    setRecomputing(true);
    await fetch("/api/intents/seed", { method: "PUT" });
    setRecomputing(false);
  }

  async function testClassify() {
    if (!testMsg.trim()) return;
    setTesting(true);
    const res = await fetch("/api/intents/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testMsg }),
    });
    setTestResult(await res.json());
    setTesting(false);
  }

  async function addExample() {
    if (!newExample.trim() || !selected) return;
    setAdding(true);
    const res = await fetch("/api/intents/examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_name: selected, message: newExample }),
    });
    const added = await res.json();
    setExamples((prev) => [...prev, added]);
    setNewExample("");
    setAdding(false);
    loadClasses();
  }

  async function deleteExample(id: string) {
    await fetch("/api/intents/examples", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setExamples((prev) => prev.filter((e) => e.id !== id));
    loadClasses();
  }

  async function generateExamples() {
    if (!selected) return;
    setGenerating(true);
    await fetch("/api/intents/generate-examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_name: selected, count: generateCount }),
    });
    await loadExamples(selected);
    await loadClasses();
    setGenerating(false);
  }

  async function saveEdit(id: string) {
    await fetch("/api/intents/examples", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, message: editMsg }),
    });
    setExamples((prev) => prev.map((e) => e.id === id ? { ...e, message: editMsg } : e));
    setEditId(null);
  }

  async function deleteClass(name: string) {
    if (!confirm(`Delete class "${name}" and all its examples?`)) return;
    await fetch("/api/intents/classes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (selected === name) setSelected(null);
    loadClasses();
  }

  async function addClass() {
    if (!newClassName.trim()) return;
    await fetch("/api/intents/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClassName, description: newClassDesc, color: newClassColor }),
    });
    setShowAddClass(false);
    setNewClassName(""); setNewClassDesc(""); setNewClassColor("#7c6af7");
    loadClasses();
  }

  const selectedClass = classes.find((c) => c.name === selected);
  const exampleCount = (name: string) => classes.find((c) => c.name === name)?.intent_examples?.[0]?.count ?? 0;

  return (
    <div style={{ minHeight: "100dvh", background: S.bg, color: S.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${S.border}`, padding: "12px 24px", background: S.surface, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ color: S.muted, fontSize: 12, textDecoration: "none" }}>← chat</a>
          <span style={{ color: S.border }}>|</span>
          <a href="/intents" style={{ fontWeight: 700, fontSize: 15, color: S.text, textDecoration: "none" }}>Intent Classes</a>
          <span style={{ fontSize: 12, color: S.muted }}>{classes.length} classes</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={recompute} disabled={recomputing} style={btnStyle("#1a1a1a", S.muted)}>
            {recomputing ? "Recomputing…" : "↺ Recompute Embeddings"}
          </button>
          <button onClick={seed} disabled={seeding} style={btnStyle(seeding ? "#1a1a1a" : "#1a2a1a", seedDone ? "#22c55e" : "#4ade80")}>
            {seeding ? "Seeding…" : seedDone ? "✓ Seeded!" : "Seed Examples"}
          </button>
          <button onClick={() => setShowAddClass(true)} style={btnStyle("#1e1b3a", "#9484ff")}>
            + New Class
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Sidebar — class list */}
        <aside style={{ width: 260, borderRight: `1px solid ${S.border}`, overflowY: "auto", background: S.surface, flexShrink: 0 }}>
          {loading ? (
            <div style={{ padding: 20, color: S.faint, fontSize: 13 }}>Loading…</div>
          ) : (
            classes.map((cls, idx) => (
              <div
                key={cls.name}
                onClick={() => setSelected(selected === cls.name ? null : cls.name)}
                style={{
                  padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "space-between", borderBottom: `1px solid ${S.border}`,
                  background: selected === cls.name ? "#1a1a2a" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: S.faint, fontFamily: "monospace", minWidth: 18, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: cls.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: selected === cls.name ? 600 : 400, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cls.name}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 6 }}>
                  <ModelBadge intentName={cls.name} />
                  <span style={{ fontSize: 11, color: S.faint }}>{exampleCount(cls.name)}</span>
                </div>
              </div>
            ))
          )}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Test panel — always visible */}
          <section style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, color: S.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              Test Classification
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && testClassify()}
                placeholder="Type a message to classify…"
                style={{ flex: 1, background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, padding: "8px 12px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
              />
              <button onClick={testClassify} disabled={testing || !testMsg.trim()} style={btnStyle("#1e1b3a", "#9484ff")}>
                {testing ? "…" : "Classify"}
              </button>
            </div>
            {testResult && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: S.muted }}>Top match:</span>
                  <Badge name={testResult.intent} color={getIntentColor(testResult.intent)} />
                  <ModelBadge intentName={testResult.intent} />
                  <span style={{ fontSize: 12, color: S.muted }}>
                    {((testResult.scores[0]?.score ?? 0) * 100).toFixed(1)}% confidence
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {testResult.scores.slice(0, 8).map((s) => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 5, background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 6, padding: "3px 8px" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: getIntentColor(s.name) }} />
                      <span style={{ fontSize: 11, color: S.muted }}>{s.name}</span>
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: S.text }}>{(s.score * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Docs — shown when no class selected */}
          {!selected && <IntentDocs />}

          {/* Selected class examples */}
          {selected && selectedClass ? (
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <Badge name={selected} color={selectedClass.color} />
                <ModelBadge intentName={selected} />
                <span style={{ fontSize: 13, color: S.muted }}>{selectedClass.description}</span>
                <button onClick={() => deleteClass(selected)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef444466", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                  Delete class
                </button>
              </div>

              {/* Add example */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExample()}
                  placeholder="Add a new example message…"
                  style={{ flex: 1, background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
                <button onClick={addExample} disabled={adding || !newExample.trim()} style={btnStyle("#1a2a1a", "#4ade80")}>
                  {adding ? "Embedding…" : "+ Add"}
                </button>
              </div>

              {/* AI generate examples */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
                <input
                  type="number"
                  min={10}
                  max={1000}
                  value={generateCount}
                  onChange={(e) => setGenerateCount(Number(e.target.value))}
                  style={{ width: 80, background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
                <button onClick={generateExamples} disabled={generating} style={btnStyle("#1a1a2a", "#7c6af7")}>
                  {generating ? "Generating…" : "✨ AI Generate Examples"}
                </button>
                <span style={{ fontSize: 11, color: S.muted }}>Uses GPT-4o-mini to generate diverse examples</span>
              </div>

              {/* Examples list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {examples.length === 0 && <div style={{ color: S.faint, fontSize: 13 }}>No examples yet.</div>}
                {examples.map((ex, idx) => (
                  <div key={ex.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: S.faint, fontFamily: "monospace", minWidth: 28, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                    {editId === ex.id ? (
                      <>
                        <input
                          value={editMsg}
                          onChange={(e) => setEditMsg(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(ex.id); if (e.key === "Escape") setEditId(null); }}
                          autoFocus
                          style={{ flex: 1, background: S.surface2, border: `1px solid #7c6af7`, borderRadius: 6, color: S.text, padding: "6px 10px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                        />
                        <button onClick={() => saveEdit(ex.id)} style={btnStyle("#1a2a1a", "#4ade80")}>Save</button>
                        <button onClick={() => setEditId(null)} style={btnStyle(S.surface2, S.muted)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 13, color: S.text }}>{ex.message}</span>
                        <button onClick={() => { setEditId(ex.id); setEditMsg(ex.message); }} style={iconBtn}>✏️</button>
                        <button onClick={() => deleteExample(ex.id)} style={iconBtn}>🗑</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      </div>

      {/* Add class modal */}
      {showAddClass && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: 28, width: 380, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>New Intent Class</div>
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="Class name (e.g. translation)" style={inputStyle} />
            <input value={newClassDesc} onChange={(e) => setNewClassDesc(e.target.value)} placeholder="Description" style={inputStyle} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 12, color: S.muted }}>Color</label>
              <input type="color" value={newClassColor} onChange={(e) => setNewClassColor(e.target.value)} style={{ width: 36, height: 28, border: "none", background: "none", cursor: "pointer" }} />
              <span style={{ fontSize: 12, color: S.muted }}>{newClassColor}</span>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddClass(false)} style={btnStyle(S.surface2, S.muted)}>Cancel</button>
              <button onClick={addClass} disabled={!newClassName.trim()} style={btnStyle("#1e1b3a", "#9484ff")}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = (bg: string, color: string) => ({
  background: bg, border: `1px solid ${color}44`, color, borderRadius: 7,
  padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  whiteSpace: "nowrap" as const,
});

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
  fontSize: 14, opacity: 0.5,
};

const inputStyle: React.CSSProperties = {
  background: "#1a1a1a", border: "1px solid #222", borderRadius: 7,
  color: "#e8e8e8", padding: "8px 12px", fontSize: 13, outline: "none",
  fontFamily: "inherit", width: "100%",
};
