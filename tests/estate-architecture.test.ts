import assert from "node:assert/strict";
import test from "node:test";
import { createDemo, demoMutation } from "../lib/demo";
import {
  allocateLegacyPlacement,
  findPlacement,
  inSoil,
  rooms,
  roomIds,
  roomFloor,
  roomSurfaceY,
  specimenScale,
  surfacePoint,
  validPlacement,
  visibleOnLevel,
  type Placement,
} from "../lib/home";
import { buildEnvironment, buildPlants } from "../lib/estate/buildings";
import { gardenPlants } from "../lib/estate/garden";
import { walkable } from "../lib/estate/layout";
import { STAIR } from "../lib/estate/plan";
import type { Face } from "../lib/estate/mesh";

function supportedByFace(face: Face, x: number, y: number, z: number) {
  if (!face.points.every((p) => Math.abs(p[1] - y) < 0.004)) return false;
  let sign = 0;
  for (let i = 0; i < face.points.length; i++) {
    const a = face.points[i],
      b = face.points[(i + 1) % face.points.length];
    const d = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
    if (Math.abs(d) < 1e-7) continue;
    if (sign && Math.sign(d) !== sign) return false;
    sign = Math.sign(d);
  }
  return true;
}
test("all curated placement presets are valid and sit on modeled support faces", () => {
  const meshes = {
    garden: buildEnvironment("garden", "low"),
    ground: buildEnvironment("ground", "low"),
    upper: buildEnvironment("upper", "low"),
  };
  for (const room of roomIds) {
    for (const spot of rooms[room].spots) {
      const p = { room, x: spot.x, y: spot.y };
      assert.ok(validPlacement(p), room + " " + spot.label);
      const { x, y, z } = surfacePoint(p);
      assert.ok(
        meshes[roomFloor(room)].some((face) => supportedByFace(face, x, y, z)),
        room + " " + spot.label + " has a real modeled support plane",
      );
    }
  }
});
test("surfaces allocate vacant physical coordinates, preserve safe manual sites, and handle full counters", () => {
  const occupied: Placement[] = [];
  let p: Placement | null;
  while ((p = findPlacement("Kitchen Countertop", occupied))) {
    assert.equal(p.room, "countertop");
    const world = surfacePoint(p);
    for (const previous of occupied) {
      const other = surfacePoint(previous);
      assert.ok(
        Math.hypot(world.x - other.x, world.z - other.z) >=
          specimenScale(p.room) * 1.6,
      );
    }
    occupied.push(p);
  }
  assert.ok(occupied.length >= 2);
  assert.equal(findPlacement("Kitchen Countertop", occupied), null);
  const spilled = allocateLegacyPlacement("Kitchen Countertop", occupied);
  assert.ok(spilled && spilled.room !== "countertop");
  assert.equal(findPlacement("counter", [], occupied[0]), occupied[0]);
  const unsafe: Placement = { room: "bedroom", x: 21, y: 31 };
  assert.equal(validPlacement(unsafe), false);
  const relocated = findPlacement("bedroom", [], unsafe);
  assert.ok(relocated && validPlacement(relocated));
});
test("Aloe on the working counter and Rose in the front soil follow the existing create, edit and reload flow", () => {
  let data = createDemo();
  const source = data.plants[0];
  function create(name: string, location: string) {
    data = demoMutation(data, {
      kind: "plant.create",
      payload: {
        plant: {
          ...source,
          id: undefined,
          name,
          common_name: name,
          scientific_name: "",
          location,
        },
        routines: [],
      },
    });
    return data.plants.at(-1)!.id;
  }
  const aloe = create("Aloe vera", "Kitchen countertop"),
    rose = create("Rose", "Front garden");
  const scene = () => gardenPlants(data.plants, data.categories);
  const get = (id: string) => scene().find((v) => v.id === id)!;
  assert.equal(get(aloe).model, "aloe");
  assert.equal(get(rose).model, "rose");
  const a = get(aloe).placement!,
    r = get(rose).placement!;
  assert.equal(a.room, "countertop");
  assert.equal(roomSurfaceY(a.room), 1.12);
  assert.equal(inSoil(r.room), true);
  assert.deepEqual(
    buildPlants("ground", scene(), "", null).positions.get(aloe),
    surfacePoint(a),
  );
  assert.deepEqual(
    buildPlants("garden", scene(), "", null).positions.get(rose),
    surfacePoint(r),
  );
  assert.equal(
    buildPlants("garden", scene(), "", null).positions.has(aloe),
    false,
  );
  const row = data.plants.find((p) => p.id === rose)!;
  data = demoMutation(data, {
    kind: "plant.save",
    payload: { ...row, location: "Backyard" },
  });
  data = JSON.parse(JSON.stringify(data));
  const moved = get(rose).placement!;
  assert.equal(moved.room, "backyard");
  assert.notDeepEqual(surfacePoint(moved), surfacePoint(r));
  assert.deepEqual(get(aloe).placement, a);
  assert.equal(visibleOnLevel("garden", "studio"), false);
  assert.equal(visibleOnLevel("dollhouse", "studio"), true);
});
test("door passages, stair landings and ground-floor furniture have matching walking clearance", () => {
  for (const [x, z] of [
    [4.85, 8.49],
    [4.56, 0.01],
    [10, 5.9],
    [2.5, 4.38],
    [STAIR.x, STAIR.zStart + 0.33],
  ]) {
    assert.ok(walkable(x, z, "ground"), x + "," + z);
  }
  assert.ok(walkable(STAIR.x, STAIR.zEnd - 0.25, "upper"));
  assert.equal(walkable(STAIR.x, 2.3, "upper"), false);
  assert.equal(walkable(1.1, 1.4, "ground"), false);
  assert.equal(walkable(1.1, 8.45, "ground"), false);
});
