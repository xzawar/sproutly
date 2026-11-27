import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraBasis,
  dot,
  initialCamera,
  clipLens,
  geometryBounds,
  softwarePainter,
} from "../lib/estate/renderer";
import { buildEnvironment } from "../lib/estate/buildings";
import { automaticQuality } from "../lib/estate/explorer";
import { box, face, type Mesh, type Vec } from "../lib/estate/mesh";

test("exterior camera keeps the entire modeled garden inside phone and desktop viewports", () => {
  const scene = buildEnvironment("garden", "balanced");
  for (const aspect of [0.48, 1, 2.2]) {
    const camera = initialCamera("garden", 0, aspect);
    const { right, up, back, eye } = cameraBasis(camera);
    let left = Infinity,
      bottom = Infinity,
      rightEdge = -Infinity,
      top = -Infinity;
    for (const face of scene)
      for (const p of face.points) {
        const v = p.map((n, i) => n - eye[i]) as Vec;
        const depth = -dot(back, v) * Math.tan(Math.PI / 9);
        const x = dot(right, v) / (depth * aspect),
          y = dot(up, v) / depth;
        left = Math.min(left, x);
        rightEdge = Math.max(rightEdge, x);
        bottom = Math.min(bottom, y);
        top = Math.max(top, y);
      }
    assert.ok(
      left >= -1 && bottom >= -1 && rightEdge <= 1 && top <= 1,
      JSON.stringify({ aspect, left, rightEdge, bottom, top }),
    );
    assert.ok(
      Math.max(rightEdge - left, top - bottom) > 1.55,
      "The fitted model uses the available space",
    );
  }
});
test("automatic quality scales down for software, touch-constrained and smaller-memory devices", () => {
  assert.equal(automaticQuality(false, 16, 16, false), "low");
  assert.equal(automaticQuality(true, 8, 4, true), "low");
  assert.equal(automaticQuality(true, 4, 8, false), "low");
  assert.equal(automaticQuality(true, 8, 8, false), "balanced");
});

test("a lens corner retracts before visible trim even when a ray through the center misses", () => {
  const trim: Mesh = [];
  box(trim, 0.11, 0.87, 1.5, 0.2, 0.28, 0.12, "#728773");
  const layers = [{ mesh: trim, bounds: geometryBounds(trim) }];
  const camera = { yaw: 0, pitch: 0, distance: 3.5, target: [0, 1, 0] as Vec };
  assert.ok(Math.abs(clipLens(camera, layers) - 1.38) < 0.01);
  assert.equal(clipLens({ ...camera, yaw: Math.PI }, layers), 3.5);
});

test("the scanline renderer clips the near plane and preserves depth regardless of drawing order", () => {
  const w = 61,
    h = 43;
  let image: ImageData;
  const context = {
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (v: ImageData) => {
      image = v;
    },
  };
  const painter = softwarePainter({
    width: w,
    height: h,
    getContext: () => context,
  } as unknown as HTMLCanvasElement);
  const near: Mesh = [],
    far: Mesh = [];
  face(
    far,
    [
      [-1, -1, -1],
      [1, -1, -1],
      [0, 1, -1],
    ],
    "#2555bb",
  );
  face(
    near,
    [
      [-0.12, -0.55, 0.5],
      [0.12, -0.55, 0.5],
      [0, 0.14, 2.04],
    ],
    "#df473f",
  );
  const camera = { target: [0, 0, 0] as Vec, yaw: 0, pitch: 0, distance: 2 };
  const layer = (mesh: Mesh) => ({ mesh, bounds: geometryBounds(mesh) });
  painter.draw(camera, [layer(near), layer(far)], "low", 0, false);
  const first = Buffer.from(image!.data);
  painter.draw(camera, [layer(far), layer(near)], "low", 0, false);
  assert.ok(Buffer.from(image!.data).equals(first));
  const colors = new Set<number>();
  for (let k = 0; k < w * h; k++)
    if (first[k * 4 + 3]) colors.add(first[k * 4]);
  assert.ok(colors.size >= 2);
  assert.equal(first[0], 0);

  // Windows show the opaque garden and a moving actor behind them, independently of submission order.
  const pane: Mesh = [];
  face(
    pane,
    [
      [-0.7, -0.7, 0],
      [0.7, -0.7, 0],
      [0.7, 0.7, 0],
      [-0.7, 0.7, 0],
    ],
    "#9ddddf",
    "",
    { opacity: 0.23 },
  );
  const centre = 4 * (Math.floor(h / 2) * w + Math.floor(w / 2));
  const pixel = () => Array.from(image!.data.slice(centre, centre + 4));
  const glass = layer(pane),
    garden = layer(far);
  painter.draw(camera, [glass], "low", 0, false);
  assert.ok(Math.abs(pixel()[3] - 0.23 * 255) < 1);
  painter.draw(camera, [garden], "low", 0, false);
  const clear = pixel();
  painter.draw(camera, [glass, garden], "low", 0, false);
  const glazed = pixel();
  assert.equal(glazed[3], 255);
  assert.ok(glazed[0] > clear[0] && glazed[0] < pane[0].rgb[0]);
  painter.draw(camera, [glass, { ...garden, dynamic: true }], "low", 0, false);
  assert.deepEqual(pixel(), glazed);
  painter.draw(
    camera,
    [glass, garden, { ...layer(near), dynamic: true }],
    "low",
    0,
    false,
  );
  assert.equal(pixel()[0], near[0].rgb[0]);
  painter.dispose();
});
