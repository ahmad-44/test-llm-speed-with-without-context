export default function ExplainPage() {
  return (
    <div style={{
      minHeight: "100dvh", background: "#0f0f0f", color: "#e8e8e8",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Back */}
        <a href="/" style={{ color: "#555", fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 32 }}>
          ← back to chat
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#fff" }}>
          What do those numbers mean?
        </h1>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 40, marginTop: 0 }}>
          Every time the AI replies, you see a row of numbers. Here's what each one actually means — no tech speak.
        </p>

        {/* Timeline visual */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "24px 20px", marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            What happens when you hit Send
          </div>

          <div style={{ position: "relative" }}>
            {/* Timeline line */}
            <div style={{ position: "absolute", left: 10, top: 20, bottom: 20, width: 2, background: "#222" }} />

            {[
              { icon: "📤", color: "#7c6af7", label: "You hit Send", sub: "The clock starts here", time: "0ms" },
              { icon: "🧠", color: "#2ea87e", label: "App searches your memory (mem0)", sub: "Looks up relevant things you've said before", time: "mem0" },
              { icon: "📡", color: "#e5a64b", label: "Server calls OpenAI", sub: "Connects and waits for OpenAI to pick up", time: "API" },
              { icon: "💬", color: "#7c6af7", label: "First word arrives", sub: "The AI starts typing — you see the first character", time: "TTFT" },
              { icon: "⏳", color: "#888", label: "Words keep streaming in...", sub: "Tokens arrive one by one", time: "Tok/s" },
              { icon: "✅", color: "#2ea87e", label: "Last word arrives", sub: "The full reply is done", time: "Total" },
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: i < 5 ? 20 : 0, paddingLeft: 4 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", background: step.color + "22",
                  border: `2px solid ${step.color}`, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, flexShrink: 0, zIndex: 1,
                  marginTop: 2,
                }}>
                  {step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#e8e8e8" }}>{step.label}</span>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: step.color, background: step.color + "18", padding: "1px 8px", borderRadius: 4 }}>
                      {step.time}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{step.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metric cards */}
        {[
          {
            label: "TTFT",
            color: "#7c6af7",
            full: "Time to First Token",
            source: "measured by your browser",
            simple: "How long until the AI started typing.",
            analogy: "You texted your friend a question. TTFT is how long until you saw the three dots appear — not the full reply, just the moment they started writing back.",
            formula: "When first word appeared − when you hit Send",
            good: "Lower is better. Under 1s feels instant.",
          },
          {
            label: "Total",
            color: "#7c6af7",
            full: "Total Response Time",
            source: "measured by your browser",
            simple: "How long the entire reply took from start to finish.",
            analogy: "TTFT is when the pizza delivery guy knocked on your door. Total is when you finished eating the whole pizza.",
            formula: "When last word appeared − when you hit Send",
            good: "Lower is better. Depends on how long the reply is.",
          },
          {
            label: "Tokens",
            color: "#888",
            full: "Token Count",
            source: "counted by your browser",
            simple: "How many word-pieces the AI sent.",
            analogy: "AI doesn't think in full words — it thinks in small chunks called tokens. The word 'hamburger' might be 2 tokens: 'ham' + 'burger'. Tokens is just how many of those chunks arrived.",
            formula: "Count of each streamed piece",
            good: "More tokens = longer reply. Not good or bad on its own.",
          },
          {
            label: "Tok/s",
            color: "#888",
            full: "Tokens Per Second",
            source: "calculated by your browser",
            simple: "How fast the AI was typing once it started.",
            analogy: "A fast typist does 80 words per minute. Tok/s is the AI's typing speed — but in tokens, not words. Higher means the words appeared faster on your screen.",
            formula: "Tokens ÷ (Total − TTFT)",
            good: "Higher is better. Measures pure streaming speed.",
          },
          {
            label: "mem0",
            color: "#2ea87e",
            full: "Memory Search Time",
            source: "measured on the server",
            simple: "How long it took to look up things you've talked about before.",
            analogy: "Before answering your question, a helper checks a notebook of everything you've discussed in past chats. mem0 is how long it took to flip through that notebook and find the relevant bits.",
            formula: "Time mem0.search() took on the server",
            good: "This adds to TTFT. Worth it if it gives the AI better context.",
          },
          {
            label: "API",
            color: "#e5a64b",
            full: "OpenAI Connect Time",
            source: "measured on the server",
            simple: "How long it took to reach OpenAI and for them to start responding.",
            analogy: "You called customer support. API time is how long the phone rang before someone picked up — NOT how long the conversation lasted. It's just the connection wait.",
            formula: "Time from calling OpenAI to stream opening",
            good: "This is mostly OpenAI's server speed. You can't control it.",
          },
        ].map((metric) => (
          <div key={metric.label} style={{ marginBottom: 20, border: "1px solid #1e1e1e", borderRadius: 10, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "12px 16px", background: "#111", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e1e1e" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: metric.color }}>
                {metric.label}
              </span>
              <span style={{ color: "#777", fontSize: 13 }}>{metric.full}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#444", background: "#1a1a1a", border: "1px solid #2a2a2a", padding: "1px 8px", borderRadius: 4 }}>
                {metric.source}
              </span>
            </div>

            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Simple explanation */}
              <div style={{ fontSize: 15, color: "#ccc", fontWeight: 500 }}>
                {metric.simple}
              </div>

              {/* Analogy */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderLeft: `3px solid ${metric.color}`, borderRadius: "0 6px 6px 0", padding: "10px 14px", fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                💡 {metric.analogy}
              </div>

              {/* Formula */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>Formula:</span>
                <code style={{ fontSize: 12, color: "#666", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 8px" }}>
                  {metric.formula}
                </code>
              </div>

              {/* What's good */}
              <div style={{ fontSize: 12, color: "#555" }}>
                📊 {metric.good}
              </div>
            </div>
          </div>
        ))}

        {/* API clarification callout */}
        <div style={{ background: "#1a1200", border: "1px solid #3a2800", borderRadius: 10, padding: "16px 18px", marginBottom: 40 }}>
          <div style={{ fontWeight: 600, color: "#e5a64b", marginBottom: 6, fontSize: 14 }}>
            ⚠️ API time is NOT the full answer time
          </div>
          <p style={{ fontSize: 13, color: "#888", margin: 0, lineHeight: 1.7 }}>
            A common confusion: <strong style={{ color: "#ccc" }}>API time only measures the connection wait</strong> — from when our server called OpenAI to when OpenAI started sending back data. The actual words streaming to your screen are measured by <strong style={{ color: "#7c6af7" }}>Total</strong> and <strong style={{ color: "#888" }}>Tok/s</strong>. Think of API as the loading spinner before the content appears.
          </p>
        </div>

        {/* How they add up */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "20px", marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
            How the numbers relate
          </div>
          {[
            { formula: "TTFT  ≈  mem0 + API + network overhead", color: "#7c6af7" },
            { formula: "Total  =  TTFT + streaming time", color: "#7c6af7" },
            { formula: "Streaming time  =  Total − TTFT", color: "#888" },
            { formula: "Tok/s  =  Tokens ÷ Streaming time", color: "#888" },
          ].map((row) => (
            <div key={row.formula} style={{ fontFamily: "monospace", fontSize: 13, color: row.color, marginBottom: 8, paddingLeft: 8, borderLeft: `2px solid ${row.color}33` }}>
              {row.formula}
            </div>
          ))}
        </div>

        <a href="/" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← back to chat</a>
      </div>
    </div>
  );
}
