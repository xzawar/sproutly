import {
  roomFloor,
  specimenScale,
  surfacePoint,
  type Placement,
} from "../home";
import type { Vec } from "./mesh";
import { pottingPosts, pottingBench, gatewaySolids } from "./landscape";
import { STAIR, walkable } from "./layout";
import {
  GROUND_Y,
  WALL_HEIGHT,
  GARDEN_HEIGHTS,
  SITE,
  UPPER_Y,
  groundPerimeter,
  stairwell,
  rect,
  partitions,
  upperPartitions,
  furniture,
  type Rect,
  type Storey,
} from "./plan";
import { careStance, footSurface, type WalkOrigin } from "./navigation";
import { ORBIT_FOV, interpolateCamera, type Camera } from "./renderer";

export type Player = WalkOrigin & {
  vx: number;
  vz: number;
  stride: number;
  gait: number;
};
export type WalkContext = { area: string; ids: string[] };
export type WalkInput = { right: number; forward: number; brisk: boolean };
export type WalkPlant = {
  id: string;
  placement: Placement;
  x: number;
  z: number;
  radius: number;
  floor: Storey;
  onFloor: boolean;
  minY: number;
  maxY: number;
};
export const walkRadius = 0.18;
export const damping = (rate: number, seconds: number) =>
  -Math.expm1(-rate * seconds);
