import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

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

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  if (!message) return new Response(JSON.stringify({ error: "message required" }), { status: 400 });

  const embedding = await embed(message);

  const { data, error } = await supabase.rpc("match_intent", {
    query_embedding: embedding,
    match_count: 15,
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Aggregate scores per class
  const scores: Record<string, { total: number; count: number }> = {};
  for (const row of data ?? []) {
    if (!scores[row.class_name]) scores[row.class_name] = { total: 0, count: 0 };
    scores[row.class_name].total += row.similarity;
    scores[row.class_name].count += 1;
  }

  const ranked = Object.entries(scores)
    .map(([name, { total, count }]) => ({ name, score: total / count }))
    .sort((a, b) => b.score - a.score);

  return new Response(JSON.stringify({ intent: ranked[0]?.name ?? null, scores: ranked }), {
    headers: { "Content-Type": "application/json" },
  });
}
