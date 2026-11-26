import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  aiEnabled,
  aiErrorMessage,
  anthropic,
  fallbackParams,
  MODEL,
  rateLimited,
  requester,
  tooMany,
} from "@/lib/server/ai";
import {
  lookupPlant,
  plantProfileSchema,
  tidyProfile,
} from "@/lib/plant-guide";

const body = z.object({
  name: z.string().trim().min(2).max(100),
  categories: z.array(z.string().max(80)).max(50).default([]),
});

const SYSTEM = `You are the horticulture assistant inside Sproutly, a plant-care web app.
Given the name a gardener typed when adding a plant, return a practical care profile.

Rules:
- Identify the most likely plant. The name may be a nickname ("my kitchen basil"), a local name (e.g. Urdu/Hindi "tulsi", "gulab") or a scientific name.
- category must be exactly one of the provided categories, or "" if none fits.
- environment: "outdoor" only if the plant is normally grown outside and exposed to rain; otherwise "indoor".
- sunlight: Full (6+ h direct sun), Partial (some direct sun), Indirect (bright, no direct sun) or Low light.
- watering / fertilizing: one or two short, concrete sentences each (how to tell it needs care, seasonal changes).
- description: one or two plain sentences about the plant.
- water_every_days: a typical starting interval for a potted plant in warm-season conditions (integer, 1-60).
- fertilize_every_days: typical interval in the growing season (integer, 7-365), or null if it rarely needs feeding.
- If the name is not a plant, still return your best guess and keep notes generic.`;

export async function GET() {
  return Response.json({ ai: aiEnabled(), model: aiEnabled() ? MODEL : null });
}

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Enter a plant name first (at least two letters)." },
      { status: 400 },
    );
  const { name, categories } = parsed.data;

  if (!aiEnabled()) {
    const profile = lookupPlant(name);
    return profile
      ? Response.json({
          profile: tidyProfile(profile, categories),
          source: "guide",
        })
      : Response.json(
          {
            error:
              "AI isn’t set up on this server and this plant isn’t in the built-in guide. Fill the form in yourself, or add ANTHROPIC_API_KEY.",
          },
          { status: 404 },
        );
  }

  const who = await requester(request);
  if (rateLimited(who.key, who.limit)) return tooMany();

  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      ...fallbackParams(),
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(plantProfileSchema),
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Plant name: ${JSON.stringify(name)}\nCategories: ${JSON.stringify(categories)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      const fallback = lookupPlant(name);
      if (fallback)
        return Response.json({
          profile: tidyProfile(fallback, categories),
          source: "guide",
        });
      return Response.json(
        { error: "The assistant couldn’t build a profile for that name." },
        { status: 422 },
      );
    }
    return Response.json({
      profile: tidyProfile(response.parsed_output, categories),
      source: "ai",
    });
  } catch (error) {
    console.error("AI plant profile failed:", error);
    const fallback = lookupPlant(name);
    if (fallback)
      return Response.json({
        profile: tidyProfile(fallback, categories),
        source: "guide",
      });
    return Response.json({ error: aiErrorMessage(error) }, { status: 502 });
  }
}
