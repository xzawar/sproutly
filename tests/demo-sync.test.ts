import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, DEMO_KEY } from "../lib/demo";
import { initializeDemo, readDemo, writeDemo } from "../lib/demo-store";
import { savedPlacement } from "../lib/home";
import type { Mutation } from "../lib/types";

test("concurrent demo callers preserve other tabs' plants and record a retried visit once", async () => {
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  // Node 22 does not expose Web Locks; use its LockManager on newer versions.
  const locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  if (!navigator.locks) {
    let last = Promise.resolve();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_key: string, run: () => unknown) => {
          const pending = last.then(run);
          last = pending.then(
            () => {},
            () => {},
          );
          return pending;
        },
      },
    });
  }
  try {
    const snapshot = createDemo();
    const legacy = structuredClone(snapshot);
    Object.assign(legacy.plants[0], {
      home_room: null,
      home_x: null,
      home_y: null,
      home_layout_version: 0,
    });
    storage.set(DEMO_KEY, JSON.stringify(legacy));
    await initializeDemo(snapshot);
    assert.ok(savedPlacement(JSON.parse(storage.get(DEMO_KEY)!).plants[0]));
    const add = (name: string): Mutation => ({
      kind: "plant.create",
      payload: {
        plant: {
          ...snapshot.plants[0],
          id: undefined,
          name,
          location: "Front Garden",
        },
        routines: [],
      },
    });
    const [a, b] = await Promise.all([
      writeDemo(snapshot, add("Rose one")),
      writeDemo(snapshot, add("Rose two")),
    ]);
    assert.notEqual(a.createdId, b.createdId);
    const latest = readDemo(snapshot);
    const first = latest.plants.find((p) => p.id === a.createdId)!,
      second = latest.plants.find((p) => p.id === b.createdId)!;
    assert.ok(first && second);
    assert.notDeepEqual(savedPlacement(first), savedPlacement(second));
    const water: Mutation = {
      kind: "care.record",
      payload: {
        id: crypto.randomUUID(),
        plant_id: first.id,
        activity: "Water",
        expected_location: savedPlacement(first),
      },
    };
    await Promise.all([writeDemo(snapshot, water), writeDemo(snapshot, water)]);
    assert.equal(
      readDemo(snapshot).history.filter((h) => h.plant_id === first.id).length,
      1,
    );
    const competing = (activity: string): Mutation => ({
      kind: "care.record",
      payload: { ...water.payload, activity, id: crypto.randomUUID() },
    });
    const result = await Promise.allSettled([
      writeDemo(snapshot, competing("Mist")),
      writeDemo(snapshot, competing("Mist")),
    ]);
    assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      readDemo(snapshot).history.filter(
        (h) => h.plant_id === first.id && h.activity === "Mist",
      ).length,
      1,
    );
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (locks) Object.defineProperty(navigator, "locks", locks);
    else Reflect.deleteProperty(navigator, "locks");
  }
});
