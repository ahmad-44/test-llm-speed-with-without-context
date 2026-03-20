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

// GET examples for a class
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const className = searchParams.get("class");

  let query = supabase
    .from("intent_examples")
    .select("id, class_name, message, created_at")
    .order("created_at", { ascending: true });

  if (className) query = query.eq("class_name", className);

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

// POST — add a new example (auto-embeds)
export async function POST(req: NextRequest) {
  const { class_name, message } = await req.json();
  const embedding = await embed(message);

  const { data, error } = await supabase
    .from("intent_examples")
    .insert({ class_name, message, embedding })
    .select("id, class_name, message, created_at")
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

// PUT — update message and re-embed
export async function PUT(req: NextRequest) {
  const { id, message } = await req.json();
  const embedding = await embed(message);

  const { data, error } = await supabase
    .from("intent_examples")
    .update({ message, embedding })
    .eq("id", id)
    .select("id, class_name, message, created_at")
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await supabase.from("intent_examples").delete().eq("id", id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }));
}
