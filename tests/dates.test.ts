import test from "node:test";
import assert from "node:assert/strict";
import {
  addInterval,
  nextOccurrence,
  projections,
  taskStatus,
  todayIn,
  validDate,
} from "../lib/dates";
import { createDemo, demoMutation } from "../lib/demo";
import { plantSchema, profileSchema, scheduleSchema } from "../lib/validation";
for (const [label, date, count, unit, expected] of [
  ["daily", "2026-10-17", 1, "days", "2026-10-18"],
  ["every N days", "2026-10-17", 5, "days", "2026-10-22"],
  ["weekly", "2026-10-17", 1, "weeks", "2026-10-24"],
  ["biweekly", "2026-10-17", 2, "weeks", "2026-10-31"],
  ["monthly", "2026-10-17", 1, "months", "2026-11-17"],
  ["month end", "2026-01-31", 1, "months", "2026-02-28"],
  ["leap year", "2028-01-31", 1, "months", "2028-02-29"],
  ["year boundary", "2026-12-31", 1, "days", "2027-01-01"],
  ["custom months", "2026-12-31", 2, "months", "2027-02-28"],
  ["after clamping", "2026-02-28", 1, "months", "2026-03-28"],
] as const)
  test(label, () => assert.equal(addInterval(date, count, unit), expected));
test("invalid dates and interval are rejected", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.throws(() => addInterval("bad", 1, "days"));
  assert.throws(() => addInterval("2026-01-01", 0, "days"));
  assert.throws(() => addInterval("2026-01-01", 1.5, "days"));
});
test("end date is inclusive and recurrence ends after it", () => {
  assert.deepEqual(nextOccurrence("2026-10-17", 7, "days", "2026-10-24"), {
    date: "2026-10-24",
    active: true,
  });
  assert.equal(
    nextOccurrence("2026-10-17", 7, "days", "2026-10-23").active,
    false,
  );
});
test("status uses date comparisons without persisted stale status", () => {
  assert.equal(taskStatus("2026-10-16", "2026-10-17"), "Overdue");
  assert.equal(taskStatus("2026-10-17", "2026-10-17"), "Due Today");
  assert.equal(taskStatus("2026-10-18", "2026-10-17"), "Upcoming");
});
test("timezone handles midnight and DST", () => {
  const d = new Date("2026-10-16T23:38:28Z");
  assert.equal(todayIn("Asia/Karachi", d), "2026-10-17");
  assert.equal(todayIn("America/Los_Angeles", d), "2026-10-16");
  assert.equal(
    todayIn("America/New_York", new Date("2026-03-08T07:30:00Z")),
    "2026-03-08",
  );
});
test("calendar labels forecasts and respects end dates", () => {
  const s = {
    ...createDemo().schedules[0],
    next_due_date: "2026-10-01",
    end_date: "2026-10-15",
    interval_count: 7,
  };
  assert.deepEqual(projections(s, "2026-10-01", "2026-10-31"), [
    { date: "2026-10-01", estimated: false },
    { date: "2026-10-08", estimated: true },
    { date: "2026-10-15", estimated: true },
  ]);
  assert.deepEqual(
    projections({ ...s, active: false }, "2026-10-01", "2026-10-31"),
    [],
  );
});
test("demo completion preserves history and advances from actual day", () => {
  const d = createDemo();
  const s = d.schedules.find(
    (s) => s.next_due_date < todayIn(d.profile.timezone),
  )!;
  const next = demoMutation(d, {
    kind: "task.resolve",
    payload: {
      id: s.id,
      expected_due: s.next_due_date,
      status: "Completed",
      notes: "Checked soil first",
    },
  });
  assert.equal(next.history.length, d.history.length + 1);
  assert.equal(next.history[0].notes, "Checked soil first");
  assert.equal(
    next.schedules.find((x) => x.id === s.id)?.next_due_date,
    addInterval(todayIn(d.profile.timezone), s.interval_count, s.interval_unit),
  );
  assert.throws(() =>
    demoMutation(next, {
      kind: "task.resolve",
      payload: {
        id: s.id,
        expected_due: s.next_due_date,
        status: "Completed",
        notes: "",
      },
    }),
  );
});
test("archiving a plant preserves history and stops all its schedules", () => {
  const d = createDemo();
  const p = d.plants[0];
  const next = demoMutation(d, {
    kind: "plant.archive",
    payload: { id: p.id },
  });
  assert.ok(next.plants[0].archived_at);
  assert.ok(
    next.schedules
      .filter((s) => s.plant_id === p.id)
      .every((s) => !s.active && s.archived_at),
  );
  assert.equal(next.history.length, d.history.length);
});
test("server input schemas enforce dates, URLs, custom names, lengths and timezone", () => {
  const d = createDemo();
  const p = d.plants[0];
  assert.equal(plantSchema.safeParse({ ...p, name: "" }).success, false);
  assert.equal(
    plantSchema.safeParse({ ...p, image_url: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(
    plantSchema.safeParse({
      ...p,
      image_url: "https://user:secret@example.com/x",
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ name: "Alex", timezone: "invalid/zone" }).success,
    false,
  );
  assert.equal(
    scheduleSchema.safeParse({
      ...d.schedules[0],
      activity: "Custom",
      custom_name: "",
    }).success,
    false,
  );
  assert.equal(
    scheduleSchema.safeParse({ ...d.schedules[0], end_date: "1900-01-01" })
      .success,
    false,
  );
  assert.equal(
    scheduleSchema.safeParse({ ...d.schedules[0], interval_count: 0 }).success,
    false,
  );
});
test("overdue calendar forecasts never invent a backlog of missed occurrences", () => {
  const s = {
    ...createDemo().schedules[0],
    next_due_date: "2026-10-01",
    interval_count: 1,
    interval_unit: "days" as const,
  };
  const items = projections(s, "2026-10-01", "2026-10-20", "2026-10-17");
  assert.deepEqual(
    items.map((x) => x.date),
    ["2026-10-01", "2026-10-18", "2026-10-19", "2026-10-20"],
  );
  assert.equal(items.filter((x) => !x.estimated).length, 1);
});
