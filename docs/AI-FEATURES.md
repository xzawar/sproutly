# AI automation in Sproutly

Sproutly adds three AI features to a conventional Next.js + Supabase web app. Each one is a normal HTTP route on the server. Each one also works without AI, so the app never breaks when the key is missing or the AI service is down.

| Feature                   | Where                                    | What the AI does                                                                                                                                                             | Without an API key                                                                |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Care profile autofill** | Add plant → **Fill with AI**             | Turns a typed name ("my balcony tulsi") into names, category, light, indoor/outdoor, care notes and watering/fertilizing intervals. The form then switches on both routines. | Looks the name up in a built-in guide of 25 common plants (`lib/plant-guide.ts`). |
| **Daily care brief**      | Overview, next to "Today in your garden" | Writes a 2–4 sentence plan for today: what's due, a route grouped by room, and a rain or heat tip.                                                                           | A rule-based sentence from the same data (`ruleBrief`).                           |
| **Plant assistant**       | Sidebar → **Assistant**                  | A streaming chat that knows the gardener's plants, the next 7 days of tasks, recent care and today's weather.                                                                | Explains that AI isn't connected and shows the rule-based plan.                   |

## How it works

```
Browser (React)                      Next.js server                       Claude API
────────────────                     ──────────────                       ──────────
buildGardenContext(data, weather) ─► /api/ai/brief  ─ zod validate ─────► messages.create
  (tasks, order, rain eligibility      /api/ai/chat   ─ rate limit ───────► messages.stream ─► text chunks
   computed in app code)               /api/ai/plant  ─ structured output ► messages.parse (zod schema)
                                       └─ no key / error → rules / built-in guide
```

- **The app decides; the model words it.** Which tasks are due, their order, and whether rain makes an outdoor watering skippable are all computed in `lib/ai-context.ts`. The brief prompt forbids inventing tasks or weather, so the AI can't make up a due date.
- **Structured output.** Autofill uses `client.beta.messages.parse` with a Zod schema (`plantProfileSchema`). The response is validated and clamped (`tidyProfile`) before it reaches the form. Categories must match the user's own list, and intervals stay within 1–60 and 7–365 days.
- **Streaming.** The assistant route forwards `messages.stream` text deltas as a chunked `text/plain` response. The page reads them with `ReadableStream` and renders a small, safe Markdown subset with no raw HTML.
- **Privacy and limits.** The API key is server-only (`ANTHROPIC_API_KEY`, never `NEXT_PUBLIC_`). Requests are validated and size-bounded with Zod. Signed-in users get 60 AI calls and demo visitors 20 calls per 10 minutes (in-memory limiter). Nothing is written to the database. The brief is cached per garden state in `sessionStorage`, and chat history stays in the tab.
- **Safety.** On the default model, requests use server-side refusal fallbacks (`fallbacks: "default"`). If a request fails, the user gets a rule-based answer or a clear error, never a blank screen.

## Configuration

```sh
# .env.local
ANTHROPIC_API_KEY=sk-ant-...        # enables the AI features
ANTHROPIC_MODEL=claude-opus-5-5     # optional; e.g. claude-haiku-5-5 for lower cost
```

The default model is `claude-opus-5-5` with low effort, which keeps answers fast. For a classroom demo on a tight budget, `claude-haiku-5-5` costs much less per request.

## Files

- `lib/ai-context.ts`: garden summary schema, builder and rule-based brief
- `lib/plant-guide.ts`: profile schema, clamping and the built-in guide
- `lib/server/ai.ts`: Claude client, model, fallbacks, rate limit, error messages
- `app/api/ai/{plant,brief,chat}/route.ts`: the three endpoints
- `components/daily-brief.tsx`, `components/assistant.tsx`, `components/plant-form.tsx`: the UI
- `tests/ai.test.ts`: guide lookup, clamping, context ordering, rain-skip flags, rule brief

## Ideas for a next step

- **Photo identification:** send an uploaded photo to Claude's vision input and prefill the form, or flag pests and yellowing leaves.
- **Email digest:** a Supabase Edge Function on a `pg_cron` schedule that sends each gardener their daily brief.
