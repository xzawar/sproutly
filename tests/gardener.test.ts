import assert from "node:assert/strict";
import test from "node:test";
import { createDemo, demoMutation } from "../lib/demo";
import {
  rooms,
  roomIds,
  savedPlacement,
  surfacePoint,
  validPlacement,
  type Placement,
} from "../lib/home";
import { gardenPlants } from "../lib/estate/garden";
import {
  gardenerFrame,
  idleGardener,
  planVisit,
  type CareAction,
} from "../lib/estate/gardener";
import { footSurface } from "../lib/estate/navigation";
import { STAIR, walkable } from "../lib/estate/layout";
import { GARDEN_HEIGHTS } from "../lib/estate/landscape";
import type { Vec } from "../lib/estate/mesh";

const distance = (a: Vec, b: Vec) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rose: Placement = { room: "front-garden", x: 26, y: 50 };

// This exercises the same plant-create, species registry, scene positions and
// idempotent care mutation called by the actual Home screen.
test("Aloe on the counter and a Rose in the front bed receive visits at their saved soil coordinates", () => {
  let data = createDemo();
  for (const [name, location] of [
    ["Aloe Vera", "Kitchen Countertop"],
    ["Rose", "Front Garden"],
  ]) {
    data = demoMutation(data, {
      kind: "plant.create",
      payload: {
        plant: {
          ...data.plants[0],
          id: undefined,
          name,
          scientific_name: "",
          common_name: name,
          location,
        },
        routines: [],
      },
    });
  }
  const drawables = gardenPlants(data.plants, data.categories);
  const aloe = drawables.find(
    (p) => p.name === "Aloe Vera" && p.placement?.room === "countertop",
  );
  const flower = drawables.find(
    (p) => p.name === "Rose" && p.placement?.room === "front-garden",
  );
  assert.equal(aloe?.model, "aloe");
  assert.equal(flower?.model, "rose");
  assert.ok(aloe?.placement && flower?.placement);
  const historyCount = data.history.length;
  const others = drawables.flatMap((p) => (p.placement ? [p.placement] : []));
  for (const sample of [aloe, flower]) {
    const placement = sample.placement!,
      target = surfacePoint(placement);
    const visit = planVisit(placement, "Water", others);
    assert.ok(visit);
    assert.deepEqual([visit.target[0], visit.target[2]], [target.x, target.z]);
    const walk = gardenerFrame(visit, visit.workStartsAt * 0.44);
    assert.ok(["arriving", "approaching"].includes(walk.phase));
    assert.equal(walk.effect, null);
    const pour = gardenerFrame(visit, visit.workStartsAt + 1.68);
    assert.equal(pour.phase, "working");
    assert.equal(pour.effect?.kind, "water");
    assert.ok(pour.effect);
    assert.ok(pour.effect.origin[1] > pour.effect.target[1] + 0.085);
    assert.ok(distance(pour.effect.target, visit.target) < 0.09);
    assert.equal(gardenerFrame(visit, visit.workCompleteAt).effect, null);
    assert.equal(data.history.length, historyCount);
  }
  const key = crypto.randomUUID();
  const complete = {
    kind: "care.record" as const,
    payload: {
      id: key,
      plant_id: flower.id,
      activity: "Water",
      expected_location: flower.placement,
    },
  };
  data = demoMutation(data, complete);
  assert.equal(data.history.length, historyCount + 1);
  assert.equal(
    data.history.find((h) => h.care_request_id === key)?.plant_id,
    flower.id,
  );
  assert.equal(
    data.history.find((h) => h.care_request_id === key)?.activity,
    "Water",
  );
  const reloaded = JSON.parse(
    JSON.stringify(demoMutation(data, complete)),
  ) as typeof data;
  assert.deepEqual(
    savedPlacement(reloaded.plants.find((p) => p.id === flower.id)!),
    flower.placement,
  );
  assert.equal(
    reloaded.history.filter((h) => h.care_request_id === key).length,
    1,
  );
});

test("every named room, shelf, sill and garden planting surface has a reachable care stance and downward pour", () => {
  for (const room of roomIds)
    for (const { x, y, label } of rooms[room].spots) {
      const p = { room, x, y };
      assert.ok(validPlacement(p), label);
      const visit = planVisit(p, "Water");
      assert.ok(visit, `${room} / ${label}`);
      assert.ok(distance(visit.target, visit.route[0]) > 0.38);
      const frame = gardenerFrame(visit, visit.workStartsAt + 1.75);
      assert.ok(frame.effect);
      assert.ok(frame.effect.origin[1] > frame.effect.target[1] + 0.085);
      assert.deepEqual(
        gardenerFrame(visit, visit.duration).position,
        visit.route[0],
      );
    }
  assert.equal(planVisit({ room: "living", x: 150, y: -10 }, "Water"), null);
});

