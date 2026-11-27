import test from "node:test";
import assert from "node:assert/strict";
import {
  HOUSE,
  SITE,
  EYE_HEIGHT,
  DOOR_HEIGHT,
  WALL_HEIGHT,
  GROUND_Y,
  UPPER_Y,
  elevations,
  cabinet,
  partitions,
} from "../lib/estate/plan";
import { buildWallShell, wallVolumes } from "../lib/estate/envelope";
import {
  buildEnvironment,
  walkStructure,
  walkRoof,
  walkLandscape,
} from "../lib/estate/buildings";
import { advancePlayer, makePlayer, type Player } from "../lib/estate/player";
import {
  advanceFlight,
  EYE_RADIUS,
  eyeCamera,
  FlightCollision,
  landFromFlight,
  standingEye,
  type Flight,
} from "../lib/estate/first-person";
import { faceNormal, type Mesh, type Vec } from "../lib/estate/mesh";
import { cameraBasis, EXPLORE_FOV } from "../lib/estate/renderer";
import { bindMouseLook } from "../lib/estate/pointer-look";

test("the surveyed house and lawn share their centre and every full-height opening is cut from the wall", () => {
  assert.equal(HOUSE.x + HOUSE.width / 2, SITE.x + SITE.width / 2);
  assert.equal(HOUSE.z + HOUSE.depth / 2, SITE.z + SITE.depth / 2);
  assert.equal(WALL_HEIGHT, 2.82);
  assert.equal(DOOR_HEIGHT, 2.1);
  const westHall = partitions.find((r) => r.x === 4.28)!;
  assert.ok(cabinet.x - (westHall.x + westHall.width) > 1.199);
  for (const floor of ["ground", "upper"] as const) {
    const base = floor === "ground" ? GROUND_Y : UPPER_Y,
      volumes = wallVolumes(floor, false, true);
    const occupied = (p: Vec) =>
      volumes.some((v) =>
        p.every((n, d) => n > v.lo[d] - 1e-9 && n < v.hi[d] + 1e-9),
      );
    for (const f of elevations[floor])
      for (const o of f.openings) {
        const at = (h: number): Vec =>
          f.axis === "x"
            ? [o.a + o.w / 2, base + h, f.pos]
            : [f.pos, base + h, o.a + o.w / 2];
        assert.ok(
          !occupied(at(o.lo + 0.005)) && !occupied(at(o.lo + o.h - 0.005)),
        );
        assert.ok(occupied(at(o.lo + o.h + 0.005)));
        if (o.door) assert.ok(o.w >= 1 && o.h === DOOR_HEIGHT);
        else assert.ok(o.lo >= 0.85 && o.lo <= 1.12);
      }
    const mesh: Mesh = [];
    buildWallShell(mesh, volumes);
    const surfaces = new Set<string>();
    for (const f of mesh) {
      const n = faceNormal(f.points);
      // Sample inside the first triangle as quad centres may lie exactly on another grid line.
      const sample = f.points[0].map(
        (v, d) => 0.23 * v + 0.41 * f.points[1][d] + 0.36 * f.points[2][d],
      ) as Vec;
      assert.ok(occupied(sample.map((v, d) => v - n[d] * 0.001) as Vec));
      assert.ok(!occupied(sample.map((v, d) => v + n[d] * 0.001) as Vec));
      const key = f.points
        .map((v) => JSON.stringify(v))
        .sort()
        .join(";");
      assert.ok(!surfaces.has(key));
      surfaces.add(key);
    }
  }
  const g = buildEnvironment("garden", "low");
  assert.deepEqual(
    new Set(g.map((f) => f.group)),
    new Set(["yard", "walls", "windows", "house", "roof"]),
  );
});

