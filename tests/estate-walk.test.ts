import test from "node:test";
import assert from "node:assert/strict";
import {
  advancePlayer,
  clearFollowDistance,
  followCamera,
  makePlayer,
  nearbyPlants,
  smoothCamera,
  walkArea,
  walkPlants,
  type Player,
  type WalkPlant,
} from "../lib/estate/player";
import { planVisit, gardenerFrame } from "../lib/estate/gardener";
import { EYE_HEIGHT, GARDEN_HEIGHTS } from "../lib/estate/plan";
import { walkable, STAIR } from "../lib/estate/layout";
import { rooms, surfacePoint, type Placement } from "../lib/home";
import type { Vec } from "../lib/estate/mesh";
import {
  Explorer,
  type ExplorerProps,
  type VisitResult,
} from "../lib/estate/explorer";
import { createDemo, demoMutation } from "../lib/demo";
import { gardenPlants } from "../lib/estate/garden";

const still = { right: 0, forward: 0, brisk: false };
function travel(
  player: Player,
  x: number,
  z: number,
  seconds: number,
  fps = 60,
  plants: WalkPlant[] = [],
) {
  for (let i = 0; i < Math.round(seconds * fps); i++)
    advancePlayer(
      player,
      { right: x, forward: -z, brisk: false },
      0,
      1 / fps,
      plants,
    );
}
const at = (position: Vec, floor: Player["floor"]) =>
  makePlayer({ position, floor, yaw: Math.PI });

