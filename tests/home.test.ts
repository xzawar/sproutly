import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, demoMutation, upgradeDemoHome } from "../lib/demo";
import {
  rooms,
  roomIds,
  worldPoint,
  savedPlacement,
  spotName,
  validPlacement,
  surfacePoint,
  type Placement,
} from "../lib/home";

test("each room has selectable named spots inside its floor bounds", () => {
  for (const room of roomIds)
    for (const s of rooms[room].spots) {
      const placement = { room, x: s.x, y: s.y };
      assert.equal(spotName(placement), s.label);
      const w = worldPoint(placement);
      assert.ok(
        w.x >= rooms[room].x && w.x <= rooms[room].x + rooms[room].width,
      );
      assert.ok(
        w.z >= rooms[room].z && w.z <= rooms[room].z + rooms[room].depth,
      );
    }
});

test("legacy pins are repaired once and real locations survive moving, renaming and archiving", () => {
  let data = createDemo();
  const plant = data.plants[0];
  const old = {
    ...plant,
    home_room: null,
    home_x: null,
    home_y: null,
    home_layout_version: 0,
  };
  data.plants[0] = old;
  data = upgradeDemoHome(data);
  const get = () => data.plants.find((p) => p.id === plant.id)!;
  const place = (placement: Placement | null) =>
    demoMutation(data, {
      kind: "plant.place",
      payload: { id: plant.id, placement },
    });
  assert.ok(validPlacement(savedPlacement(get())!));
  assert.equal(upgradeDemoHome(data), data);
  const requested = { room: "balcony", x: 71, y: 65 } as const;
  data = place(requested);
  const actual = savedPlacement(get())!;
  assert.equal(actual.room, "balcony");
  assert.ok(validPlacement(actual));
  assert.equal(get().location, rooms.balcony.name);
  data = demoMutation(data, {
    kind: "plant.save",
    payload: { ...get(), name: "My plant" },
  });
  assert.deepEqual(savedPlacement(get()), actual);
  data = demoMutation(data, {
    kind: "plant.archive",
    payload: { id: plant.id },
  });
  assert.throws(() => place(requested));
  data = demoMutation(data, {
    kind: "plant.restore",
    payload: { id: plant.id, schedule_ids: [] },
  });
  assert.deepEqual(savedPlacement(get()), actual);
  for (const invalid of [
    { ...requested, x: -1 },
    { ...requested, y: 101 },
    { ...requested, room: "attic" },
    { ...requested, x: 1.5 },
  ]) {
    assert.throws(() =>
      demoMutation(data, {
        kind: "plant.place",
        payload: { id: plant.id, placement: invalid },
      }),
    );
  }
  data = place(null);
  assert.equal(savedPlacement(get())?.room, "front-garden");
  assert.equal(get().name, "My plant");
});

test("new species occupy separate valid surfaces; moving, refreshing and independent care preserve history", () => {
  let data = createDemo();
  const base = data.plants[0];
  function add(name: string, location: string) {
    data = demoMutation(data, {
      kind: "plant.create",
      payload: {
        plant: {
          ...base,
          id: undefined,
          name,
          common_name: name,
          scientific_name: "",
          location,
        },
        routines: [],
      },
    });
    return data.plants.at(-1)!;
  }
  const aloe = add("Aloe vera", "Kitchen Countertop");
  const rose = add("Rose", "Front Garden");
  const other = add("Rose", "Front Garden");
  const pos = savedPlacement(rose)!;
  assert.equal(savedPlacement(aloe)?.room, "countertop");
  assert.ok(surfacePoint(savedPlacement(aloe)!).y > 0.85);
  assert.equal(pos.room, "front-garden");
  assert.notDeepEqual(savedPlacement(rose), savedPlacement(other));
  const payload = {
    id: crypto.randomUUID(),
    plant_id: rose.id,
    expected_location: pos,
    activity: "Water",
  };
  const care = () => demoMutation(data, { kind: "care.record", payload });
  const before = data.history.length;
  data = care();
  assert.equal(data.history.length, before + 1);
  assert.equal(data.history[0].plant_id, rose.id);
  assert.equal(data.history[0].schedule_id, null);
  assert.equal(data.history[0].activity, "Water");
  data = care();
  assert.equal(data.history.length, before + 1);
  assert.throws(
    () =>
      demoMutation(data, {
        kind: "care.record",
        payload: { ...payload, id: crypto.randomUUID() },
      }),
    /already recorded/,
  );
  data = demoMutation(data, {
    kind: "plant.save",
    payload: { ...rose, location: "Backyard" },
  });
  data = upgradeDemoHome(JSON.parse(JSON.stringify(data)));
  assert.equal(
    savedPlacement(data.plants.find((p) => p.id === rose.id)!)?.room,
    "backyard",
  );
  assert.throws(
    () =>
      demoMutation(data, {
        kind: "care.record",
        payload: { ...payload, id: crypto.randomUUID(), activity: "Prune" },
      }),
    /moved/,
  );
  assert.deepEqual(care().history, data.history);
});

test("animated routine completion rejects a stale plant or due occurrence and can replay a committed request", () => {
  let data = createDemo();
  const schedule = data.schedules[0],
    plant = data.plants.find((p) => p.id === schedule.plant_id)!;
  const pos = savedPlacement(plant)!;
  const payload = {
    id: schedule.id,
    expected_due: schedule.next_due_date,
    plant_id: plant.id,
    expected_location: pos,
    activity: "Water",
    request_id: crypto.randomUUID(),
    status: "Completed",
    notes: "Checked soil",
  };
  const m = (p: Record<string, unknown>) =>
    demoMutation(data, { kind: "task.resolve", payload: p });
  assert.throws(
    () => m({ ...payload, expected_location: { ...pos, x: pos.x + 1 } }),
    /moved/,
  );
  assert.throws(() => m({ ...payload, activity: "Prune" }), /changed/);
  const count = data.history.length;
  data = m(payload);
  assert.equal(data.history.length, count + 1);
  assert.equal(data.history[0].notes, payload.notes);
  data = m(payload);
  assert.equal(data.history.length, count + 1);
  assert.throws(
    () => m({ ...payload, request_id: crypto.randomUUID() }),
    /Task already changed/,
  );
});
