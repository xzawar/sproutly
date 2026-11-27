import test from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../lib/demo";
import type { History, Schedule } from "../lib/types";
import {
  gardenPlants,
  plantModels,
  resolvePlantModel,
  type Species,
} from "../lib/estate/garden";
import {
  defaultHealthRules,
  estimateHealth,
  healthByPlant,
} from "../lib/estate/health";
import { specimen, type SpecimenOptions } from "../lib/estate/specimens";
import type { Mesh } from "../lib/estate/mesh";

const day = "2026-11-20";
const instant = Date.parse(`${day}T00:30:00+05:00`);
const hour = 3_600_000;
const source = createDemo();
function routine(due: string, fields: Partial<Schedule> = {}): Schedule {
  return {
    ...source.schedules[0],
    id: "routine",
    plant_id: "rose",
    active: true,
    archived_at: null,
    activity: "Water",
    next_due_date: due,
    interval_count: 7,
    interval_unit: "days",
    ...fields,
  };
}
function entry(due: string, fields: Partial<History> = {}): History {
  return {
    ...source.history[0],
    id: "event",
    plant_id: "rose",
    schedule_id: "routine",
    activity: "Water",
    action_date: day,
    due_date: due,
    status: "Completed",
    created_at: new Date(instant).toISOString(),
    ...fields,
  };
}
function model(kind: Species, options: SpecimenOptions = {}, id = "plant") {
  const mesh: Mesh = [];
  specimen(mesh, 0, 0, 0, kind, id, 1, false, options);
  return mesh;
}
const faces = (mesh: Mesh) =>
  mesh.reduce((total, face) => total + face.points.length - 2, 0);
const altitude = (mesh: Mesh) =>
  Math.max(...mesh.flatMap((f) => f.points.map((p) => p[1])));

test("taxonomic names take precedence, and category and silhouette approximations are disclosed", () => {
  const resolve = (
    name: string,
    scientific_name = "",
    common_name = "",
    category = "Indoor",
  ) => resolvePlantModel({ name, scientific_name, common_name }, category);
  const names = {
    aloe: "Aloe vera",
    rose: "Rosa chinensis",
    cactus: "Echinopsis oxygona",
    sword: "Dracaena trifasciata",
    vine: "Money plant",
    monstera: "Monstera deliciosa",
    sunflower: "Helianthus annuus",
    tulip: "Tulipa gesneriana",
    basil: "Ocimum basilicum",
    fern: "Nephrolepis exaltata",
  } as const;
  for (const [kind, name] of Object.entries(names)) {
    const result = resolve("Rose", name);
    assert.equal(result.model, kind);
    assert.equal(result.modelFallback, false);
  }
  assert.equal(resolve("Rosemary").model, "herb");
  assert.equal(resolve("Rosemary").modelFallback, true);
  assert.equal(resolve("Lola", "", "Chinese money plant").model, "broadleaf");
  assert.equal(resolve("Desert rose").modelFallback, true);
  assert.deepEqual(resolve("My mystery plant", "", "", "Succulents"), {
    model: "aloe",
    modelLabel: "Aloe rosette",
    modelFallback: true,
  });
});

test("each registered model emits valid pickable 3D geometry with cheaper low detail", () => {
  const signatures = new Set<string>();
  for (const kind of Object.keys(plantModels) as Species[]) {
    const [low, balanced, ultra] = (["low", "balanced", "ultra"] as const).map(
      (detail) => model(kind, { detail }),
    );
    assert.ok(
      faces(low) < faces(balanced) && faces(balanced) < faces(ultra),
      kind,
    );
    assert.ok(faces(low) < 650 && faces(ultra) < 1600, kind);
    assert.ok(altitude(balanced) > 0.7, kind);
    const vertices = balanced.flatMap((f) => f.points);
    assert.equal(Math.min(...vertices.map((p) => p[1])), 0);
    assert.ok(vertices.every((p) => p.every(Number.isFinite)));
    assert.ok(
      balanced.every(
        (f) =>
          f.owner === "plant" && f.points.length >= 3 && f.albedo && f.material,
      ),
    );
    signatures.add(JSON.stringify(balanced.map((f) => f.points)));
  }
  assert.equal(signatures.size, Object.keys(plantModels).length);
});

