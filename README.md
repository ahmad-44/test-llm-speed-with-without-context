# LLM Speed & Intelligence Comparison Chat

A Next.js chat application that benchmarks OpenAI model speed, compares context strategies (mem0 semantic memory vs no context), and routes every message to the most appropriate model using a real-time intent classifier powered by Supabase pgvector embeddings.

**Repository:** https://github.com/ahmad-44/test-llm-speed-with-without-context

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture Overview](#architecture-overview)
3. [Intent Classification Pipeline](#intent-classification-pipeline)
4. [Model Routing](#model-routing)
5. [Memory System (mem0)](#memory-system-mem0)
6. [Streaming Architecture](#streaming-architecture)
7. [Speed Profiler](#speed-profiler)
8. [Image Generation & Editing](#image-generation--editing)
9. [Project Structure](#project-structure)
10. [Setup Guide](#setup-guide)
11. [Intent Classes Reference](#intent-classes-reference)
12. [Managing Intents (/intents)](#managing-intents-intents)
13. [API Routes](#api-routes)
14. [Pages](#pages)
15. [Tech Stack](#tech-stack)

---

## What It Does

Three chat tabs, each testing a different strategy for speed and intelligence:

| Tab | Context Strategy | Intent Routing | Image Support |
|-----|-----------------|----------------|---------------|
| **With Memory** | mem0 semantic memory — retrieves relevant past context | No — always uses same model | No |
| **No Context** | None — sends only the current message | No | No |
| **Chat + Mem0 + Intent + Image Gen/Edit** | mem0 + intent-aware routing | Yes — picks best model per message | Yes — generate & edit |

Every AI response shows a **speed profiler table** below it with 8 metrics: TTFT, Total, Tokens, Tok/s, Intent classification time, mem0 lookup time, API connect time, and the model used.

---

## Architecture Overview

```
Browser (React)
    │
    ├── /api/chat                    ← Tabs 1 & 2 (With Memory / No Context)
    │       ├── [With Memory only] mem0.search() — semantic memory lookup
    │       ├── fetch OpenAI /v1/chat/completions (SSE stream)
    │       └── SSE output: __timing event first → raw OpenAI stream
    │
    └── /api/intent-chat             ← Tab 3 (Smart Chat)
            │
            ├── Promise.all — runs in parallel:
            │     ├── classifyIntent()
            │     │     ├── OpenAI text-embedding-3-small (embed message)
            │     │     └── Supabase match_intent RPC (cosine similarity, top 15)
            │     └── mem0.search() — semantic memory lookup
            │
            ├── getIntentModel(intent) → { model, extraParams }
            │
            ├── [image intent]
            │     ├── image_generation → POST /v1/images/generations
            │     └── image_edit + prev image exists → POST /v1/images/edits
            │           └── prev image (b64 data URL) → Buffer → FormData
            │
            └── [text intent]
                  ├── Build system prompt (+ capability details if models_information)
                  ├── Inject mem0 recalled context into system prompt
                  ├── Send ONLY current message (no raw history — mem0 handles context)
                  ├── fetch OpenAI /v1/chat/completions (SSE stream, + extraParams)
                  └── SSE output: __meta event first → raw OpenAI stream
```

---

## Intent Classification Pipeline

Every message sent to the Smart Chat tab goes through this pipeline before any AI model is called:

```
User message
    │
    ▼
1. EMBED
   OpenAI text-embedding-3-small
   → 1536-dimensional float vector representing the semantic meaning
    │
    ▼
2. SEARCH
   Supabase match_intent RPC (pgvector)
   → cosine similarity against all stored example embeddings
   → returns top 15 most similar examples across all classes
    │
    ▼
3. AGGREGATE
   Group results by class_name
   → compute average similarity score per class
   → sort descending
    │
    ▼
4. ROUTE
   Top class = detected intent
   getIntentModel(intent) → { model, extraParams }
   → call the correct OpenAI endpoint
```

**This runs in parallel with the mem0 memory search**, so neither blocks the other. Total pre-call overhead = `max(classifyMs, mem0Ms)`, not the sum.

---

## Model Routing

The intent classifier automatically selects the most appropriate model for each message:

| Intent | Model | Extra Parameters | Notes |
|--------|-------|-----------------|-------|
| `image_generation` | `gpt-image-1` | — | Generates new image from text prompt |
| `image_edit` | `gpt-image-1` | — | Edits the last generated image in the conversation |
| `reasoning` | `gpt-5.4-2026-03-05` | `reasoning_effort: "high"` | Complex analysis, math, step-by-step logic |
| `low_effort` | `gpt-5.4-2026-03-05` | `reasoning_effort: "low"` | Greetings, small talk, simple questions |
| `models_information` | `gpt-5.4-2026-03-05` | — | Questions about AI models and capabilities |
| everything else | `gpt-4o` | — | Code, documents, data, research, PDFs, etc. |

**`reasoning_effort`** is a native OpenAI parameter on `gpt-5.4-2026-03-05`. Setting it to `"high"` enables deeper chain-of-thought reasoning; `"low"` gives faster, lighter responses. Both use the same model — the parameter controls how much compute the model spends thinking.

### System Prompt Injection

For `models_information` intent only, the system prompt includes the full capability description so the model can accurately describe itself:
- Current model and reasoning_effort
- All 15 intent classes and their routing
- mem0 memory system
- Image generation and editing capabilities

For all other intents, only a lean one-line identity is injected to avoid wasted tokens.

---

## Memory System (mem0)

mem0 provides **semantic long-term memory** — not a raw chat history dump, but intelligent retrieval of relevant past context.

**How it works:**

1. **Storage** — At the start of each request, the previous `user + assistant` exchange is saved to mem0 asynchronously (fire and forget, does not block the response)
2. **Retrieval** — mem0 searches all stored memories for the current message using semantic similarity, returns the top 5 most relevant memories. **Skipped on the first message** — nothing is stored yet so the search would be wasted latency.
3. **Injection** — Retrieved memories are formatted as `Recalled context:` in the system prompt before the AI call

**Key difference vs naive full-history sending:**

| Approach | What gets sent | Token cost | TTFT over time |
|----------|---------------|------------|----------------|
| Raw history (`messages.slice(-N)`) | Every past message in a window | Grows each turn | Gets slower with every message |
| mem0 (Smart Chat) | Only semantically relevant memories | Stays flat | Consistent regardless of conversation length |

**Smart Chat sends only the current message to the API** — no raw conversation history at all. The system prompt contains only the mem0-recalled context (top 5 relevant memories). This means TTFT is the same on message 1 as it is on message 50.

**In Smart Chat:** mem0 search runs in parallel with intent classification, so it adds zero extra latency (both complete before the AI call starts).

---

## Streaming Architecture

The server **never buffers** the full response. The flow is:

```
Server                                    Browser
  │                                          │
  ├─ inject __meta SSE event ───────────────►│ parse intent/scores/timing
  │   { intent, scores, timing }             │
  │                                          │
  ├─ pipe OpenAI SSE stream ────────────────►│ parse each data: line
  │   data: {"choices":[{"delta":...}]}      │ append token to message
  │   data: {"choices":[{"delta":...}]}      │ stamp TTFT on first token
  │   ...                                    │
  └─ data: [DONE] ──────────────────────────►│ finalize, compute Tok/s
```

**Why this matters for speed:** The browser sees the first token as soon as OpenAI starts streaming — there is no intermediate buffering or processing delay on the server side after the stream opens.

**`__meta` event** (Smart Chat) and **`__timing` event** (With Memory) are injected as the very first SSE frame before any content tokens. The browser detects these by checking for `__meta` or `__timing` keys and uses them to populate the profiler table without treating them as message content.

---

## Speed Profiler

Every message in every tab shows a profiler row with 8 columns:

| Column | Measured By | What It Measures |
|--------|------------|-----------------|
| **TTFT** | Browser | Time from Send to first token appearing on screen |
| **Total** | Browser | Time from Send to the last token (full response done) |
| **Tokens** | Browser | Count of tokens streamed (each SSE delta = 1 token) |
| **Tok/s** | Browser | `Tokens ÷ (Total − TTFT)` — pure streaming throughput |
| **Intent** | Server | Time to embed + pgvector search (Smart Chat only) |
| **mem0** | Server | Time for mem0.search() to return (parallel with Intent) |
| **API** | Server | Time from calling OpenAI to the stream opening — connection wait only, NOT content delivery |
| **Model** | Server | The model that was used (Smart Chat only) |

**How the numbers relate:**

```
Smart Chat:   TTFT ≈ max(Intent, mem0) + API + network   ← parallel pre-call
With Memory:  TTFT ≈ mem0 + API + network                ← sequential pre-call
No Context:   TTFT ≈ API + network                       ← no pre-call overhead

Total          = TTFT + streaming time
Streaming time = Total − TTFT
Tok/s          = Tokens ÷ Streaming time
```

> **Important:** API time is NOT the full answer time. It measures only the connection wait — from when the server called OpenAI to when OpenAI started sending back data. The actual words streaming to your screen are captured by Total and Tok/s.

Full plain-English explanation available at `/explain` in the running app.

---

## Image Generation & Editing

### Generation (`image_generation` intent)

```
POST /v1/images/generations
  model: gpt-image-1
  prompt: <user message>
  n: 1
  size: 1024x1024
```

### Editing (`image_edit` intent)

When the intent is `image_edit` **and** a previously generated image exists in the conversation, the system uses the edit endpoint instead of generation:

```
POST /v1/images/edits   (multipart/form-data)
  model: gpt-image-1
  prompt: <user message>
  image: <previous image as PNG file>
  n: 1
  size: 1024x1024
```

The previous image is looked up by scanning backward through the conversation for the most recent assistant message with an `imageUrl`. The data URL (`data:image/png;base64,...`) is decoded to a `Buffer`, wrapped in a `Blob`, and sent as `multipart/form-data`.

**Fallback:** If `image_edit` intent is detected but no previous image exists, it falls back to generation automatically.

### b64_json handling

`gpt-image-1` returns `b64_json` (raw base64), not a URL. The server wraps it before sending to the browser:

```ts
const imageUrl = raw?.url
  ?? (raw?.b64_json ? `data:image/png;base64,${raw.b64_json}` : null);
```

This produces a valid `data:` URL that `<img src>` can render directly.

---

## Project Structure

```
chat/
├── app/
│   ├── page.tsx                   # Main chat UI
│   │                              #   - 3 tabs: With Memory, No Context, Smart Chat
│   │                              #   - Tab, ChatPanel, IntentChatPanel components
│   │                              #   - ProfileTable with 8 profiler columns
│   │                              #   - IntentBadge with hover confidence scores
│   │                              #   - sendContext / sendBare / sendIntent handlers
│   │
│   ├── explain/page.tsx           # /explain — profiler metrics documentation
│   │                              #   - Timeline diagram of a full request
│   │                              #   - Per-metric cards with analogy + formula
│   │                              #   - Formulas showing how numbers relate
│   │
│   ├── intents/page.tsx           # /intents — intent admin panel
│   │                              #   - Sidebar: all classes with model badges
│   │                              #   - Test Classification panel
│   │                              #   - Examples CRUD (add/edit/delete, auto-embeds)
│   │                              #   - Seed / Recompute / Add Class buttons
│   │                              #   - IntentDocs: full usage documentation
│   │
│   ├── api/
│   │   ├── chat/route.ts          # POST /api/chat
│   │   │                          #   Tabs 1 & 2: mem0 lookup → OpenAI stream
│   │   │                          #   Emits __timing SSE event as first frame
│   │   │
│   │   ├── intent-chat/route.ts   # POST /api/intent-chat
│   │   │                          #   Tab 3: parallel classify + mem0
│   │   │                          #   → route to model → stream or image JSON
│   │   │                          #   Emits __meta SSE event as first frame
│   │   │
│   │   └── intents/
│   │       ├── classify/route.ts  # POST — embed + match_intent + aggregate
│   │       ├── classes/route.ts   # GET/POST/DELETE — intent class CRUD
│   │       ├── examples/route.ts  # GET/POST/PUT/DELETE — example CRUD
│   │       │                      #   POST: auto-embeds on add
│   │       │                      #   PUT:  re-embeds on edit
│   │       └── seed/route.ts      # POST — seed all 15 built-in classes + examples
│   │                              # PUT  — recompute all embeddings in-place
│   └── globals.css
│
├── lib/
│   ├── intents.ts                 # INTENT_CLASSES: 15 class definitions with colors
│   │                              # SEED_EXAMPLES: 7+ training examples per class
│   │                              # getIntentColor(name) → hex color
│   │                              # getIntentModel(name) → { model, extraParams? }
│   └── supabase.ts                # Supabase client (service role key)
│
├── supabase-setup.sql             # Full DB schema + match_intent RPC function
└── .env.local                     # Secret keys (never committed)
```

---

## Setup Guide

### 1. Clone and install

```bash
git clone https://github.com/ahmad-44/test-llm-speed-with-without-context
cd chat
npm install
```

### 2. Environment variables

Create `.env.local` in the `chat/` directory:

```env
OPENAI_API_KEY=sk-...
MEM0_API_KEY=m0-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

| Variable | Where to get it |
|----------|----------------|
| `OPENAI_API_KEY` | platform.openai.com → API Keys |
| `MEM0_API_KEY` | app.mem0.ai → Settings → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → service_role secret |

### 3. Set up Supabase database

In your Supabase project, go to **SQL Editor** and run the contents of `supabase-setup.sql`:

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Intent classes table
create table if not exists intent_classes (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  description text,
  color text default '#7c6af7',
  created_at timestamptz default now()
);

-- Intent examples table with 1536-dim embeddings
create table if not exists intent_examples (
  id uuid default gen_random_uuid() primary key,
  class_name text not null references intent_classes(name) on delete cascade,
  message text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- IVFFlat index for fast cosine similarity search
create index if not exists intent_examples_embedding_idx
  on intent_examples using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Similarity search function used by the classifier
create or replace function match_intent(
  query_embedding vector(1536),
  match_count int default 10
)
returns table (class_name text, message text, similarity float)
language sql stable as $$
  select class_name, message,
         1 - (embedding <=> query_embedding) as similarity
  from intent_examples
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### 4. Seed intent examples

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000/intents` and click **Seed Examples**.

This calls `POST /api/intents/seed` which:
1. Upserts all 15 intent classes into `intent_classes`
2. Deletes any existing examples for those classes
3. Embeds all seed examples using `text-embedding-3-small`
4. Inserts them into `intent_examples` with their vectors

You only need to do this once. After that, the classifier works immediately.

### 5. Start the app

```bash
npm run dev     # development
npm run build   # production build
npm start       # production server
```

Open `http://localhost:3000`.

---

## Intent Classes Reference

15 built-in intent classes with their routing:

| Class | Color | Model | reasoning_effort |
|-------|-------|-------|-----------------|
| `audio_generation` | amber `#f59e0b` | gpt-4o | — |
| `code` | blue `#3b82f6` | gpt-4o | — |
| `document_edit` | purple `#8b5cf6` | gpt-4o | — |
| `document_generation` | indigo `#6366f1` | gpt-4o | — |
| `file_analysis` | cyan `#06b6d4` | gpt-4o | — |
| `generate_spreadsheet` | green `#22c55e` | gpt-4o | — |
| `image_edit` | pink `#ec4899` | gpt-image-1 | — |
| `image_generation` | orange `#f97316` | gpt-image-1 | — |
| `low_effort` | slate `#94a3b8` | gpt-5.4-2026-03-05 | `low` |
| `models_information` | violet `#a855f7` | gpt-5.4-2026-03-05 | — |
| `pdf_generation` | red `#ef4444` | gpt-4o | — |
| `ppt_generation` | light orange `#fb923c` | gpt-4o | — |
| `reasoning` | purple `#7c6af7` | gpt-5.4-2026-03-05 | `high` |
| `video_generation` | teal `#14b8a6` | gpt-4o | — |
| `web_surfing` | sky `#0ea5e9` | gpt-4o | — |

To add your own classes, use the `/intents` admin panel or add entries to `lib/intents.ts` and re-seed.

---

## Managing Intents (`/intents`)

The admin panel gives full control over the intent classifier.

### Sidebar

Lists all classes with:
- Color dot
- Class name
- **Model badge** — shows which model + reasoning_effort the class routes to
- Example count

Click any class to load its examples in the main panel.

### Test Classification

Type any message and hit **Classify** to see:
- Top matched intent (with model badge)
- Confidence percentage
- Score breakdown for top 8 classes

Use this to verify your examples are working correctly before using the chat.

### Example Management

When a class is selected:

- **Add example** — type a message and press Enter or click `+ Add`. The embedding is computed immediately via `text-embedding-3-small`. No manual recompute needed.
- **Edit example** — click ✏️, change the text, press Enter or Save. Re-embeds automatically.
- **Delete example** — click 🗑. Removes from the vector index immediately.

> **Auto-embedding:** Every add and edit triggers an immediate embedding call. You never need to recompute after individual changes.

### Header Buttons

| Button | What it does |
|--------|-------------|
| **Seed Examples** | Wipes and re-inserts all built-in examples from `lib/intents.ts` with fresh embeddings. Use to reset to defaults. Warning: overwrites manual examples for seeded classes. |
| **↺ Recompute Embeddings** | Re-embeds every existing example in the database without deleting anything. Use if you change the embedding model or notice drift. |
| **+ New Class** | Creates a new intent class with name, description, and color. Add 7+ examples before using it in chat. |

### Built-in Documentation

When no class is selected, the main panel shows full documentation including:
- 4-step pipeline diagram (Embed → Search → Aggregate → Route)
- Model routing table
- Auto-embedding explanation
- Tips for writing good examples
- All 15 built-in classes as a reference

---

## API Routes

### Chat

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat` | Tabs 1 & 2 — mem0 lookup + OpenAI SSE stream. Body: `{ messages }`. Emits `__timing` as first SSE event. |
| `POST` | `/api/intent-chat` | Tab 3 — parallel classify + mem0, model routing, SSE stream or image JSON. Body: `{ messages }`. Emits `__meta` as first SSE event. |

### Intent Management

| Method | Route | Body / Query | Description |
|--------|-------|-------------|-------------|
| `POST` | `/api/intents/classify` | `{ message }` | Embed message, run match_intent, return ranked intent scores |
| `GET` | `/api/intents/classes` | — | List all classes with example counts |
| `POST` | `/api/intents/classes` | `{ name, description, color }` | Create a new class |
| `DELETE` | `/api/intents/classes` | `{ name }` | Delete class and all its examples |
| `GET` | `/api/intents/examples` | `?class=<name>` | List all examples for a class |
| `POST` | `/api/intents/examples` | `{ class_name, message }` | Add example — embeds immediately |
| `PUT` | `/api/intents/examples` | `{ id, message }` | Edit example — re-embeds immediately |
| `DELETE` | `/api/intents/examples` | `{ id }` | Delete an example |
| `POST` | `/api/intents/seed` | — | Seed all 15 built-in classes + examples |
| `PUT` | `/api/intents/seed` | — | Recompute embeddings for all existing examples |

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main chat — 3 tabs, per-message speed profiler |
| `/intents` | Intent classifier admin — class management, testing, docs |
| `/explain` | Plain-English explanation of every profiler metric |

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Framework | Next.js 16 | App Router, TypeScript, no edge runtime (mem0 requires Node.js) |
| UI | React 19 | Inline styles, dark theme, no UI library |
| AI — Chat | OpenAI Chat API | `gpt-5.4-2026-03-05`, `gpt-4o` via SSE streaming |
| AI — Reasoning | OpenAI Chat API | `gpt-5.4-2026-03-05` + `reasoning_effort: "high"` |
| AI — Images | OpenAI Images API | `gpt-image-1` — generations + edits, returns `b64_json` |
| AI — Embeddings | OpenAI Embeddings API | `text-embedding-3-small`, 1536 dimensions |
| Memory | mem0ai v2 | Semantic memory, cloud API, parallel search |
| Vector DB | Supabase pgvector | Cosine similarity, IVFFlat index (lists=100) |
| Streaming | SSE | Server pipes OpenAI stream directly; injects one metadata frame first |
| Deployment | Vercel | Standard Next.js deployment, env vars set in dashboard |
