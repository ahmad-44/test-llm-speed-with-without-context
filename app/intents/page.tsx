"use client";

import { useEffect, useState, useRef } from "react";
import { getIntentColor } from "@/lib/intents";

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
          <span style={{ fontWeight: 700, fontSize: 15 }}>Intent Classes</span>
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
            classes.map((cls) => (
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
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: cls.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: selected === cls.name ? 600 : 400, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cls.name}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: S.faint, flexShrink: 0, marginLeft: 6 }}>
                  {exampleCount(cls.name)}
                </span>
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

          {/* Selected class examples */}
          {selected && selectedClass ? (
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <Badge name={selected} color={selectedClass.color} />
                <span style={{ fontSize: 13, color: S.muted }}>{selectedClass.description}</span>
                <button onClick={() => deleteClass(selected)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef444466", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                  Delete class
                </button>
              </div>

              {/* Add example */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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

              {/* Examples list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {examples.length === 0 && <div style={{ color: S.faint, fontSize: 13 }}>No examples yet.</div>}
                {examples.map((ex) => (
                  <div key={ex.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
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
          ) : (
            <div style={{ color: S.faint, fontSize: 14, textAlign: "center", marginTop: 60 }}>
              Select a class from the sidebar to manage its examples.
            </div>
          )}
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