test("the fenced garden and potting tools contain no repeated surface triangles", () => {
  const unique = new Set<string>();
  for (const f of walkLandscape("balanced")) {
    const vertices = f.points.map((p) =>
      p.map((n) => Math.round(n * 10000)).join(","),
    );
    for (let i = 1; i < vertices.length - 1; i++) {
      const key = [vertices[0], vertices[i], vertices[i + 1]].sort().join("|");
      assert.ok(
        !unique.has(key),
        "Duplicate triangle at " + f.center.join(","),
      );
      unique.add(key);
    }
  }
});
test("walking forward from the default viewpoint enters the front door, with a stable 1.65m lens on both storeys", () => {
  const p = makePlayer();
  for (let i = 0; i < 120; i++)
    advancePlayer(p, { right: 0, forward: 1, brisk: false }, 0, 1 / 60, []);
  assert.equal(p.floor, "ground");
  const storeys: Player[] = [
    p,
    makePlayer({ position: [2, UPPER_Y, 4], floor: "upper", yaw: 0 }),
  ];
  for (const walker of storeys)
    for (const pitch of [-1.43, 0, 1.43]) {
      const camera = eyeCamera(standingEye(walker), 4.2, pitch);
      assert.deepEqual(cameraBasis(camera).eye, standingEye(walker));
      assert.equal(camera.fov, EXPLORE_FOV);
      assert.ok(
        Math.abs(cameraBasis(camera).eye[1] - walker.position[1] - EYE_HEIGHT) <
          1e-12,
      );
    }
});
const building = new FlightCollision([walkStructure("low"), walkRoof("low")]);
const drive = (
  f: Flight,
  seconds: number,
  forward: number,
  lift: number,
  hz = 60,
  brisk = false,
) => {
  for (let i = 0; i < Math.round(seconds * hz); i++)
    advanceFlight(f, { right: 0, forward, lift, brisk }, 0, 0, 1 / hz, (p) =>
      building.allows(p),
    );
};
test("flight clears the open door at eye height and stops at the lintel, window, ceiling and ground", () => {
  const at = (eye: Vec): Flight => ({ eye, velocity: [0, 0, 0] });
  const entrance = at([4.85, 1.65, 9.8]);
  drive(entrance, 1, 1, 0);
  assert.ok(entrance.eye[2] < 8);
  const header = at([4.85, 2.55, 9.8]);
  drive(header, 1, 1, 0);
  assert.ok(header.eye[2] > 8.5);
  const window = at([2, 1.65, 9.6]);
  drive(window, 1, 1, 0);
  assert.ok(window.eye[2] > 8.4);
  const ceiling = at([7.5, 1.65, 7.2]);
  drive(ceiling, 1.5, 0, 1);
  assert.ok(ceiling.eye[1] < GROUND_Y + WALL_HEIGHT - EYE_RADIUS + 0.001);
  const lawn = at([6, 2, 14]);
  drive(lawn, 2, 0, -1);
  assert.ok(lawn.eye[1] >= EYE_RADIUS && lawn.eye[1] < EYE_RADIUS + 0.03);
  assert.ok(!building.allows([SITE.x, 1.65, 5]));
});
test("flight distance and sprint are independent of display rate and a roof blocks landing through it", () => {
  const runs = [30, 60, 120].map((hz) => {
    const p: Flight = { eye: [6, 5, 15], velocity: [0, 0, 0] };
    drive(p, 0.8, 1, 0, hz, true);
    return p.eye[2];
  });
  assert.ok(Math.max(...runs) - Math.min(...runs) < 0.005);
  const slow: Flight = { eye: [6, 5, 15], velocity: [0, 0, 0] };
  drive(slow, 0.8, 1, 0);
  assert.ok(15 - runs[0] > (15 - slow.eye[2]) * 1.8);
  const allows = (v: Vec) => building.allows(v);
  assert.equal(landFromFlight([6, 4, 14], 0, [], allows)?.floor, "garden");
  assert.equal(landFromFlight([7.5, 2, 7.2], 0, [], allows)?.floor, "ground");
  assert.equal(landFromFlight([8, 6, 4.25], 0, [], allows)?.floor, "upper");
  assert.equal(landFromFlight([7.5, 4, 7.2], 0, [], allows), null);
});
test("pointer look handles capture, relative deltas, Escape, denial and disposal", async () => {
  class PointerDocument extends EventTarget {
    pointerLockElement: unknown = null;
    exitPointerLock() {
      this.pointerLockElement = null;
      this.dispatchEvent(new Event("pointerlockchange"));
    }
  }
  const doc = new PointerDocument();
  let enabled = true,
    refuse = false,
    captures = 0;
  const updates: boolean[][] = [],
    turns: number[][] = [];
  const host = {
    ownerDocument: doc,
    requestPointerLock() {
      captures++;
      if (refuse) return Promise.reject(Error("capture denied"));
      doc.pointerLockElement = host;
      doc.dispatchEvent(new Event("pointerlockchange"));
    },
  };
  const look = bindMouseLook(
    host as unknown as HTMLElement,
    () => enabled,
    (x, y) => turns.push([x, y]),
    (locked, denied) => updates.push([locked, denied]),
  );
  const move = () =>
    doc.dispatchEvent(
      Object.assign(new Event("mousemove"), { movementX: 10, movementY: -5 }),
    );
  move();
  assert.equal(turns.length, 0);
  look.capture();
  move();
  assert.deepEqual(updates.at(-1), [true, false]);
  assert.ok(Math.abs(turns[0][0] - 0.021) < 1e-8 && turns[0][1] < 0);
  doc.exitPointerLock();
  move();
  assert.equal(turns.length, 1);
  refuse = true;
  look.capture();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(updates.at(-1), [false, true]);
  enabled = false;
  look.capture();
  assert.equal(captures, 2);
  look.dispose();
  move();
  assert.equal(turns.length, 1);
});
