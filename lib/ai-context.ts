import { z } from "zod";
import { addDays, taskStatus } from "./dates";
import { rooms, type RoomId } from "./home";
import {
  rainExpected,
  weatherLabel,
  type Forecast,
  type Place,
} from "./weather";
import { activityLabel, type WorkspaceData } from "./types";

const short = (n: number) => z.string().max(n);

/**
 * Everything the AI sees about a garden. The app computes tasks, order, dates and
 * rain eligibility itself; the model only words them. Bounded so a request stays small.
 */
export const gardenContextSchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gardener: short(100),
  plants: z
    .array(
      z.object({
        name: short(100),
        species: short(150),
        place: short(100),
        outdoor: z.boolean(),
        sunlight: short(20),
        watering: short(300),
        fertilizing: short(300),
      }),
    )
    .max(80),
  tasks: z
    .array(
      z.object({
        plant: short(100),
        activity: short(100),
        place: short(100),
        due: z.string().max(10),
        status: z.enum(["Overdue", "Due Today", "Upcoming"]),
        daysLate: z.number().int().min(0).max(100000),
        rainSkip: z.boolean(),
      }),
    )
    .max(120),
  recent: z
    .array(
      z.object({
        plant: short(100),
        activity: short(100),
        date: z.string().max(10),
        status: z.enum(["Completed", "Skipped"]),
      }),
    )
    .max(20),
  weather: z
    .object({
      place: short(160),
      now: short(60),
      temperature: z.number(),
      high: z.number(),
      low: z.number(),
      humidity: z.number(),
      rainChance: z.number(),
      rainMm: z.number(),
      rainLikely: z.boolean(),
    })
    .nullable(),
});
export type GardenContext = z.infer<typeof gardenContextSchema>;

const placeOf = (p: WorkspaceData["plants"][number]) =>
  (
    p.location ||
    (p.home_room && rooms[p.home_room as RoomId]?.name) ||
    "Unplaced"
  ).slice(0, 100);

const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );

export function buildGardenContext(
  data: WorkspaceData,
  today: string,
  weather: Forecast | null,
  place: Place | null,
): GardenContext {
  const plants = data.plants.filter((p) => !p.archived_at);
  const byId = new Map(plants.map((p) => [p.id, p]));
  const rain = rainExpected(weather, today);
  const horizon = addDays(today, 7);
  const tasks = data.schedules
    .filter(
      (s) =>
        s.active &&
        !s.archived_at &&
        byId.has(s.plant_id) &&
        s.next_due_date <= horizon,
    )
    .map((s) => {
      const p = byId.get(s.plant_id)!;
      const status = taskStatus(s.next_due_date, today);
      return {
        plant: p.name.slice(0, 100),
        activity: activityLabel(s).slice(0, 100),
        place: placeOf(p),
        due: s.next_due_date,
        status,
        daysLate: Math.max(0, daysBetween(s.next_due_date, today)),
        rainSkip:
          rain &&
          status !== "Upcoming" &&
          s.activity === "Water" &&
          p.environment === "outdoor",
      };
    })
    // Overdue first, then by room so a round visits each room once.
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) ||
        a.place.localeCompare(b.place) ||
        a.plant.localeCompare(b.plant),
    )
    .slice(0, 120);
  const recent = [...data.history]
    .sort((a, b) => b.action_date.localeCompare(a.action_date))
    .slice(0, 20)
    .map((h) => ({
      plant: (byId.get(h.plant_id)?.name ?? "Archived plant").slice(0, 100),
      activity: h.activity.slice(0, 100),
      date: h.action_date,
      status: h.status,
    }));
  const i = weather ? Math.max(0, weather.daily.time.indexOf(today)) : 0;
  return {
    today,
    gardener: data.profile.name.slice(0, 100),
    plants: plants.slice(0, 80).map((p) => ({
      name: p.name.slice(0, 100),
      species: (p.scientific_name || p.common_name).slice(0, 150),
      place: placeOf(p),
      outdoor: p.environment === "outdoor",
      sunlight: p.sunlight,
      watering: p.watering.slice(0, 300),
      fertilizing: p.fertilizing.slice(0, 300),
    })),
    tasks,
    recent,
    weather: weather
      ? {
          place: (place?.label ?? "Your location").slice(0, 160),
          now: weatherLabel(weather.current.weather_code),
          temperature: Math.round(weather.current.temperature_2m),
          high: Math.round(weather.daily.temperature_2m_max[i]),
          low: Math.round(weather.daily.temperature_2m_min[i]),
          humidity: weather.current.relative_humidity_2m,
          rainChance: weather.daily.precipitation_probability_max[i] ?? 0,
          rainMm:
            Math.round(
              (weather.daily.rain_sum[i] + weather.daily.showers_sum[i]) * 10,
            ) / 10,
          rainLikely: rain,
        }
      : null,
  };
}

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** Deterministic brief used when AI is off or unavailable. */
export function ruleBrief(c: GardenContext): string {
  const due = c.tasks.filter((t) => t.status !== "Upcoming");
  const upcoming = c.tasks.filter((t) => t.status === "Upcoming");
  const parts: string[] = [];
  if (!c.plants.length)
    return "Your garden is empty. Add your first plant to get a daily care plan.";
  if (!due.length) {
    parts.push("Nothing is due today — enjoy a quiet day in the garden.");
    if (upcoming[0])
      parts.push(
        `Next up: ${upcoming[0].activity.toLowerCase()} ${upcoming[0].plant} on ${upcoming[0].due}.`,
      );
  } else {
    const groups = new Map<string, typeof due>();
    for (const t of due)
      groups.set(t.place, [...(groups.get(t.place) ?? []), t]);
    const overdue = due.filter((t) => t.status === "Overdue").length;
    parts.push(
      `${due.length} task${due.length === 1 ? "" : "s"} today${overdue ? `, ${overdue} overdue` : ""}.`,
    );
    const rooms = [...groups.entries()]
      .slice(0, 3)
      .map(
        ([place, ts]) =>
          `${place}: ${list(ts.map((t) => `${t.activity.toLowerCase()} ${t.plant}`))}`,
      );
    parts.push(`Start with ${rooms.join("; ")}.`);
    const skip = due.filter((t) => t.rainSkip).map((t) => t.plant);
    if (skip.length)
      parts.push(
        `Rain is likely, so ${list(skip)} may not need watering — check the soil first.`,
      );
  }
  if (c.weather && !c.weather.rainLikely && c.weather.high >= 35)
    parts.push(
      `It will reach ${c.weather.high}°C, so check outdoor pots for dry soil.`,
    );
  return parts.join(" ");
}
