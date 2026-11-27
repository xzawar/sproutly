import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, demoMutation } from "../lib/demo";
import {
  gardenPlants,
  modelFor,
  potPosition,
  roomLevel,
  type Species,
} from "../lib/estate/garden";
import { buildScene } from "../lib/estate/buildings";
import { specimen } from "../lib/estate/specimens";
import {
  cameraBasis,
  floorAt,
  initialCamera,
  pickOwner,
} from "../lib/estate/renderer";
import type { Mesh, Vec } from "../lib/estate/mesh";
test("each managed plant occupies its saved floor through create, archive, restore and recategorization", () => {
  const data = createDemo(),
    source = data.plants[0],
    payload = {
      ...source,
      id: undefined,
      name: "New specimen",
      common_name: "",
      scientific_name: "",
      category_id: data.categories.find((c) => c.name === "Herbs")!.id,
    };
  let next = demoMutation(data, {
    kind: "plant.create",
    payload: { plant: payload, routines: [] },
  });
  const p = next.plants.at(-1)!;
  const list = () => gardenPlants(next.plants, next.categories);
  assert.equal(list().find((v) => v.id === p.id)?.model, "herb");
  assert.equal(
    buildScene("dollhouse", list(), "", null).positions.size,
    data.plants.length + 1,
  );
  assert.equal(
    buildScene("garden", list(), "", null).positions.has(p.id),
    false,
  );
  next = demoMutation(next, {
    kind: "plant.save",
    payload: {
      ...p,
      category_id: data.categories.find((c) => c.name === "Flowering")!.id,
    },
  });
  assert.equal(list().find((v) => v.id === p.id)?.model, "flower");
  next = demoMutation(next, {
    kind: "plant.place",
    payload: { id: p.id, placement: { room: "terrace", x: 50, y: 50 } },
  });
  assert.ok(buildScene("upper", list(), "", null).positions.has(p.id));
  assert.equal(
    buildScene("ground", list(), "", null).positions.has(p.id),
    false,
  );
  assert.ok(buildScene("garden", list(), "", null).positions.has(p.id));
  next = demoMutation(next, { kind: "plant.archive", payload: { id: p.id } });
  assert.equal(
    list().some((v) => v.id === p.id),
    false,
  );
  next = demoMutation(next, {
    kind: "plant.restore",
    payload: { id: p.id, schedule_ids: [] },
  });
  assert.ok(buildScene("upper", list(), "", null).positions.has(p.id));
});
test("twelve three-dimensional plants, custom categories and layout beyond the first row", () => {
  const models: Species[] = [
    "monstera",
    "sword",
    "lily",
    "aloe",
    "herb",
    "flower",
    "cactus",
    "tree",
    "vegetable",
    "fern",
    "vine",
    "broadleaf",
  ];
  for (const model of models) {
    const mesh: Mesh = [];
    specimen(mesh, 0, 0, 0, model, "p");
    assert.ok(mesh.length > 60);
    const points = mesh.flatMap((f) => f.points);
    for (const i of [0, 1, 2])
      assert.ok(
        Math.max(...points.map((p) => p[i])) -
          Math.min(...points.map((p) => p[i])) >
          0.5,
      );
  }
  assert.equal(
    new Set(
      Array.from({ length: 49 }, (_, i) => JSON.stringify(potPosition(i, 49))),
    ).size,
    49,
  );
  assert.equal(
    modelFor(
      { name: "Pat", common_name: "", scientific_name: "" },
      "My favorites",
    ),
    "broadleaf",
  );
  assert.equal(
    modelFor(
      {
        name: "Pat",
        common_name: "",
        scientific_name: "Spathiphyllum wallisii",
      },
      "Indoor",
    ),
    "lily",
  );
});
test("floor hit-testing follows the perspective camera and active level; objects occlude plants behind them", () => {
  const camera = initialCamera("upper", 2, 1.6);
  camera.target = [3, 0.15, 3];
  assert.equal(floorAt(camera, 1.6, 0, 0, "upper")?.room, "studio");
  assert.equal(floorAt(camera, 1.6, 0, 0, "ground")?.room, "bedroom");
  assert.equal(floorAt(camera, 1.6, 0, 0, "garden"), null);
  assert.equal(roomLevel("terrace"), "upper");
  const { right, up, back } = cameraBasis(camera);
  const vertices = (depth: number): Vec[] =>
    [
      [-1, -1],
      [1, -1],
      [0, 1],
    ].map(
      ([x, y]) =>
        camera.target.map(
          (v, i) => v + right[i] * x + up[i] * y + back[i] * depth,
        ) as Vec,
    );
  const mesh: Mesh = [
    {
      points: vertices(0),
      rgb: [0, 0, 0],
      center: camera.target,
      owner: "plant",
    },
  ];
  assert.equal(pickOwner(mesh, camera, 1.6, 0, 0), "plant");
  mesh.push({
    points: vertices(1),
    rgb: [0, 0, 0],
    center: camera.target,
    owner: "",
  });
  assert.equal(pickOwner(mesh, camera, 1.6, 0, 0), "");
});
