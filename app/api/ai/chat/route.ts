import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  aiEnabled,
  aiErrorMessage,
  anthropic,
  fallbackParams,
  MODEL,
  rateLimited,
  requester,
} from "@/lib/server/ai";
import { gardenContextSchema, ruleBrief } from "@/lib/ai-context";

const body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30)
    .refine((m) => m[0].role === "user" && m.at(-1)!.role === "user", {
      message: "Conversation must start and end with the gardener.",
    }),
  context: gardenContextSchema,
});

const SYSTEM = `You are Sprout, the plant-care assistant inside Sproutly, a web app where people track their plants, care routines, a 3D home and local weather.

How to answer:
- You are given the gardener's current garden as JSON (plants, tasks due in the next 7 days, recent care and today's weather). Use it to make answers specific: name their plants, places and due dates.
- Be practical and brief: usually 2-6 sentences or a short list. Use simple markdown (bold, short bullet lists) only when it helps.
- Due dates, task status and rain-skip eligibility in the JSON are authoritative. Don't invent plants, tasks or weather. If something isn't in the data, say so.
- You can't change data yourself. To act, point to the app: "Care tasks" to complete or skip, a plant's page to add a routine, "Add plant", "Weather", "Growth journal", the 3D "Home".
- For pests, disease or yellowing leaves, ask one clarifying question if needed, then give the most likely causes and what to check first.
- Plant safety for pets and children: be careful and recommend checking a reliable source if unsure.
- Politely steer unrelated requests back to plants and gardening.`;

const text = (s: string, init?: ResponseInit) =>
  new Response(s, {
    ...init,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 },
    );
  const { messages, context } = parsed.data;

  if (!aiEnabled())
    return text(
      `The AI assistant isn’t connected on this server yet (add ANTHROPIC_API_KEY to enable it). Here’s today’s plan from your schedule instead:\n\n${ruleBrief(context)}`,
      { headers: { "X-Sproutly-Source": "rules" } },
    );

  const who = await requester(request);
  if (rateLimited(who.key, who.limit))
    return Response.json(
      {
        error:
          "You’ve reached the assistant limit for now. Try again in a few minutes.",
      },
      { status: 429 },
    );

  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    ...fallbackParams(),
    output_config: { effort: "low" },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: `Garden data (JSON):\n${JSON.stringify(context)}` },
    ],
    messages: messages as Anthropic.Beta.BetaMessageParam[],
  });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
      stream
        .finalMessage()
        .then((final) => {
          if (final.stop_reason === "refusal")
            controller.enqueue(
              encoder.encode("\n\nSorry — I can’t help with that one."),
            );
          else if (final.stop_reason === "max_tokens")
            controller.enqueue(encoder.encode("…"));
        })
        .catch((error) => {
          console.error("AI chat failed:", error);
          controller.enqueue(encoder.encode(`\n\n⚠️ ${aiErrorMessage(error)}`));
        })
        .finally(() => controller.close());
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body$, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Sproutly-Source": "ai",
    },
  });
}
