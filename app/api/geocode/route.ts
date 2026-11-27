import { z } from "zod";
import { placeLabel, type Place } from "@/lib/weather";

const query = z.object({ q: z.string().trim().min(2).max(80) });
const result = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  country: z.string().optional(),
  country_code: z.string().optional(),
  admin1: z.string().optional(),
  timezone: z.string().optional(),
});

/** Place search by name (Open-Meteo geocoding). Only the typed text leaves the server. */
export async function GET(request: Request) {
  const v = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!v.success)
    return Response.json(
      { error: "Type at least two letters of a city or town." },
      { status: 400 },
    );
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.search = new URLSearchParams({
    name: v.data.q,
    count: "6",
    language: "en",
    format: "json",
  }).toString();
  try {
    const res = await fetch(u, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw Error();
    const body = (await res.json()) as { results?: unknown[] };
    const places: Place[] = (body.results ?? []).flatMap((raw) => {
      const r = result.safeParse(raw);
      if (!r.success) return [];
      const p = r.data;
      return [
        {
          id: p.id,
          name: p.name,
          region: p.admin1 ?? "",
          country: p.country ?? p.country_code ?? "",
          latitude: Math.round(p.latitude * 100) / 100,
          longitude: Math.round(p.longitude * 100) / 100,
          label: placeLabel(p.name, p.admin1, p.country ?? p.country_code),
        },
      ];
    });
    return Response.json(
      { places },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch {
    return Response.json(
      { error: "Place search is unavailable right now. Try again shortly." },
      { status: 502 },
    );
  }
}