test("walk through both doors, cross the hallway and return from the backyard", () => {
  const p = at([4.8, GARDEN_HEIGHTS.lawn, 10.65], "garden");
  travel(p, 0, -1, 1.7);
  assert.equal(p.floor, "ground");
  assert.equal(walkArea(p), "Hallway");
  travel(p, 0, -1, 4.8);
  assert.equal(walkArea(p), "Backyard");
  assert.equal(p.position[1], GARDEN_HEIGHTS.lawn);
  travel(p, 0, 1, 1.8);
  assert.equal(p.floor, "ground");
  travel(p, 0, 1, 4.4);
  assert.equal(p.floor, "garden");
  assert.ok(p.position[2] > 8.55);
  assert.ok(
    walkable(makePlayer().position[0], makePlayer().position[2], "garden"),
  );
});
test("stairs support continuous ascent, both landings and descent without slipping through the sides", () => {
  const p = at([STAIR.x, 0.18, STAIR.zStart + 0.6], "ground");
  let last = 0.18;
  for (let i = 0; i < 98; i++) {
    travel(p, 0, -1, 1 / 60);
    assert.ok(p.position[1] >= last);
    assert.ok(p.position[1] - last < 0.04);
    last = p.position[1];
  }
  assert.equal(p.floor, "stairs");
  travel(p, 1, 0, 0.7);
  assert.equal(p.floor, "stairs");
  assert.ok(p.position[0] < STAIR.x + 0.32);
  travel(p, 0, -1, 1.9);
  assert.equal(p.floor, "upper");
  assert.equal(p.position[1], 3.18);
  const landing = [...p.position];
  travel(p, -1, 0, 0.4);
  assert.equal(p.floor, "upper");
  assert.ok(p.position[0] < landing[0] - 0.4);
  travel(p, 1, 0, 0.4);
  travel(p, 0, 0, 0.4);
  travel(p, 0, 1, 3);
  assert.equal(p.floor, "ground");
  assert.equal(p.position[1], 0.18);
  const byGap = at([3.0, 0.18, 2.4], "ground");
  travel(byGap, 1, 0, 1);
  assert.equal(byGap.floor, "ground");
  assert.ok(byGap.position[0] < 3.09);
});
test("feet slide along solid walls and stop outside beds, pots and the potting bench", () => {
  const wall = at([0.7, 0.18, 3.3], "ground");
  travel(wall, -1, -0.5, 0.55);
  assert.ok(wall.position[0] >= 0.31);
  assert.ok(wall.position[2] < 3.19);
  const bed = at([5, GARDEN_HEIGHTS.lawn, 14], "garden");
  travel(bed, 0, -1, 2);
  assert.ok(bed.position[2] > 12.92);
  assert.ok(bed.stride < 1.2);
  const court = at([13, GARDEN_HEIGHTS.lawn, 12], "garden");
  travel(court, 0, -1, 1.2);
  assert.equal(walkArea(court), "Potting pergola");
  assert.ok(court.position[2] > 11.14);
  const place: Placement = { room: "living", ...rooms.living.spots[0] },
    planted = walkPlants([{ id: "p", placement: place }]);
  const point = surfacePoint(place);
  const p = at([point.x, point.y, point.z + 0.9], "ground");
  travel(p, 0, -1, 1, 60, planted);
  assert.ok(
    Math.hypot(p.position[0] - point.x, p.position[2] - point.z) >=
      planted[0].radius,
  );
});
test("walking is camera-relative, diagonals maintain speed, release brakes, and frame rate preserves pace", () => {
  const p = at([5, GARDEN_HEIGHTS.lawn, 14], "garden"),
    q = at([5, GARDEN_HEIGHTS.lawn, 14], "garden"),
    diagonal = at([5, GARDEN_HEIGHTS.lawn, 14], "garden");
  travel(p, 1, 0, 0.6, 30);
  travel(q, 1, 0, 0.6, 120);
  travel(diagonal, 1, 1, 0.6);
  assert.ok(Math.abs(p.stride - q.stride) < 0.002);
  assert.ok(Math.abs(p.stride - diagonal.stride) < 0.01);
  const rotated = at([5, GARDEN_HEIGHTS.lawn, 14], "garden");
  for (let i = 0; i < 36; i++)
    advancePlayer(rotated, { ...still, forward: 1 }, Math.PI / 2, 1 / 60, []);
  assert.ok(
    rotated.position[0] < 4.2 && Math.abs(rotated.position[2] - 14) < 0.001,
  );
  const end = p.position[0];
  travel(p, 0, 0, 0.5);
  assert.equal(p.vx, 0);
  assert.ok(p.position[0] - end < 0.12);
});
test("camera follows the shortest arc at 30, 60 and 120 Hz and retracts before solid walls", () => {
  const open = at([7, GARDEN_HEIGHTS.lawn, 14], "garden"),
    from = followCamera(open, Math.PI - 0.05, 0.28, 3.8);
  const to = { ...from, yaw: -Math.PI + 0.05, distance: 2 };
  const distances = [30, 60, 120].map((hz) => {
    let c = from;
    for (let i = 0; i < hz * 0.2; i++) c = smoothCamera(c, to, 1 / hz);
    assert.ok(c.yaw > Math.PI - 0.05 && c.yaw < Math.PI + 0.05);
    return c.distance;
  });
  assert.ok(Math.max(...distances) - Math.min(...distances) < 0.00001);
  const c = {
    target: [0.53, 1.24, 3.15] as Vec,
    yaw: -Math.PI / 2,
    pitch: 0,
    distance: 3.6,
  };
  assert.ok(clearFollowDistance(c, "ground") < 0.4);
  assert.equal(
    clearFollowDistance(
      { ...c, target: [5, 1.24, 15], yaw: Math.PI / 2 },
      "garden",
    ),
    3.6,
  );
  const aim = followCamera(open, 0.4, 0.28, 3.65);
  open.stride = 1.45;
  open.gait = 0.9;
  assert.deepEqual(followCamera(open, 0.4, 0.28, 3.65), aim);
});
test("the follow camera clears the entrance arbor and has an unobstructed garden starting view", () => {
  const besideGate = at([0.2, GARDEN_HEIGHTS.lawn, 14.2], "garden");
  const gateView = followCamera(besideGate, 2.6 + Math.PI, 0.3, 3.65);
  assert.ok(clearFollowDistance(gateView, "garden") < gateView.distance - 0.25);
  const initial = makePlayer(),
    garden = followCamera(initial, initial.yaw + Math.PI, 0.22, 3.65);
  assert.equal(clearFollowDistance(garden, "garden"), garden.distance);
});
test("each manual care action uses the reachable plant, tool and existing stance through completion", () => {
  const place: Placement = { room: "front-garden", x: 26, y: 50 },
    route = planVisit(place, "Water")!;
  const p = at(route.stance, "garden"),
    plants = walkPlants([
      { id: "rose", placement: place },
      { id: "aloe", placement: { room: "countertop", x: 50, y: 50 } },
    ]);
  assert.deepEqual(nearbyPlants(p, plants), ["rose"]);
  for (const action of [
    "Water",
    "Prune",
    "Mist",
    "Inspect",
    "Fertilize",
  ] as const) {
    const visit = planVisit(place, action, [], p)!;
    assert.deepEqual(visit.route, [p.position]);
    assert.equal(visit.walkDuration, 0);
    for (const t of [0, 0.55, visit.workStartsAt + 1.6, visit.duration])
      assert.deepEqual(gardenerFrame(visit, t).position, p.position);
    const pose = gardenerFrame(visit, visit.workStartsAt + 1.65);
    assert.equal(pose.phase, "working");
    if (action === "Water") assert.equal(pose.effect?.kind, "water");
  }
  assert.equal(planVisit(place, "Water", [], { ...p, floor: "upper" }), null);
  assert.equal(
    planVisit(place, "Water", [], at([13, GARDEN_HEIGHTS.lawn, 14], "garden")),
    null,
  );
  const counter = plants[1],
    forbidden = at([counter.x, 0.18, counter.z - 0.3], "ground");
  assert.ok(!nearbyPlants(forbidden, plants).includes("aloe"));
});
test("the viewer tends in place, writes once on completion, resumes walking and exits to the map", async (t) => {
  const canvas = {
    width: 80,
    height: 54,
    dataset: {} as Record<string, string>,
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    getContext(type: string) {
      return type === "2d"
        ? {
            createImageData: (w: number, h: number) => ({
              width: w,
              height: h,
              data: new Uint8ClampedArray(w * h * 4),
            }),
            putImageData() {},
          }
        : null;
    },
  };
  const host = { clientWidth: 80, clientHeight: 54, replaceChildren() {} };
  const media = {
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  };
  let now = performance.now(),
    seq = 0;
  t.mock.method(performance, "now", () => now);
  const frames = new Map<number, FrameRequestCallback>();
  const shims: Record<string, unknown> = {
    window: { matchMedia: () => media, devicePixelRatio: 1 },
    document: {
      hidden: false,
      createElement: () => canvas,
      addEventListener() {},
      removeEventListener() {},
    },
    matchMedia: () => media,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (f: FrameRequestCallback) => {
      frames.set(++seq, f);
      return seq;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const cleanup: Array<() => void> = [];
  t.after(() => {
    for (const undo of cleanup.reverse()) undo();
  });
  for (const [name, value] of Object.entries(shims)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    cleanup.push(() => {
      if (old) Object.defineProperty(globalThis, name, old);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  function tick(step = 100) {
    now += step;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const f of callbacks) f(now);
  }
  let data = createDemo(),
    plants = gardenPlants(data.plants, data.categories);
  const selected = plants.find((p) => p.placement?.room === "kitchen")!;
  const outcomes: VisitResult[] = [];
  let saves = 0,
    chosen = "",
    near: string[] = [];
  const props: ExplorerProps = {
    level: "ground",
    plants,
    selected: selected.id,
    draft: null,
    moving: false,
    mode: "plant",
    quality: "low",
    onPlace() {},
    onPick: (id) => {
      chosen = id;
    },
    onWalkContext: ({ ids }) => {
      near = ids;
    },
    onVisitEnd: (_, result) => outcomes.push(result),
    onWorkComplete: async (key) => {
      saves++;
      data = demoMutation(data, {
        kind: "care.record",
        payload: {
          id: key,
          plant_id: selected.id,
          activity: "Water",
          expected_location: selected.placement!,
        },
      });
      return true;
    },
  };
  const scene = new Explorer(host as unknown as HTMLElement, props, () =>
    assert.fail("Renderer failed"),
  );

  cleanup.push(() => scene.dispose());
  const walk: ExplorerProps = { ...props, mode: "walk" };
  scene.configure(walk);
  tick();
  tick();
  assert.ok(near.includes(selected.id));
  scene.tendNearest();
  assert.equal(chosen, selected.id);
  const start = canvas.dataset.walkPosition,
    key = crypto.randomUUID();
  const visit = { key, plantId: selected.id, action: "Water" as const };
  scene.configure({ ...walk, visit });
  scene.configure({ ...walk, visit });
  scene.setWalkKey("w", true);
  for (let i = 0; i < 20; i++) tick();
  assert.equal(saves, 0);
  assert.equal(canvas.dataset.walkPosition, start);
  const phases = new Set<string>();
  for (let i = 0; i < 62; i++) {
    tick();
    phases.add(canvas.dataset.carePhase);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.ok(phases.has("working"));
  assert.equal(saves, 1);
  assert.deepEqual(outcomes, ["completed"]);
  assert.equal(data.history.filter((h) => h.care_request_id === key).length, 1);
  plants = gardenPlants(data.plants, data.categories);
  scene.configure({ ...walk, plants, visit: null });
  tick();
  assert.equal(canvas.dataset.walkPosition, start);
  scene.setWalkKey("s", true);
  for (let i = 0; i < 9; i++) tick();
  scene.setWalkKey("s", false);
  assert.notEqual(canvas.dataset.walkPosition, start);
  scene.configure({ ...props, mode: "overview" });
  tick();
  assert.equal(canvas.dataset.walkArea, undefined);
  assert.equal(scene.setWalkKey("w", true), false);
  // After reading the inspector for a while, the first drag still eases from the displayed view.
  media.matches = false;
  tick(1500);
  tick();
  now += 5000;
  const yaw = () => Reflect.get(scene, "camera").yaw as number;
  const previous = yaw();
  scene.rotate(-0.8, 0);
  tick(16);
  assert.ok(yaw() - previous > 0.01 && yaw() - previous < 0.23);
  for (let i = 0; i < 60; i++) tick(16);
  assert.ok(Math.abs(yaw() - previous - 0.8) < 0.001);

  await t.test(
    "walk and fly from an exterior orbit and restore its framing",
    () => {
      const exterior: ExplorerProps = {
        ...props,
        selected: "",
        mode: "overview",
        level: "garden",
      };
      scene.configure(exterior);
      tick(700);
      scene.rotate(-0.31, 0.08);
      scene.zoom(0.91);
      for (let i = 0; i < 90; i++) tick(16);
      const orbit = structuredClone(Reflect.get(scene, "camera"));
      const eyes: ExplorerProps = {
        ...exterior,
        mode: "walk",
        walkView: "eyes",
      };
      const vector = (field: string) =>
        canvas.dataset[field].split(",").map(Number);
      scene.configure(eyes);
      tick(16);
      const foot = vector("walkPosition"),
        eye = vector("cameraEye");
      assert.equal(canvas.dataset.walkView, "eyes");
      assert.ok(Math.abs(eye[1] - foot[1] - EYE_HEIGHT) < 0.002);
      scene.configure({ ...eyes, walkView: "fly" });
      assert.equal(scene.setWalkKey("e", true), true);
      for (let i = 0; i < 6; i++) tick(50);
      assert.equal(canvas.dataset.walkView, "fly");
      assert.deepEqual(vector("walkPosition"), foot);
      assert.ok(vector("cameraEye")[1] > eye[1] + 0.2);
      // Switching modes while a key is down must release it.
      scene.configure(eyes);
      tick(16);
      const landed = vector("cameraEye");
      assert.ok(
        Math.abs(landed[1] - vector("walkPosition")[1] - EYE_HEIGHT) < 0.002,
      );
      assert.equal(scene.setWalkKey("e", false), false);
      scene.configure(exterior);
      tick(16);
      assert.equal(canvas.dataset.walkView, undefined);
      assert.equal(scene.setWalkKey("w", true), false);
      const resumed = Reflect.get(scene, "camera");
      assert.ok(Math.abs(resumed.distance - orbit.distance) < 0.002);
      assert.ok(Math.abs(resumed.yaw - orbit.yaw) < 0.002);
      assert.deepEqual(resumed.target, orbit.target);
    },
  );
});
