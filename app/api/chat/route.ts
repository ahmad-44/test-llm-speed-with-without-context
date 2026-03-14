import { NextRequest } from "next/server";
import MemoryClient from "mem0ai";

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
const USER_ID = "default-user";
const MODEL = "gpt-5.4-2026-03-05";

export async function POST(req: NextRequest) {
  const { messages, useContext } = await req.json();

  let apiMessages: { role: string; content: string }[];

  if (!useContext) {
    // ── No context mode: send only the current message ─────────────────────
    apiMessages = [messages.at(-1)];
  } else {
    // ── Memory mode: mem0 search + last 3 messages ──────────────────────────
    const currentQuery = messages.at(-1)?.content as string;

    // Save the previous complete exchange to mem0 (start of next request = full pair available)
    // Walk backwards to find the most recent user+assistant pair before the current user message
    const history = messages.slice(0, -1); // everything except current user msg
    if (history.length >= 2) {
      const lastAssistant = history.at(-1);
      const lastUser = history.at(-2);
      if (lastAssistant?.role === "assistant" && lastUser?.role === "user") {
        mem0.add([lastUser, lastAssistant], { userId: USER_ID }).catch(() => {});
      }
    }

    // Retrieve relevant memories
    let memContext = "";
    try {
      const memories = await mem0.search(currentQuery, { userId: USER_ID, limit: 8 });
      if (Array.isArray(memories) && memories.length > 0) {
        memContext = memories.map((m: { memory: string }) => m.memory).join("\n");
      }
    } catch {}

    apiMessages = [
      {
        role: "system",
        content: [
          "You are a helpful assistant with persistent memory.",
          memContext ? `Recalled memories from earlier in the conversation:\n${memContext}` : "",
        ].filter(Boolean).join("\n\n"),
      },
      ...messages.slice(-8), // wider window so recent context isn't lost
    ];
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages: apiMessages, stream: true }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = "Request failed";
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
    return new Response(JSON.stringify({ error: msg }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
