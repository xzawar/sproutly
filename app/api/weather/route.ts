import { z } from "zod";
const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});
export async function GET(request: Request) {
  const v = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!v.success)
    return Response.json({ error: "Invalid coordinates" }, { status: 400 });
  const lat = Math.round(v.data.lat * 100) / 100,
    lon = Math.round(v.data.lon * 100) / 100;
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,weather_code,rain",
    daily:
      "temperature_2m_max,temperature_2m_min,rain_sum,showers_sum,precipitation_probability_max,weather_code",
    forecast_days: "7",
    timezone: "auto",
  }).toString();
  try {
    const res = await fetch(u, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw Error();
    const w = await res.json();
    const daily = z.object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).length(7),
      temperature_2m_max: z.array(z.number()).length(7),
      temperature_2m_min: z.array(z.number()).length(7),
      rain_sum: z.array(z.number().nonnegative()).length(7),
      showers_sum: z.array(z.number().nonnegative()).length(7),
      precipitation_probability_max: z
        .array(z.number().min(0).max(100))
        .length(7),
      weather_code: z.array(z.number().int()).length(7),
    });
    z.object({
      latitude: z.number(),
      longitude: z.number(),
      timezone: z.string(),
      current: z.object({
        time: z.string(),
        temperature_2m: z.number(),
        relative_humidity_2m: z.number().min(0).max(100),
        weather_code: z.number().int(),
        rain: z.number().nonnegative(),
      }),
      daily,
    }).parse(w);
    return Response.json(
      { ...w, fetchedAt: Date.now() },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Weather is temporarily unavailable. No tasks have been changed.",
      },
      { status: 502 },
    );
  }
}