const angleDelta = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
const limit = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
export function makePlayer(origin?: WalkOrigin): Player {
  return {
    position: origin
      ? [...origin.position]
      : [4.85, GARDEN_HEIGHTS.lawn, 10.76],
    floor: origin?.floor ?? "garden",
    yaw: origin?.yaw ?? Math.PI,
    vx: 0,
    vz: 0,
    stride: 0,
    gait: 0,
  };
}
export function walkPlants(
  plants: { id: string; placement: Placement | null }[],
): WalkPlant[] {
  return plants.flatMap((p) => {
    if (!p.placement) return [];
    const loc = surfacePoint(p.placement),
      floor = roomFloor(p.placement.room);
    return [
      {
        id: p.id,
        placement: p.placement,
        x: loc.x,
        z: loc.z,
        floor,
        minY: loc.y - 0.16,
        maxY: loc.y + 1.55 * specimenScale(p.placement.room) + 0.16,
        radius: walkRadius + 0.4 * specimenScale(p.placement.room),
        onFloor: loc.y < (floor === "upper" ? UPPER_Y : GROUND_Y) + 0.3,
      },
    ];
  });
}
function surfaceAt(
  player: Player,
  x: number,
  z: number,
): Player["floor"] | null {
  const prev = player.floor;
  const inFlight =
    Math.abs(x - STAIR.x) <= STAIR.width / 2 - walkRadius &&
    z >= STAIR.zEnd - 0.24 &&
    z <= STAIR.zStart + 0.27;
  if (
    inFlight &&
    (prev === "stairs" ||
      (prev === "ground" && player.position[2] >= STAIR.zStart - 0.015) ||
      (prev === "upper" && player.position[2] <= STAIR.zEnd + 0.015))
  )
    return "stairs";
  if (prev === "stairs") {
    const floor =
      z >= STAIR.zStart ? "ground" : z <= STAIR.zEnd ? "upper" : null;
    return floor && walkable(x, z, floor, walkRadius) ? floor : null;
  }
  if (prev === "upper") return walkable(x, z, prev, walkRadius) ? prev : null;
  // Change storeys only through the openings. Hysteresis at the threshold avoids flashing the shell.
  const front = x > 4.38 && x < 5.34,
    back = x > 4.17 && x < 4.95;
  if (
    prev === "garden" &&
    ((front && z > 8.1 && z < 8.45) || (back && z > 0.07 && z < 0.48)) &&
    walkable(x, z, "ground", walkRadius)
  )
    return "ground";
  if (
    prev === "ground" &&
    ((front && z > 8.57) || (back && z < -0.04)) &&
    walkable(x, z, "garden", walkRadius)
  )
    return "garden";
  return walkable(x, z, prev, walkRadius) ? prev : null;
}
function tryStep(p: Player, dx: number, dz: number, plants: WalkPlant[]) {
  const x = p.position[0] + dx,
    z = p.position[2] + dz;
  const floor = surfaceAt(p, x, z);
  if (
    !floor ||
    plants.some((o) => {
      if (!o.onFloor || o.floor !== floor) return false;
      const next = (x - o.x) ** 2 + (z - o.z) ** 2;
      // A pot may arrive under a stationary visitor through another tab. Always allow a step out.
      return (
        next < o.radius ** 2 &&
        next <= (p.position[0] - o.x) ** 2 + (p.position[2] - o.z) ** 2
      );
    })
  )
    return false;
  const y =
    floor === "stairs"
      ? GROUND_Y +
        (UPPER_Y - GROUND_Y) *
          limit((STAIR.zStart - z) / (STAIR.zStart - STAIR.zEnd), 0, 1)
      : floor === "garden"
        ? footSurface(x, z, 0, true)
        : floor === "upper"
          ? UPPER_Y
          : GROUND_Y;
  p.position = [x, y, z];
  p.floor = floor;
  return true;
}
/** Velocities are in metres per second. Small collision steps prevent tunnelling even after a missed frame. */
export function advancePlayer(
  p: Player,
  input: WalkInput,
  cameraYaw: number,
  seconds: number,
  plants: WalkPlant[],
) {
  const elapsed = limit(seconds, 0, 0.45),
    n = Math.ceil(elapsed * 120);
  if (!n) return;
  const dt = elapsed / n,
    magnitude = Math.hypot(input.right, input.forward),
    norm = Math.max(1, magnitude);
  const speed = input.brisk ? 3.15 : 1.85,
    sin = Math.sin(cameraYaw),
    cos = Math.cos(cameraYaw);
  const desiredX = ((input.right * cos - input.forward * sin) / norm) * speed,
    desiredZ = ((-input.right * sin - input.forward * cos) / norm) * speed;
  for (let i = 0; i < n; i++) {
    const k = damping(magnitude ? 13 : 21, dt);
    p.vx += (desiredX - p.vx) * k;
    p.vz += (desiredZ - p.vz) * k;
    if (!magnitude && Math.hypot(p.vx, p.vz) < 0.018) {
      p.vx = 0;
      p.vz = 0;
    }
    const dx = p.vx * dt,
      dz = p.vz * dt;
    const start = p.position;
    if ((dx || dz) && !tryStep(p, dx, dz, plants)) {
      if (dx && !tryStep(p, dx, 0, plants)) p.vx = 0;
      if (dz && !tryStep(p, 0, dz, plants)) p.vz = 0;
    }
    const movedX = p.position[0] - start[0],
      movedZ = p.position[2] - start[2],
      travelled = Math.hypot(movedX, movedZ);
    if (travelled > 0.0002)
      p.yaw += angleDelta(p.yaw, Math.atan2(movedX, movedZ)) * damping(15, dt);
    p.stride += travelled;
    p.gait += (Math.min(1, travelled / (dt * 1.55)) - p.gait) * damping(14, dt);
  }
}
export function walkArea(p: Player) {
  const [x, , z] = p.position;
  if (p.floor === "stairs") return "Staircase";
  if (p.floor === "garden" && x > 11.6 && x < 14.9 && z > 10.18 && z < 12.87)
    return "Potting pergola";
  if (p.floor === "garden")
    return z < 0
      ? "Backyard"
      : z >= 8.49 && z < 10.05 && x >= -0.23 && x <= 10.25
        ? "Patio"
        : "Front garden";
  if (p.floor === "upper") return x < 6 ? "Upstairs studio" : "Roof terrace";
  if (x > 9.98) return "Balcony";
  if ((x > 4.28 && x < 5.6 && z < 4.05) || (x > 4.3 && x < 5.45 && z >= 4.05))
    return "Hallway";
  return z < 4
    ? x < 5.2
      ? "Bedroom"
      : "Kitchen"
    : x < 6
      ? "Living room"
      : "Home office";
}
export function nearbyPlants(p: Player, plants: WalkPlant[]) {
  const [x, , z] = p.position;
  return plants
    .filter(
      (o) =>
        o.floor === p.floor &&
        Math.abs(o.x - x) < 1.4 &&
        Math.abs(o.z - z) < 1.4 &&
        Number.isFinite(careStance(o.placement, { x, z })),
    )
    .sort(
      (a, b) =>
        (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2) ||
        a.id.localeCompare(b.id),
    )
    .map((o) => o.id);
}

