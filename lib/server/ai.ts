import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { isConfigured, supabaseServer } from "@/lib/supabase/server";

/** Default model. Override with ANTHROPIC_MODEL (for example claude-haiku-5-5 for lower cost). */
export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

export const aiEnabled = () =>
  Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
  );

let client: Anthropic | null = null;
export function anthropic() {
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}

/**
 * Server-side refusal fallback: when the primary model declines, the API retries on a
 * fallback model inside the same call. Only some models accept it.
 */
export const fallbackParams = (): Pick<
  Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  "betas" | "fallbacks"
> =>
  /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
    : {};

// In-memory sliding window. Enough for one server instance; use a shared store
// (for example a Supabase table) if the app runs on several instances.
const hits = new Map<string, number[]>();
const WINDOW = 10 * 60_000;
export function rateLimited(key: string, limit: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000)
    for (const [k, v] of hits)
      if (!v.some((t) => now - t < WINDOW)) hits.delete(k);
  return false;
}

/** Signed-in users get a larger allowance than anonymous demo visitors. */
export async function requester(request: Request) {
  if (isConfigured()) {
    try {
      const db = await supabaseServer();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (user) return { key: `user:${user.id}`, limit: 60 };
    } catch {
      /* treat as anonymous */
    }
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return { key: `ip:${ip}`, limit: 20 };
}

export const tooMany = () =>
  Response.json(
    {
      error: "You’ve reached the AI limit for now. Try again in a few minutes.",
    },
    { status: 429, headers: { "Retry-After": "120" } },
  );

export function aiErrorMessage(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError)
    return "The AI key is invalid. Check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError)
    return "The AI service is busy. Try again in a moment.";
  if (error instanceof Anthropic.APIConnectionError)
    return "Couldn’t reach the AI service. Check the server’s network.";
  if (error instanceof Anthropic.APIError)
    return "The AI service returned an error. Try again shortly.";
  return "The AI request failed. Try again shortly.";
}
