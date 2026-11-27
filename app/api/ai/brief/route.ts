import { z } from "zod";
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

const body = z.object({ context: gardenContextSchema });

const SYSTEM = `You write the daily care brief shown at the top of Sproutly, a plant-care web app.
You receive the gardener's garden as JSON. The app has already worked out which tasks are due,
their order, and whether rain makes an outdoor watering skippable. Do not invent tasks, plants,
dates or weather that are not in the JSON.

Write 2-4 short sentences, plain text, no lists, no markdown, no greeting:
- Say how many tasks need attention today (Overdue + Due Today) and suggest a route that groups them by place.
- Mention an overdue task first if there is one.
- Only if a task has rainSkip=true, say rain is likely and that watering that plant can probably wait after checking the soil.
- If weather is present and notable for plants (heat >= 33°C, frost <= 2°C, very dry or very humid), add one practical tip.
- If nothing is due, say so warmly and name the next upcoming task.
Keep it under 70 words. Use the plant names exactly as given.`;

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid garden summary." }, { status: 400 });
  const context = parsed.data.context;
  const rules = ruleBrief(context);
  if (!aiEnabled()) return Response.json({ text: rules, source: "rules" });

  const who = await requester(request);
  if (rateLimited(who.key, who.limit))
    return Response.json({ text: rules, source: "rules", limited: true });

  try {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      ...fallbackParams(),
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (response.stop_reason === "refusal" || !text)
      return Response.json({ text: rules, source: "rules" });
    return Response.json({ text: text.slice(0, 800), source: "ai" });
  } catch (error) {
    console.error("AI brief failed:", error);
    return Response.json({
      text: rules,
      source: "rules",
      warning: aiErrorMessage(error),
    });
  }
}
