/** CPU frame cost on a fixed path from the lawn through the front door. */
import { performance } from "node:perf_hooks";
import {
  walkLandscape,
  walkStructure,
  walkRoof,
} from "../lib/estate/buildings";
import { spatialLayers } from "../lib/estate/explorer";
import { walkingGardener } from "../lib/estate/gardener";
import { eyeCamera, standingEye } from "../lib/estate/first-person";
import { advancePlayer, followCamera, makePlayer } from "../lib/estate/player";
import { softwarePainter, type Layer } from "../lib/estate/renderer";

const width = 600,
  height = 270;
const context = {
  createImageData: (w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
  }),
  putImageData() {},
};
const layers = [
  ...spatialLayers(walkLandscape("low")),
  ...spatialLayers(walkStructure("low")),
  ...spatialLayers(walkRoof("low")),
];
for (const mode of ["First person", "Follow gardener"]) {
  const painter = softwarePainter({
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement);
  const p = makePlayer(),
    timings: number[] = [];
  for (let i = 0; i < 120; i++) {
    const start = performance.now(),
      clock = i / 60,
      yaw = 0.01 * Math.sin(clock * 2.4);
    advancePlayer(p, { right: 0, forward: 1, brisk: false }, yaw, 1 / 60, []);
    const firstPerson = mode === "First person";
    const camera = firstPerson
      ? eyeCamera(standingEye(p), yaw, 0.025)
      : followCamera(p, yaw, 0.23, 3.25);
    const visible: Layer[] = firstPerson
      ? layers
      : [
          ...layers,
          {
            mesh: walkingGardener(
              p.position,
              p.yaw,
              p.stride,
              p.gait,
              clock,
              p.floor === "garden",
            ),
            dynamic: true,
            foot: p.position,
          },
        ];
    painter.draw(camera, visible, "low", clock, true);
    if (i >= 20) timings.push(performance.now() - start);
  }
  painter.dispose();
  if (p.floor !== "ground")
    throw new Error("The benchmark path did not enter the house.");
  timings.sort((a, b) => a - b);
  console.log(
    `${mode}, ${width}×${height}, ${timings.length} measured frames, ${process.version}. Median ${timings[49].toFixed(1)} ms. P95 ${timings[94].toFixed(1)} ms.`,
  );
}