test("the upper-floor route actually climbs the stair flight and enters through its landing", () => {
  const visit = planVisit({ room: "terrace", x: 79, y: 51 }, "Inspect");
  assert.ok(visit);
  const bottom = visit.route.findIndex(
    (p) => p[0] === STAIR.x && p[2] === STAIR.zStart,
  );
  assert.ok(bottom > 0 && bottom < visit.route.length - 2);
  assert.deepEqual(visit.route[bottom], [STAIR.x, STAIR.lowY, STAIR.zStart]);
  assert.deepEqual(visit.route[bottom + 1], [STAIR.x, STAIR.highY, STAIR.zEnd]);
  for (let i = 0; i < STAIR.steps; i++) {
    const z =
      STAIR.zStart + ((i + 0.5) * (STAIR.zEnd - STAIR.zStart)) / STAIR.steps;
    assert.equal(
      footSurface(STAIR.x, z, 2, false),
      STAIR.lowY + ((STAIR.highY - STAIR.lowY) * (i + 1)) / STAIR.steps,
    );
  }
  let last: Vec = visit.route[0];
  for (let t = 0; t < visit.duration; t += 0.13) {
    const current: Vec = gardenerFrame(visit, t).position;
    assert.ok(
      distance(last, current) <= 0.13 * 1.63 + 0.00001,
      "continuous walking at a human gait",
    );
    last = current;
  }
});

test("walk to the rear bed goes around the house, beyond other pots and through actual lawn and deck surfaces", () => {
  const blockedPot: Placement = { room: "patio", x: 77, y: 55 };
  const pot = surfacePoint(blockedPot),
    visit = planVisit({ room: "backyard", x: 50, y: 50 }, "Fertilize", [
      blockedPot,
    ]);
  assert.ok(visit);
  assert.equal(visit.route[0][1], GARDEN_HEIGHTS.patio);
  assert.equal(visit.stance[1], GARDEN_HEIGHTS.lawn);
  for (let i = 1; i < visit.route.length; i++) {
    const a: Vec = visit.route[i - 1],
      b: Vec = visit.route[i],
      count = Math.ceil(distance(a, b) / 0.065);
    for (let k = 0; k <= count; k++) {
      const t = k / count,
        x: number = a[0] + (b[0] - a[0]) * t,
        z: number = a[2] + (b[2] - a[2]) * t;
      assert.ok(walkable(x, z, "garden", 0.17));
      assert.ok(Math.hypot(x - pot.x, z - pot.z) > 0.42);
    }
  }
});

test("the animated human has separate rigged poses and tools for all five visits", () => {
  const actions: CareAction[] = [
    "Water",
    "Fertilize",
    "Prune",
    "Mist",
    "Inspect",
  ];
  const signatures = new Set<string>();
  for (const action of actions) {
    const plan = planVisit(rose, action);
    assert.ok(plan);
    const duration = plan.workCompleteAt - plan.workStartsAt;
    const middle = gardenerFrame(plan, plan.workStartsAt + duration * 0.52);
    const cloud = Array.from(
      { length: 12 },
      (_, i) =>
        gardenerFrame(plan, plan.workStartsAt + duration * (0.3 + i * 0.04))
          .effect?.kind,
    );
    assert.deepEqual(
      [...new Set(cloud.filter(Boolean))],
      action === "Water"
        ? ["water"]
        : action === "Mist"
          ? ["spray"]
          : action === "Fertilize"
            ? ["granules"]
            : [],
    );
    const points = middle.mesh.flatMap((face) => face.points);
    assert.ok(points.every((p) => p.every(Number.isFinite)));
    signatures.add(JSON.stringify(points.slice(-24)));
    assert.ok(middle.mesh.length < 1450);
    assert.ok(plan.workCompleteAt < plan.duration);
    assert.equal(
      gardenerFrame(plan, plan.workCompleteAt + 0.22).phase,
      "returning",
    );
    assert.equal(gardenerFrame(plan, plan.duration).phase, "idle");
  }
  assert.equal(signatures.size, actions.length);
  const idle = idleGardener([1, STAIR.lowY, 2], 0, 0).mesh.flatMap(
      (f) => f.points,
    ),
    ys = idle.map((p) => p[1]);
  assert.ok(
    Math.max(...ys) - Math.min(...ys) > 1.48 &&
      Math.max(...ys) - Math.min(...ys) < 1.8,
  );
});
