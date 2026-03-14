import { NextRequest } from "next/server";
import MemoryClient from "mem0ai";
import { getIntentModel } from "@/lib/intents";

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
const USER_ID = "intent-user";

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const json = await res.json();
  return json.data[0].embedding;
}

async function classifyIntent(message: string): Promise<{ intent: string; scores: { name: string; score: number }[] }> {
  const embedding = await embed(message);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data } = await supabase.rpc("match_intent", {
    query_embedding: embedding,
    match_count: 15,
  });

  const scores: Record<string, { total: number; count: number }> = {};
  for (const row of data ?? []) {
    if (!scores[row.class_name]) scores[row.class_name] = { total: 0, count: 0 };
    scores[row.class_name].total += row.similarity;
    scores[row.class_name].count += 1;
  }

  const ranked = Object.entries(scores)
    .map(([name, { total, count }]) => ({ name, score: total / count }))
    .sort((a, b) => b.score - a.score);

  return { intent: ranked[0]?.name ?? "reasoning", scores: ranked };
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const currentMessage = messages.at(-1)?.content as string;
  const encoder = new TextEncoder();

  // Classify intent and retrieve memories in parallel
  const classifyStart = Date.now();
  const [{ intent, scores }, memoriesResult] = await Promise.all([
    classifyIntent(currentMessage),
    (async () => {
      try {
        return await mem0.search(currentMessage, { userId: USER_ID, limit: 5 });
      } catch { return []; }
    })(),
  ]);
  const classifyMs = Date.now() - classifyStart;

  const model = getIntentModel(intent);
  const isImage = model === "gpt-image-1";

  // Save previous exchange to mem0
  const history = messages.slice(0, -1);
  if (history.length >= 2) {
    const lastAssistant = history.at(-1);
    const lastUser = history.at(-2);
    if (lastAssistant?.role === "assistant" && lastUser?.role === "user") {
      mem0.add([lastUser, lastAssistant], { userId: USER_ID }).catch(() => {});
    }
  }

  const memContext = Array.isArray(memoriesResult) && memoriesResult.length > 0
    ? memoriesResult.map((m: { memory?: string }) => m.memory ?? "").filter(Boolean).join("\n")
    : "";

  // ── Image generation ────────────────────────────────────────────────────────
  if (isImage) {
    const apiStart = Date.now();
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: currentMessage,
        n: 1,
        size: "1024x1024",
      }),
    });

    const apiMs = Date.now() - apiStart;

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: res.status });
    }

    const json = await res.json();
    const raw = json.data?.[0];
    // gpt-image-1 returns b64_json; wrap it as a data URL so <img> can render it
    const imageUrl = raw?.url
      ?? (raw?.b64_json ? `data:image/png;base64,${raw.b64_json}` : null);

    return new Response(
      JSON.stringify({
        type: "image",
        imageUrl,
        intent,
        scores,
        timing: { classifyMs, apiMs, mem0Ms: 0 },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Text streaming ──────────────────────────────────────────────────────────
  const apiMessages = [
    {
      role: "system",
      content: [
        "You are a helpful assistant with persistent memory.",
        memContext ? `Recalled context:\n${memContext}` : "",
      ].filter(Boolean).join("\n\n"),
    },
    ...messages.slice(-8),
  ];

  const apiStart = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages: apiMessages, stream: true }),
  });
  const apiMs = Date.now() - apiStart;

  if (!response.ok) {
    const errText = await response.text();
    let msg = "Request failed";
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
    return new Response(JSON.stringify({ error: msg }), { status: response.status });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Timing + intent metadata as first event
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ __meta: { intent, scores, timing: { classifyMs, apiMs, mem0Ms: 0 } } })}\n\n`
      ));

      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
