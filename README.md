# LLM Speed & Intelligence Comparison Chat

A Next.js chat app that benchmarks OpenAI model speed, compares context strategies (mem0 vs no context), and routes messages to the best model using a real-time intent classifier powered by Supabase pgvector.

Live demo: [https://github.com/ahmad-44/test-llm-speed-with-without-context](https://github.com/ahmad-44/test-llm-speed-with-without-context)

---

## What It Does

Three chat tabs, each with a different strategy:

| Tab | Context | Intent Routing | Image Gen |
|-----|---------|----------------|-----------|
| **With Memory** | mem0 semantic memory | No | No |
| **No Context** | None (single message) | No | No |
| **Chat + Mem0 + Intent + Image Gen/Edit** | mem0 semantic memory | Yes | Yes |

Every message shows a **speed profiler table** — TTFT, Total, Tokens, Tok/s, Intent classification time, mem0 lookup time, API connect time, and the model used.

---

## Architecture

```
Browser (React)
    │
    ├── /api/chat             ← Tabs 1 & 2 (With Memory / No Context)
    │       ├── mem0.search() — semantic memory lookup
    │       ├── fetch OpenAI chat/completions (stream)
    │       └── SSE: __timing event → then raw OpenAI stream
    │
    └── /api/intent-chat      ← Tab 3 (Smart Chat)
            ├── parallel:
            │     ├── classifyIntent() — embed → Supabase match_intent RPC
            │     └── mem0.search()   — semantic memory lookup
            ├── getIntentModel(intent) — pick best model
            ├── if image intent:
            │     ├── image_generation → POST /v1/images/generations
            │     └── image_edit       → POST /v1/images/edits (uses prev image)
            └── else: fetch OpenAI chat/completions (stream)
                    SSE: __meta event (intent + scores + timing) → raw stream
```

### Intent Classification Pipeline

```
User message
    │
    ▼
text-embedding-3-small  (OpenAI, 1536-dim vector)
    │
    ▼
match_intent RPC  (Supabase pgvector, cosine similarity, top 15 results)
    │
    ▼
Aggregate by class  (average similarity score per class)
    │
    ▼
Ranked intent list  →  getIntentModel()  →  route to correct model
```

### Model Routing

| Intent | Model | Notes |
|--------|-------|-------|
| `image_generation` | `gpt-image-1` | Generates new image; returns `b64_json` |
| `image_edit` | `gpt-image-1` | Edits previous image in conversation |
| `reasoning` | `o3-mini` | Step-by-step analysis, math, logic |
| `low_effort` | `gpt-4o-mini` | Greetings, small talk, simple questions |
| everything else | `gpt-4o` | Code, documents, data, research, PDFs… |

### Memory (mem0)

- Stores previous `user + assistant` exchange at the start of each new request
- Searches for relevant past context using semantic similarity (not keyword matching)
- Retrieved memories are injected into the system prompt before the AI call
- Runs in parallel with intent classification in the Smart Chat tab

---

## Project Structure

```
chat/
├── app/
│   ├── page.tsx                  # Main chat UI — 3 tabs, profiler table
│   ├── explain/page.tsx          # /explain — profiler metrics docs (5th-grade level)
│   ├── intents/page.tsx          # /intents — intent admin panel
│   ├── api/
│   │   ├── chat/route.ts         # Tab 1 & 2 API — mem0 + OpenAI streaming
│   │   ├── intent-chat/route.ts  # Tab 3 API — classify + route + stream/image
│   │   └── intents/
│   │       ├── classify/route.ts # POST — classify a test message
│   │       ├── classes/route.ts  # GET/POST/DELETE — manage intent classes
│   │       ├── examples/route.ts # GET/POST/PUT/DELETE — manage examples (auto-embeds)
│   │       └── seed/route.ts     # POST — seed built-in examples; PUT — recompute all
│   └── globals.css
├── lib/
│   ├── intents.ts                # 15 intent class definitions, seed examples, model routing
│   └── supabase.ts               # Supabase client
├── supabase-setup.sql            # Database schema + match_intent RPC
└── .env.local                    # API keys (see setup below)
```

---

## Speed Profiler

Each message shows a row of metrics. Here's what they mean:

| Column | Source | Meaning |
|--------|--------|---------|
| **TTFT** | Browser | Time to first token — when the AI started typing |
| **Total** | Browser | Full response time from Send to last word |
| **Tokens** | Browser | Number of tokens streamed |
| **Tok/s** | Browser | Streaming speed = Tokens ÷ (Total − TTFT) |
| **Intent** | Server | Time to classify message (embed + vector search) |
| **mem0** | Server | Time to search semantic memory |
| **API** | Server | Time for OpenAI to pick up — connection wait only |
| **Model** | Server | Which model was chosen by the intent router |

**How they add up:**
```
TTFT  ≈  max(Intent, mem0) + API + network    ← Smart Chat (parallel)
TTFT  ≈  mem0 + API + network                 ← With Memory (sequential)
Total  =  TTFT + streaming time
Tok/s  =  Tokens ÷ streaming time
```

Full explanation at `/explain` in the running app.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/ahmad-44/test-llm-speed-with-without-context
cd chat
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
OPENAI_API_KEY=sk-...
MEM0_API_KEY=m0-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

| Variable | Where to get it |
|----------|----------------|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `MEM0_API_KEY` | [app.mem0.ai](https://app.mem0.ai) → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → service_role |

### 3. Set up Supabase

In your Supabase project, open the **SQL Editor** and run:

```sql
-- from supabase-setup.sql
create extension if not exists vector;

create table intent_classes (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  description text,
  color text default '#7c6af7',
  created_at timestamptz default now()
);

create table intent_examples (
  id uuid default gen_random_uuid() primary key,
  class_name text not null references intent_classes(name) on delete cascade,
  message text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index intent_examples_embedding_idx
  on intent_examples using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

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

Or just run the included file:

```bash
# paste contents of supabase-setup.sql into Supabase SQL editor
```

### 4. Seed intent examples

Start the dev server, then open `http://localhost:3000/intents` and click **Seed Examples**.

This populates all 15 intent classes with built-in training examples and computes their embeddings.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Intent Classes

15 built-in classes, each routed to the appropriate model or tool:

| Class | Color | Routed To |
|-------|-------|-----------|
| `audio_generation` | amber | gpt-4o |
| `code` | blue | gpt-4o |
| `document_edit` | purple | gpt-4o |
| `document_generation` | indigo | gpt-4o |
| `file_analysis` | cyan | gpt-4o |
| `generate_spreadsheet` | green | gpt-4o |
| `image_edit` | pink | gpt-image-1 (edits prev image) |
| `image_generation` | orange | gpt-image-1 (generates new) |
| `low_effort` | slate | gpt-4o-mini |
| `models_information` | violet | gpt-4o |
| `pdf_generation` | red | gpt-4o |
| `ppt_generation` | light orange | gpt-4o |
| `reasoning` | purple | o3-mini |
| `video_generation` | teal | gpt-4o |
| `web_surfing` | sky | gpt-4o |

---

## Managing Intents (`/intents`)

The admin panel at `/intents` lets you:

- **View all classes** and their example counts in the sidebar
- **Test classification** — type any message and see which intent wins + confidence scores
- **Add/edit/delete examples** — embeddings are computed automatically on save; no manual recompute needed
- **Seed Examples** — resets all built-in examples from `lib/intents.ts` (overwrites existing ones)
- **Recompute Embeddings** — re-embeds all existing examples without deleting (use after changing embedding model)
- **Add New Class** — create a custom intent with name, description, and color

**Tips:**
- Aim for 7–10+ diverse examples per class
- Write examples the way real users would type, not formal definitions
- Test edge cases — messages that could belong to multiple classes
- The `image_edit` intent only uses the edit endpoint if a generated image already exists in the conversation

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat` | Main chat — mem0 + OpenAI streaming |
| `POST` | `/api/intent-chat` | Smart chat — classify + route + stream or image |
| `POST` | `/api/intents/classify` | Classify a message, return ranked intent scores |
| `GET` | `/api/intents/classes` | List all intent classes with example counts |
| `POST` | `/api/intents/classes` | Create a new intent class |
| `DELETE` | `/api/intents/classes` | Delete a class and all its examples |
| `GET` | `/api/intents/examples?class=` | List examples for a class |
| `POST` | `/api/intents/examples` | Add example — auto-embeds immediately |
| `PUT` | `/api/intents/examples` | Edit example — re-embeds immediately |
| `DELETE` | `/api/intents/examples` | Delete an example |
| `POST` | `/api/intents/seed` | Seed all built-in examples with embeddings |
| `PUT` | `/api/intents/seed` | Recompute embeddings for all existing examples |

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main chat — 3 tabs with profiler |
| `/intents` | Intent admin panel |
| `/explain` | Plain-English docs for every profiler metric |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| UI | React 19, inline styles, dark theme |
| AI — Chat | OpenAI `gpt-4o`, `gpt-4o-mini`, `o3-mini` via SSE streaming |
| AI — Images | OpenAI `gpt-image-1` (generations + edits) |
| AI — Embeddings | OpenAI `text-embedding-3-small` (1536 dim) |
| Memory | mem0ai (semantic memory, cloud API) |
| Vector DB | Supabase pgvector (cosine similarity, IVFFlat index) |
| Streaming | Server-Sent Events piped directly from OpenAI |

---

## How Streaming Works

The server never buffers the full response. It:

1. Injects a single `__meta` SSE event as the first frame (intent, scores, timing)
2. Pipes the raw OpenAI SSE stream directly to the browser

The browser parses each `data:` line, skips `__meta`, and appends tokens to the message in real time. TTFT is stamped client-side when the first non-meta token arrives.

---

## Image Generation & Editing

- **Generation**: intent `image_generation` → `POST /v1/images/generations` with `gpt-image-1`
- **Editing**: intent `image_edit` + a previous image exists in conversation → `POST /v1/images/edits` with the previous image as multipart input
- `gpt-image-1` returns `b64_json` (not a URL). The server wraps it as `data:image/png;base64,...` before sending to the browser.

If you ask to edit an image but there's no previous image in the conversation, the system falls back to generating a new one.