type Solid = { rect: Rect; bottom: number; top: number };
const solid = (rect: Rect, bottom: number, height: number): Solid => ({
  rect,
  bottom,
  top: bottom + height,
});
const groundWalls = groundPerimeter.map((r) => solid(r, GROUND_Y, WALL_HEIGHT));
const innerWalls = partitions.map((r) => solid(r, GROUND_Y, WALL_HEIGHT));
const upperWalls = upperPartitions.map((r) => solid(r, UPPER_Y, WALL_HEIGHT));
const upperEdges = [
  { x: 0, z: 0, width: 6, depth: 0.14 },
  { x: 0, z: 0, width: 0.14, depth: 6 },
  { x: 0, z: 5.86, width: 6, depth: 0.14 },
].map((r) => solid(r, UPPER_Y, WALL_HEIGHT));
const furnishing: [Rect, number][] = [
  [furniture.bed, 0.77],
  [furniture.sofa, 0.84],
  [furniture.coffee, 0.54],
  [furniture.breakfast, 0.84],
  [furniture.desk, 1.47],
  [furniture.cabinet, 1.03],
  [furniture.shelf, 0.73],
  [furniture.window, 0.93],
];
const gap = stairwell;
const ceiling = [
  rect(0, 0, gap.x, 6),
  rect(gap.x + gap.width, 0, 10 - gap.x - gap.width, 6),
  rect(gap.x, 0, gap.width, gap.z),
  rect(gap.x, gap.z + gap.depth, gap.width, 6 - gap.z - gap.depth),
  rect(0, 6, 10, 2.5),
].map((r) => solid(r, GROUND_Y + WALL_HEIGHT, 0.18));
const indoors = [
  ...ceiling,
  ...groundWalls,
  ...innerWalls,
  ...furnishing.map(([r, h]) => solid(r, GROUND_Y, h)),
];
const upstairs = [
  ...upperEdges,
  ...upperWalls,
  solid(furniture.books, UPPER_Y, 1.14),
  solid(furniture.upstairsSofa, UPPER_Y, 0.84),
];
const patioEdges = [
  { x: -5.86, z: SITE.z + 0.2, width: 21.6, depth: 0.16 },
  { x: -5.86, z: SITE.z + 0.3, width: 0.16, depth: 29.65 },
].map((r) => solid(r, 0, 1.72));
const pergola = [
  ...pottingPosts.map(([x, z]) =>
    solid({ x: x - 0.07, z: z - 0.07, width: 0.14, depth: 0.14 }, 0.05, 2.23),
  ),
  solid(
    {
      x: pottingBench.minX,
      z: pottingBench.minZ,
      width: pottingBench.maxX - pottingBench.minX,
      depth: pottingBench.maxZ - pottingBench.minZ,
    },
    0.05,
    0.89,
  ),
  solid({ x: 11.68, z: 10.23, width: 3.08, depth: 2.55 }, 2.4, 0.13),
];
const outside = [
  ...ceiling,
  ...groundWalls,
  ...upstairs,
  ...patioEdges,
  ...pergola,
  ...gatewaySolids(),
];
const stairSolids = [...indoors, ...upstairs];
/** Slab intersection for a camera boom with a small clearance around the lens. */
function boomHit(o: Vec, d: Vec, obstacle: Solid, max: number) {
  const r = obstacle.rect,
    pad = 0.09;
  const lo = [r.x - pad, obstacle.bottom - pad, r.z - pad],
    hi = [r.x + r.width + pad, obstacle.top + pad, r.z + r.depth + pad];
  let near = 0,
    far = max;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 0.00001) {
      if (o[i] < lo[i] || o[i] > hi[i]) return max;
      continue;
    }
    const a = (lo[i] - o[i]) / d[i],
      b = (hi[i] - o[i]) / d[i];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return max;
  }
  return Math.max(0.12, near - 0.06);
}
export function clearFollowDistance(camera: Camera, floor: Player["floor"]) {
  const cp = Math.cos(camera.pitch),
    dir: Vec = [
      Math.sin(camera.yaw) * cp,
      Math.sin(camera.pitch),
      Math.cos(camera.yaw) * cp,
    ];
  return clearance(camera.target, dir, camera.distance, floor);
}
function clearance(
  origin: Vec,
  dir: Vec,
  length: number,
  floor: Player["floor"],
) {
  const solids =
    floor === "upper"
      ? upstairs
      : floor === "garden"
        ? outside
        : floor === "stairs"
          ? stairSolids
          : indoors;
  return solids.reduce(
    (dist, box) => Math.min(dist, boomHit(origin, dir, box, dist)),
    length,
  );
}
export function followCamera(
  p: Player,
  yaw: number,
  pitch: number,
  distance: number,
): Camera {
  // The target follows the body at a stable height. Foot IK and the breathing animation never shake the lens.
  const chest: Vec = [p.position[0], p.position[1] + 1.12, p.position[2]];
  // Look just past the right shoulder, keeping the plant and the gardener's hands visible together.
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw),
    side = 0.46,
    lead = 0.36,
    length = Math.hypot(side, lead);
  const aim: Vec = [
    (cos * side - sin * lead) / length,
    0,
    (-sin * side - cos * lead) / length,
  ];
  const amount = clearance(chest, aim, length, p.floor);
  return {
    yaw,
    pitch,
    distance,
    target: [chest[0] + aim[0] * amount, chest[1], chest[2] + aim[2] * amount],
  };
}

/** Exponential response gives wheel, drag and follow controls the same feel at any refresh rate. */
export function smoothCamera(
  from: Camera,
  to: Camera,
  seconds: number,
  rate = 15,
) {
  const delta = Math.max(
    Math.abs(angleDelta(from.yaw, to.yaw)),
    Math.abs(from.pitch - to.pitch),
    Math.abs(from.distance - to.distance),
    Math.abs((from.fov ?? ORBIT_FOV) - (to.fov ?? ORBIT_FOV)),
    ...from.target.map((v, i) => Math.abs(v - to.target[i])),
  );
  return delta < 0.0008
    ? to
    : interpolateCamera(from, to, damping(rate, Math.max(0, seconds)));
}
