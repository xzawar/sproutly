import test from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../lib/demo";
import { todayIn } from "../lib/dates";
import {
  buildGardenContext,
  gardenContextSchema,
  ruleBrief,
} from "../lib/ai-context";
import { lookupPlant, tidyProfile } from "../lib/plant-guide";
import { placeLabel, weatherKind, type Forecast } from "../lib/weather";

const forecast = (day: string, rain: boolean): Forecast => ({
  fetchedAt: Date.now(),
  latitude: 31.56,
  longitude: 74.35,
  timezone: "Asia/Karachi",
  current: {
    time: `${day}T09:00`,
    temperature_2m: 24,
    relative_humidity_2m: 60,
    weather_code: rain ? 63 : 0,
    rain: 0,
  },
  daily: {
    time: [day],
    temperature_2m_max: [29],
    temperature_2m_min: [18],
    rain_sum: [rain ? 4 : 0],
    showers_sum: [0],
    precipitation_probability_max: [rain ? 80 : 5],
    weather_code: [rain ? 63 : 0],
  },
});

test("plant guide finds common, local and nickname plant names", () => {
  assert.equal(
    lookupPlant("My kitchen Monstera")?.scientific_name,
    "Monstera deliciosa",
  );
  assert.equal(lookupPlant("tulsi")?.common_name, "Basil");
  assert.equal(lookupPlant("Peace lilies")?.common_name, "Peace lily");
  assert.equal(lookupPlant("Snake plant")?.environment, "indoor");
  assert.equal(lookupPlant("qwerty"), null);
});

test("AI profiles are clamped to what the form and database accept", () => {
  const p = tidyProfile(
    {
      common_name: "x".repeat(300),
      scientific_name: "Y",
      category: "herbs",
      environment: "outdoor",
      sunlight: "Full",
      watering: "w",
      fertilizing: "f",
      description: "d",
      water_every_days: 0.2,
      fertilize_every_days: 9999,
    },
    ["Indoor", "Herbs"],
  );
  assert.equal(p.common_name.length, 100);
  assert.equal(p.category, "Herbs");
  assert.equal(p.water_every_days, 1);
  assert.equal(p.fertilize_every_days, 365);
  assert.equal(
    tidyProfile({ ...p, category: "Trees" }, ["Indoor"]).category,
    "",
  );
});

test("garden context is valid, ordered and flags rain skips only for outdoor due watering", () => {
  const data = createDemo();
  const today = todayIn(data.profile.timezone);
  const dry = buildGardenContext(data, today, forecast(today, false), null);
  assert.ok(gardenContextSchema.safeParse(dry).success);
  assert.ok(dry.tasks.every((t) => !t.rainSkip));
  const dues = dry.tasks.map((t) => t.due);
  assert.deepEqual(dues, [...dues].sort());

  const wet = buildGardenContext(data, today, forecast(today, true), {
    id: 1,
    name: "Lahore",
    region: "Punjab",
    country: "Pakistan",
    latitude: 31.56,
    longitude: 74.35,
    label: "Lahore, Punjab, Pakistan",
  });
  assert.equal(wet.weather?.rainLikely, true);
  assert.equal(wet.weather?.place, "Lahore, Punjab, Pakistan");
  const outdoorIds = new Set(
    data.plants.filter((p) => p.environment === "outdoor").map((p) => p.name),
  );
  for (const t of wet.tasks)
    if (t.rainSkip) {
      assert.ok(outdoorIds.has(t.plant));
      assert.equal(t.activity, "Water");
      assert.notEqual(t.status, "Upcoming");
    }
  assert.ok(wet.tasks.some((t) => t.rainSkip));
});

test("rule brief summarises due work by place and mentions rain skips", () => {
  const data = createDemo();
  const today = todayIn(data.profile.timezone);
  const text = ruleBrief(
    buildGardenContext(data, today, forecast(today, true), null),
  );
  assert.match(text, /tasks? today/);
  assert.match(text, /Start with/);
  assert.match(text, /Rain is likely/);
  const empty = ruleBrief(
    buildGardenContext(
      { ...data, plants: [], schedules: [] },
      today,
      null,
      null,
    ),
  );
  assert.match(empty, /Add your first plant/);
});

test("weather helpers label places and group WMO codes", () => {
  assert.equal(
    placeLabel("Lahore", "Punjab", "Pakistan"),
    "Lahore, Punjab, Pakistan",
  );
  assert.equal(
    placeLabel("Singapore", "Singapore", "Singapore"),
    "Singapore, Singapore",
  );
  assert.equal(weatherKind(0), "clear");
  assert.equal(weatherKind(45), "fog");
  assert.equal(weatherKind(81), "rain");
  assert.equal(weatherKind(95), "storm");
});
