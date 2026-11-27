import { EYE_HEIGHT, GROUND_Y, SITE, STAIR, UPPER_Y } from "./plan";
import { faceNormal, type Face, type Mesh, type Vec } from "./mesh";
import { EXPLORE_FOV, type Camera } from "./renderer";
import {
  damping,
  makePlayer,
  walkRadius,
  type Player,
  type WalkPlant,
} from "./player";

import { walkable } from "./layout";
import { footSurface } from "./navigation";

export type WalkView = "eyes" | "fly" | "gardener";
export const EYE_RADIUS = 0.16;
const cellWidth = 2;
const cell = (x: number) => Math.floor(x / cellWidth);
// The estate fits well within 64 cells on each horizontal axis.
const key = (x: number, y: number, z: number) =>
  x + 32 + (z + 32) * 64 + (y + 8) * 4096;
const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
type Barrier = { face: Face; normal: Vec; low: Vec; high: Vec };

/** Static sphere-versus-convex-surface collision. The grid is built once when Fly is first used. */
export class FlightCollision {
  private cells = new Map<number, Barrier[]>();
  constructor(meshes: Iterable<Mesh>) {
    for (const mesh of meshes)
      for (const face of mesh) {
        const low: Vec = [Infinity, Infinity, Infinity],
          high: Vec = [-Infinity, -Infinity, -Infinity];
        for (const p of face.points)
          for (let d = 0; d < 3; d++) {
            low[d] = Math.min(low[d], p[d] - EYE_RADIUS);
            high[d] = Math.max(high[d], p[d] + EYE_RADIUS);
          }
        const bar: Barrier = {
          face,
          normal: faceNormal(face.points),
          low,
          high,
        };
        for (let z = cell(low[2]); z <= cell(high[2]); z++)
          for (let y = cell(low[1]); y <= cell(high[1]); y++)
            for (let x = cell(low[0]); x <= cell(high[0]); x++) {
              const id = key(x, y, z),
                bucket = this.cells.get(id);
              if (bucket) bucket.push(bar);
              else this.cells.set(id, [bar]);
            }
      }
  }
  allows(p: Vec) {
    const [x, y, z] = p;
    if (
      x < SITE.x + EYE_RADIUS ||
      x > SITE.x + SITE.width - EYE_RADIUS ||
      z < SITE.z + EYE_RADIUS ||
      z > SITE.z + SITE.depth - EYE_RADIUS ||
      y < EYE_RADIUS ||
      y > 15
    )
      return false;
    const bucket = this.cells.get(key(cell(x), cell(y), cell(z)));
    if (!bucket) return true;
    for (const { face, normal: n, low, high } of bucket) {
      if (
        x < low[0] ||
        x > high[0] ||
        y < low[1] ||
        y > high[1] ||
        z < low[2] ||
        z > high[2]
      )
        continue;
      const a = face.points[0],
        plane = n[0] * (x - a[0]) + n[1] * (y - a[1]) + n[2] * (z - a[2]);
      if (Math.abs(plane) >= EYE_RADIUS) continue;
      let inside = true;
      for (let i = 0; i < face.points.length; i++) {
        const b = face.points[i],
          c = face.points[(i + 1) % face.points.length];
        const dx = c[0] - b[0],
          dy = c[1] - b[1],
          dz = c[2] - b[2],
          px = x - b[0],
          py = y - b[1],
          pz = z - b[2];
        const len = dx * dx + dy * dy + dz * dz;
        if (len < 1e-12) continue;
        const t = clamp((px * dx + py * dy + pz * dz) / len, 0, 1);
        if (
          (px - t * dx) ** 2 + (py - t * dy) ** 2 + (pz - t * dz) ** 2 <
          EYE_RADIUS ** 2
        )
          return false;
        if (
          (dy * pz - dz * py) * n[0] +
            (dz * px - dx * pz) * n[1] +
            (dx * py - dy * px) * n[2] <
          -1e-7
        )
          inside = false;
      }
      if (inside) return false;
    }
    return true;
  }
}
export const standingEye = (player: Player): Vec => [
  player.position[0],
  player.position[1] + EYE_HEIGHT,
  player.position[2],
];
export function eyeCamera(eye: Vec, yaw: number, pitch: number): Camera {
  return {
    target: [...eye],
    yaw,
    pitch: clamp(pitch, -1.43, 1.43),
    distance: 0,
    fov: EXPLORE_FOV,
  };
}
export type Flight = { eye: Vec; velocity: Vec };
export function advanceFlight(
  flight: Flight,
  input: { right: number; forward: number; lift: number; brisk: boolean },
  yaw: number,
  pitch: number,
  seconds: number,
  allows: (p: Vec) => boolean,
) {
  const elapsed = clamp(seconds, 0, 0.45),
    steps = Math.ceil(elapsed * 120);
  if (!steps) return;
  const dt = elapsed / steps,
    speed = input.brisk ? 5.6 : 2.8;
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw),
    h = input.forward * Math.cos(pitch);
  const wish: Vec = [
    input.right * cos - h * sin,
    input.lift - input.forward * Math.sin(pitch),
    -input.right * sin - h * cos,
  ];
  const magnitude = Math.hypot(...wish),
    scale = speed / Math.max(1, magnitude);
  const k = damping(magnitude ? 14 : 22, dt);
  for (let i = 0; i < steps; i++)
    for (let d = 0; d < 3; d++) {
      flight.velocity[d] += (wish[d] * scale - flight.velocity[d]) * k;
      if (!magnitude && Math.abs(flight.velocity[d]) < 0.01)
        flight.velocity[d] = 0;
      if (!flight.velocity[d]) continue;
      const next: Vec = [...flight.eye];
      next[d] += flight.velocity[d] * dt;
      if (allows(next)) flight.eye = next;
      else flight.velocity[d] = 0;
    }
}

/** Land only on a walkable surface with an unobstructed vertical path to standing eye height. */
export function landFromFlight(
  eye: Vec,
  yaw: number,
  plants: WalkPlant[],
  allows: (p: Vec) => boolean,
): Player | null {
  const [x, y, z] = eye;
  const stair =
    Math.abs(x - STAIR.x) <= STAIR.width / 2 - walkRadius &&
    z >= STAIR.zEnd &&
    z <= STAIR.zStart;
  const candidates: Player["floor"][] = stair
    ? ["stairs"]
    : ["upper", "ground", "garden"];
  for (const floor of candidates) {
    if (floor !== "stairs" && !walkable(x, z, floor, walkRadius)) continue;
    const base =
      floor === "upper"
        ? UPPER_Y
        : floor === "ground"
          ? GROUND_Y
          : floor === "garden"
            ? footSurface(x, z, 0, true)
            : GROUND_Y +
              ((UPPER_Y - GROUND_Y) * (STAIR.zStart - z)) /
                (STAIR.zStart - STAIR.zEnd);
    if (
      y < base + EYE_RADIUS ||
      plants.some(
        (p) =>
          p.onFloor &&
          p.floor === floor &&
          Math.hypot(x - p.x, z - p.z) < p.radius,
      )
    )
      continue;
    const head = base + EYE_HEIGHT,
      steps = Math.max(1, Math.ceil(Math.abs(y - head) / 0.1));
    let clear = true;
    for (let i = 1; i <= steps; i++)
      if (!allows([x, y + ((head - y) * i) / steps, z])) {
        clear = false;
        break;
      }
    if (clear)
      return makePlayer({ position: [x, base, z], yaw: yaw + Math.PI, floor });
  }
  return null;
}
