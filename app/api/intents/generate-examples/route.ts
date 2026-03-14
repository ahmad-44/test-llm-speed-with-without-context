import { supabase } from "@/lib/supabase";
import { INTENT_CLASSES } from "@/lib/intents";

export const maxDuration = 300;

async function generateBatch(className: string, description: string, batchSize: number, alreadyCount: number): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Generate exactly ${batchSize} diverse, realistic user messages for the intent "${className}" (${description}).

Rules:
- Each message must be unique and different from each other
- Vary phrasing, length, style (short/long, formal/casual, simple/detailed)
- Write messages the way a real user would type them naturally
- Do NOT number the messages
- This is batch #${Math.floor(alreadyCount / batchSize) + 1}, so vary phrasing from what might have been generated before

Return ONLY valid JSON: { "examples": ["message 1", "message 2", ...] }`,
        },
      ],
    }),
  });

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    const arr = parsed.examples ?? parsed.messages ?? Object.values(parsed)[0] ?? [];
    return (arr as string[]).slice(0, batchSize);
  } catch {
    return [];
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

// POST /api/intents/generate-examples — generate N examples for a class using AI
export async function POST(req: Request) {
  const { class_name, count = 500 } = await req.json();

  const cls = INTENT_CLASSES.find((c) => c.name === class_name);
  if (!cls) return Response.json({ error: "Class not found" }, { status: 404 });

  // Generate examples in batches of 100
  const batchSize = 100;
  const allExamples: string[] = [];

  for (let i = 0; i < count; i += batchSize) {
    const n = Math.min(batchSize, count - i);
    const batch = await generateBatch(cls.name, cls.description, n, i);
    allExamples.push(...batch);
  }

  if (allExamples.length === 0) {
    return Response.json({ error: "Failed to generate examples" }, { status: 500 });
  }

  // Embed in batches of 100
  const embeddings: number[][] = [];
  for (let i = 0; i < allExamples.length; i += 100) {
    const slice = allExamples.slice(i, i + 100);
    const batchEmbeddings = await embedBatch(slice);
    embeddings.push(...batchEmbeddings);
  }

  const rows = allExamples.map((message, i) => ({
    class_name,
    message,
    embedding: embeddings[i],
  }));

  const { error } = await supabase
    .from("intent_examples")
    .insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, generated: rows.length });
}
