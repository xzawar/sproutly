import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, demoMutation } from "../lib/demo";
import { rainExpected, type Forecast } from "../lib/weather";
import { todayIn, addInterval } from "../lib/dates";
import { growthSchema, photoSchema, restoreSchema } from "../lib/validation";
test("restore selectively resumes routines with a fresh date and retained history", () => {
  const d = createDemo(),
    p = d.plants[0],
    s = d.schedules.find((x) => x.plant_id === p.id)!;
  const a = demoMutation(d, { kind: "plant.archive", payload: { id: p.id } });
  const r = demoMutation(a, {
    kind: "plant.restore",
    payload: { id: p.id, schedule_ids: [s.id] },
  });
  assert.equal(r.plants[0].archived_at, null);
  assert.equal(
    r.schedules.find((x) => x.id === s.id)!.next_due_date,
    addInterval(todayIn(d.profile.timezone), s.interval_count, s.interval_unit),
  );
  assert.equal(
    r.schedules.filter((x) => x.plant_id === p.id && x.active).length,
    1,
  );
  assert.equal(r.history.length, d.history.length);
});
test("rain suggestions require fresh, matching-day, measurable probable rain", () => {
  const day = "2026-10-17";
  const w = {
    fetchedAt: Date.now(),
    daily: {
      time: [day],
      precipitation_probability_max: [85],
      rain_sum: [1],
      showers_sum: [0],
    },
  } as Forecast;
  assert.equal(rainExpected(w, day), true);
  assert.equal(rainExpected(w, "2026-10-18"), false);
  assert.equal(
    rainExpected({ ...w, fetchedAt: Date.now() - 31 * 60000 }, day),
    false,
  );
  assert.equal(
    rainExpected({ ...w, daily: { ...w.daily, rain_sum: [0] } }, day),
    false,
  );
  assert.equal(
    rainExpected(
      { ...w, daily: { ...w.daily, precipitation_probability_max: [59] } },
      day,
    ),
    false,
  );
  assert.equal(rainExpected(null, day), false);
});
test("journal inputs reject invalid dates, negative growth and ambiguous image sources", () => {
  const plant_id = createDemo().plants[0].id;
  assert.ok(
    growthSchema.safeParse({
      plant_id,
      recorded_on: "2026-10-17",
      height_cm: 0,
      leaf_count: null,
      notes: "",
    }).success,
  );
  assert.ok(
    !growthSchema.safeParse({
      plant_id,
      recorded_on: "2026-02-30",
      height_cm: -1,
      leaf_count: null,
      notes: "",
    }).success,
  );
  assert.ok(
    !photoSchema.safeParse({
      plant_id,
      taken_on: "2026-10-17",
      caption: "",
      image_url: "https://example.test/a.jpg",
      image_path: "abc/file.jpg",
    }).success,
  );
  assert.ok(
    !restoreSchema.safeParse({ id: plant_id, schedule_ids: ["bad"] }).success,
  );
});
