import test from "node:test";
import assert from "node:assert/strict";
import { plantCreateSchema, authSchema } from "../lib/validation";
import { createPlantWithRoutines } from "../lib/plant-create";
import { createDemo, demoMutation } from "../lib/demo";

function payload(count = 2) {
  const plant = { ...createDemo().plants[0], id: undefined };
  return {
    plant: { ...plant, name: "New fern" },
    routines: [
      { activity: "Water", interval_count: 7, first_due_date: "2026-10-20" },
      {
        activity: "Fertilize",
        interval_count: 30,
        first_due_date: "2026-11-01",
      },
    ].slice(0, count),
  };
}
for (const count of [0, 1, 2]) {
  test(`create plant with ${count} optional routines`, async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const id = createDemo().plants[0].id;
    assert.equal(
      await createPlantWithRoutines(payload(count), async (table, row) => {
        writes.push({ table, row });
        return id;
      }),
      id,
    );
    assert.equal(writes.length, count + 1);
    assert.equal(writes[0].table, "plants");
    for (const w of writes.slice(1)) {
      assert.equal(w.table, "care_schedules");
      assert.equal(w.row.plant_id, id);
      assert.equal(w.row.interval_unit, "days");
      assert.equal(w.row.start_date, w.row.next_due_date);
      assert.equal(w.row.active, true);
    }
    const d = createDemo();
    const next = demoMutation(d, {
      kind: "plant.create",
      payload: payload(count),
    });
    const created = next.plants.find((p) => p.name === "New fern")!;
    assert.ok(created);
    assert.equal(
      next.schedules.filter((s) => s.plant_id === created.id).length,
      count,
    );
    assert.equal(d.plants.length + 1, next.plants.length);
  });
}
test("validate all routines before any database write", async () => {
  for (const value of [0, -1, 1.5, 3651, NaN]) {
    const p = payload();
    p.routines[1].interval_count = value;
    let writes = 0;
    await assert.rejects(
      createPlantWithRoutines(p, async () => {
        writes++;
        return "unused";
      }),
    );
    assert.equal(writes, 0);
    const d = createDemo(),
      before = structuredClone(d);
    assert.throws(() => demoMutation(d, { kind: "plant.create", payload: p }));
    assert.deepEqual(d, before);
  }
});
test("reject duplicate activities, invalid dates, and existing plant ids", () => {
  const p = payload();
  p.routines[1].activity = "Water";
  assert.equal(plantCreateSchema.safeParse(p).success, false);
  const badDate = payload();
  badDate.routines[0].first_due_date = "2026-02-30";
  assert.equal(plantCreateSchema.safeParse(badDate).success, false);
  assert.equal(
    plantCreateSchema.safeParse({ ...payload(), plant: createDemo().plants[0] })
      .success,
    false,
  );
});
test("transaction errors propagate instead of reporting partial success", async () => {
  let writes = 0;
  await assert.rejects(
    createPlantWithRoutines(payload(), async () => {
      if (++writes === 2) throw Error("Routine insert failed");
      return createDemo().plants[0].id;
    }),
    /Routine insert failed/,
  );
});
test("six-character passwords remain supported; shorter passwords fail", () => {
  assert.equal(
    authSchema.safeParse({ email: "a@example.test", password: "abcdef" })
      .success,
    true,
  );
  assert.equal(
    authSchema.safeParse({ email: "a@example.test", password: "abcde" })
      .success,
    false,
  );
});