test("stress moves foliage, dries soil and preserves vessel footing and cached reference geometry", () => {
  const fresh = model("rose", { health: { stress: 0, dryness: 0.15 } });
  const before = structuredClone(fresh);
  const dry = model("rose", { health: { stress: 1, dryness: 1 } });
  assert.ok(altitude(dry) < altitude(fresh) - 0.1);
  const potFace = fresh.findIndex((f) => f.center[1] < 0.01);
  assert.deepEqual(dry[potFace], fresh[potFace]);
  const dirt = fresh.findIndex((f) => f.material?.roughness === 0.98);
  assert.ok(dry[dirt].rgb[0] > fresh[dirt].rgb[0]);
  assert.notDeepEqual(dry[dirt].albedo, fresh[dirt].albedo);
  const windy = model("rose", {
    health: { stress: 0, dryness: 0.15 },
    sway: 1,
  });
  assert.notDeepEqual(windy.at(-1)?.points, fresh.at(-1)?.points);
  assert.deepEqual(fresh, before);
  assert.deepEqual(
    model("rose", { health: { stress: 0, dryness: 0.15 } }),
    fresh,
  );
  const bed = model("rose", {
    inGround: true,
    health: { stress: 1, dryness: 1 },
  });
  assert.equal(Math.min(...bed.flatMap((f) => f.points.map((p) => p[1]))), 0);
  assert.equal(
    bed.some((f) => f.material?.roughness === 0.7),
    false,
  );
});

test("a late watering darkens soil immediately, while foliage recovers smoothly from the recorded timestamp", () => {
  const overdue = "2026-11-11";
  const before = estimateHealth([routine(overdue)], [], day, instant);
  assert.equal(before.state, "stressed");
  assert.equal(before.lastWatered, null);
  const records = [entry(overdue)],
    schedules = [routine("2026-11-27")];
  const at = (ms: number) => estimateHealth(schedules, records, day, ms);
  const start = at(instant),
    half = at(instant + 18 * hour),
    end = at(instant + 36 * hour);
  assert.equal(start.state, "recovering");
  assert.equal(start.stress, before.stress);
  assert.ok(start.dryness < before.dryness);
  assert.equal(start.lastWatered, day);
  assert.equal(start.nextWatering, "2026-11-27");
  assert.equal(half.stress, start.stress * 0.5);
  assert.equal(end.stress, 0);
  assert.equal(end.state, "on-track");
  const custom = estimateHealth(schedules, records, day, instant + 6 * hour, {
    ...defaultHealthRules,
    recoveryHours: 12,
  });
  assert.equal(custom.stress, half.stress);
});

test("a skipped watering stays overdue until completed and a subsequent watering cannot erase recovery early", () => {
  const first = entry("2026-11-11", {
    status: "Skipped",
    action_date: "2026-11-19",
    created_at: "2026-11-19T05:00:00Z",
  });
  const next = routine("2026-11-27");
  assert.equal(estimateHealth([next], [first], day, instant).state, "stressed");
  const water = entry(day, { id: "today", schedule_id: null });
  const expected = estimateHealth(
    [next],
    [first, water],
    day,
    instant + 3 * hour,
  );
  assert.equal(expected.state, "recovering");
  const later = entry(day, {
    id: "later",
    schedule_id: null,
    created_at: new Date(instant + hour).toISOString(),
  });
  assert.equal(
    estimateHealth([next], [later, first, water], day, instant + 3 * hour)
      .stress,
    expected.stress,
  );
});

test("health is unknown without watering data, skips unrelated records, and uses the user's local day", () => {
  assert.equal(estimateHealth([], [], day, instant).state, "unknown");
  const water = routine(day),
    prune = routine("2026-11-10", { plant_id: "fern", activity: "Prune" });
  const health = healthByPlant({
    schedules: [water, prune],
    history: [entry(day, { plant_id: "fern", activity: "Mist" })],
    today: day,
    now: instant,
  });
  assert.equal(health.get("rose")?.state, "due"); // UTC is still the previous date.
  assert.equal(health.has("fern"), false);
  const noSchedule = estimateHealth(
    [],
    [entry(day, { schedule_id: null })],
    day,
    instant,
  );
  assert.equal(noSchedule.state, "logged");
  assert.equal(noSchedule.nextWatering, null);
});

test("hydration and exact species update only from authoritative plant and care rows", () => {
  const plant = {
    ...source.plants[0],
    id: "rose",
    name: "Pat",
    scientific_name: "Rosa chinensis",
    location: "Front garden",
    home_room: undefined,
    home_x: null,
    home_y: null,
    home_layout_version: 0,
  };
  const before = gardenPlants([plant], source.categories, {
    schedules: [routine("2026-11-08")],
    history: [],
    today: day,
    now: instant,
  });
  assert.equal(before[0].model, "rose");
  assert.equal(before[0].placement?.room, "front-garden");
  assert.equal(before[0].health.state, "stressed");
  const after = gardenPlants(
    [
      {
        ...plant,
        scientific_name: "Aloe vera",
        location: "Kitchen countertop",
      },
    ],
    source.categories,
    {
      schedules: [routine("2026-11-27")],
      history: [entry("2026-11-08")],
      today: day,
      now: instant,
    },
  );
  assert.equal(after[0].model, "aloe");
  assert.equal(after[0].placement?.room, "countertop");
  assert.equal(after[0].health.state, "recovering");
  assert.equal(
    gardenPlants([{ ...plant, archived_at: day }], source.categories).length,
    0,
  );
});
