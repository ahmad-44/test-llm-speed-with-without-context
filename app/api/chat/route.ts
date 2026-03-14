import { NextRequest } from "next/server";
import MemoryClient from "mem0ai";

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
const USER_ID = "default-user";
const MODEL = "gpt-5.4-2026-03-05";

export async function POST(req: NextRequest) {
  const { messages, useContext } = await req.json();
  const encoder = new TextEncoder();

  let apiMessages: { role: string; content: string }[];
  let mem0Ms = 0;

  if (!useContext) {
    apiMessages = [messages.at(-1)];
  } else {
    const currentQuery = messages.at(-1)?.content as string;

    // Save previous exchange to mem0
    const history = messages.slice(0, -1);
    if (history.length >= 2) {
      const lastAssistant = history.at(-1);
      const lastUser = history.at(-2);
      if (lastAssistant?.role === "assistant" && lastUser?.role === "user") {
        mem0.add([lastUser, lastAssistant], { userId: USER_ID }).catch(() => {});
      }
    }

    // Search memories — timed
    let memContext = "";
    const mem0Start = Date.now();
    try {
      const memories = await mem0.search(currentQuery, { userId: USER_ID, limit: 8 });
      if (Array.isArray(memories) && memories.length > 0) {
        memContext = memories.map((m) => m.memory ?? "").filter(Boolean).join("\n");
      }
    } catch {}
    mem0Ms = Date.now() - mem0Start;

    apiMessages = [
      {
        role: "system",
        content: [
          "You are a helpful assistant with persistent memory.",
          memContext ? `Recalled memories from earlier in the conversation:\n${memContext}` : "",
        ].filter(Boolean).join("\n\n"),
      },
      ...messages.slice(-8),
    ];
  }

  // Call OpenAI — timed (measures server→OpenAI connect + TTFT on server side)
  const apiStart = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages: apiMessages, stream: true }),
  });
  const apiConnectMs = Date.now() - apiStart;

  if (!response.ok) {
    const errText = await response.text();
    let msg = "Request failed";
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
    return new Response(JSON.stringify({ error: msg }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream: inject timing event first, then pipe OpenAI SSE
  const stream = new ReadableStream({
    async start(controller) {
      // First event carries server-side timing
      const timingEvent = `data: ${JSON.stringify({
        __timing: { mem0_ms: mem0Ms, api_connect_ms: apiConnectMs },
      })}\n\n`;
      controller.enqueue(encoder.encode(timingEvent));

      // Pipe the rest of the OpenAI stream through
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
