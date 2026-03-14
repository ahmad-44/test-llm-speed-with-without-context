import { supabase } from "@/lib/supabase";
import { INTENT_CLASSES, SEED_EXAMPLES } from "@/lib/intents";

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

// POST /api/intents/seed — seed all classes and examples
export async function POST() {
  // Upsert classes
  await supabase.from("intent_classes").upsert(
    INTENT_CLASSES.map((c) => ({ name: c.name, description: c.description, color: c.color })),
    { onConflict: "name" }
  );

  const results: Record<string, number> = {};

  for (const [className, messages] of Object.entries(SEED_EXAMPLES)) {
    // Delete existing examples for this class to avoid duplicates
    await supabase.from("intent_examples").delete().eq("class_name", className);

    // Embed in batches of 20
    const embeddings = await embedBatch(messages);
    const rows = messages.map((message, i) => ({
      class_name: className,
      message,
      embedding: embeddings[i],
    }));

    await supabase.from("intent_examples").insert(rows);
    results[className] = messages.length;
  }

  return new Response(JSON.stringify({ ok: true, seeded: results }), {
    headers: { "Content-Type": "application/json" },
  });
}

// POST /api/intents/seed?recompute=1 — recompute embeddings for existing examples
export async function PUT() {
  const { data: examples, error } = await supabase
    .from("intent_examples")
    .select("id, message");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const messages = examples!.map((e) => e.message);
  const embeddings = await embedBatch(messages);

  // Update in batches
  for (let i = 0; i < examples!.length; i++) {
    await supabase
      .from("intent_examples")
      .update({ embedding: embeddings[i] })
      .eq("id", examples![i].id);
  }

  return new Response(JSON.stringify({ ok: true, recomputed: examples!.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
