import {
  rooms,
  surfacePoint,
  specimenScale,
  surfaceRoom,
  roomFloor,
  inSoil,
  validPlacement,
  type Placement,
} from "../home";
import { STAIR, walkable } from "./layout";
import { GARDEN_DECK, GARDEN_HEIGHTS } from "./landscape";
import { SITE } from "./plan";
import type { Vec } from "./mesh";

type Floor = "ground" | "upper" | "garden";
type Point = { x: number; z: number };
export type WalkOrigin = {
  position: Vec;
  yaw: number;
  floor: Floor | "stairs";
};
const cell = 0.2;
const bodyRadius = 0.18;
const minX = SITE.x - cell,
  minZ = SITE.z - cell;
const width = Math.ceil(SITE.width / cell) + 3;
const depth = Math.ceil(SITE.depth / cell) + 3;
const neighborOffsets = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const grid = (i: number, j: number) => j * width + i;
const point = (id: number): Point => ({
  x: minX + (id % width) * cell,
  z: minZ + Math.floor(id / width) * cell,
});
const height = (floor: Floor) =>
  floor === "upper"
    ? STAIR.highY
    : floor === "garden"
      ? GARDEN_HEIGHTS.lawn
      : STAIR.lowY;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
function terraceHeight(x: number, z: number) {
  const deck = GARDEN_DECK;
  return x >= deck.minX && x <= deck.maxX && z >= deck.minZ && z <= deck.maxZ
    ? GARDEN_HEIGHTS.patio
    : GARDEN_HEIGHTS.lawn;
}
export function footSurface(
  x: number,
  z: number,
  referenceY: number,
  garden: boolean,
) {
  if (garden) return terraceHeight(x, z);
  if (
    Math.abs(x - STAIR.x) < STAIR.width * 0.5 &&
    z >= STAIR.zEnd - 0.04 &&
    z <= STAIR.zStart + 0.012
  ) {
    const t = Math.min(
      1,
      Math.max(0, (STAIR.zStart - z) / (STAIR.zStart - STAIR.zEnd)),
    );
    const tread = Math.min(STAIR.steps, Math.floor(t * STAIR.steps) + 1);
    return STAIR.lowY + ((STAIR.highY - STAIR.lowY) * tread) / STAIR.steps;
  }
  return referenceY > (STAIR.lowY + STAIR.highY) * 0.5
    ? STAIR.highY
    : STAIR.lowY;
}
const atFloor = (p: Point, floor: Floor): Vec => [
  p.x,
  floor === "garden" ? terraceHeight(p.x, p.z) : height(floor),
  p.z,
];
function terracePath(path: Point[]): Vec[] {
  // Introduce short step transitions where a long straight path crosses the deck.
  // Ordinary runs on grass or decking stay one segment.
  const route: Vec[] = [atFloor(path[0], "garden")];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = dist(a, b),
      ts = [1];
    const interpolate = (t: number) => ({
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
    });
    const appendTransition = (t: number) => {
      if (t <= 0 || t >= 1 || !Number.isFinite(t)) return;
      const margin = Math.min(0.12 / length, t, 1 - t);
      const before = interpolate(t - margin),
        after = interpolate(t + margin);
      if (terraceHeight(before.x, before.z) !== terraceHeight(after.x, after.z))
        ts.push(t - margin, t + margin);
    };
    for (const x of [GARDEN_DECK.minX, GARDEN_DECK.maxX])
      appendTransition((x - a.x) / (b.x - a.x));
    for (const z of [GARDEN_DECK.minZ, GARDEN_DECK.maxZ])
      appendTransition((z - a.z) / (b.z - a.z));
    for (const t of ts.sort((a, b) => a - b))
      if (t > 0.001) route.push(atFloor(interpolate(t), "garden"));
  }
  return route;
}

// Priority queue for one bounded search across all viable stances. Route finding
// happens on request only. The actor never walks diagonally through a corner.
class MinHeap {
  private ids: number[] = [];
  private costs: number[] = [];
  get length() {
    return this.ids.length;
  }
  push(id: number, cost: number) {
    let n = this.ids.length;
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (this.costs[parent] <= cost) break;
      this.ids[n] = this.ids[parent];
      this.costs[n] = this.costs[parent];
      n = parent;
    }
    this.ids[n] = id;
    this.costs[n] = cost;
  }
  pop() {
    const id = this.ids[0],
      last = this.ids.pop()!,
      cost = this.costs.pop()!;
    let n = 0;
    while (n * 2 + 1 < this.ids.length) {
      let child = n * 2 + 1;
      if (
        child + 1 < this.ids.length &&
        this.costs[child + 1] < this.costs[child]
      )
        child++;
      if (this.costs[child] >= cost) break;
      this.ids[n] = this.ids[child];
      this.costs[n] = this.costs[child];
      n = child;
    }
    if (this.ids.length) {
      this.ids[n] = last;
      this.costs[n] = cost;
    }
    return id;
  }
}

function shortestWalk(
  start: Point,
  destination: Point,
  floor: Floor,
  obstacles: Placement[],
  stanceCost: (p: Point) => number,
) {
  const pots = obstacles
    .filter((p) => roomFloor(p.room) === floor)
    .map((p) => ({
      ...surfacePoint(p),
      buffer: bodyRadius + 0.4 * specimenScale(p.room),
    }))
    .filter((p) => p.y < height(floor) + 0.3);
  const clear = (p: Point) =>
    walkable(p.x, p.z, floor, bodyRadius) &&
    pots.every((o) => Math.hypot(o.x - p.x, o.z - p.z) >= o.buffer);
  const along = (a: Point, b: Point) => {
    const steps = Math.max(1, Math.ceil(dist(a, b) / 0.11));
    for (let t = 1; t <= steps; t++)
      if (
        !clear({
          x: a.x + ((b.x - a.x) * t) / steps,
          z: a.z + ((b.z - a.z) * t) / steps,
        })
      )
        return false;
    return true;
  };
  const coords = (p: Point) => [
    Math.round((p.x - minX) / cell),
    Math.round((p.z - minZ) / cell),
  ];
  const [si, sj] = coords(start),
    [di, dj] = coords(destination);
  const near = (i: number, j: number) =>
    i >= 0 && i < width && j >= 0 && j < depth;
  const starts: { id: number; d: number }[] = [];
  for (let j = sj - 4; j <= sj + 4; j++)
    for (let i = si - 4; i <= si + 4; i++) {
      if (!near(i, j)) continue;
      const id = grid(i, j),
        p = point(id);
      if (clear(p)) starts.push({ id, d: dist(p, start) });
    }
  starts.sort((a, b) => a.d - b.d);
  if (!starts.length) return null;
  const exactStart = clear(start);
  const origin = starts.find(
    (s) => !exactStart || along(start, point(s.id)),
  )?.id;
  if (origin === undefined) return null;
  const goals = new Map<number, number>();
  for (let j = dj - 8; j <= dj + 8; j++)
    for (let i = di - 8; i <= di + 8; i++) {
      if (!near(i, j)) continue;
      const id = grid(i, j),
        p = point(id),
        cost = stanceCost(p);
      if (Number.isFinite(cost) && clear(p)) goals.set(id, cost);
    }
  if (!goals.size) return null;
  const open = new MinHeap(),
    total = width * depth,
    known = new Float64Array(total).fill(Infinity),
    parents = new Int32Array(total).fill(-1),
    closed = new Uint8Array(total),
    occupancy = new Int8Array(total);
  const passable = (id: number) => {
    if (!occupancy[id]) occupancy[id] = clear(point(id)) ? 1 : -1;
    return occupancy[id] === 1;
  };
  const heuristic = (p: Point) => Math.max(0, dist(p, destination) - 1.55);
  let best = Infinity,
    found = -1;
  open.push(origin, 0);
  known[origin] = 0;
  while (open.length) {
    const id = open.pop();
    if (closed[id]) continue;
    const p = point(id);
    if (known[id] + heuristic(p) > best) break;
    closed[id] = 1;
    const penalty = goals.get(id);
    if (penalty !== undefined && known[id] + penalty < best) {
      found = id;
      best = known[id] + penalty;
    }
    const i = id % width,
      j = Math.floor(id / width);
    for (const [dx, dz] of neighborOffsets) {
      const ni = i + dx,
        nj = j + dz;
      if (!near(ni, nj)) continue;
      const n = grid(ni, nj);
      if (closed[n] || !passable(n)) continue;
      if (dx && dz && (!passable(grid(ni, j)) || !passable(grid(i, nj))))
        continue;
      const cost = known[id] + cell * (dx && dz ? Math.SQRT2 : 1);
      if (cost >= known[n]) continue;
      if (!along(p, point(n))) continue;
      known[n] = cost;
      parents[n] = id;
      open.push(n, cost + heuristic(point(n)));
    }
  }
  if (found === -1) return null;
  const raw: Point[] = [];
  for (let n = found; n !== -1; n = parents[n]) raw.push(point(n));
  raw.reverse();
  if (exactStart && dist(raw[0], start) > 0.001) raw.unshift(start);
  const path = [raw[0]];
  for (let a = 0; a < raw.length - 1;) {
    let b = raw.length - 1;
    while (b > a + 1 && !along(raw[a], raw[b])) b--;
    path.push(raw[b]);
    a = b;
  }
  return floor === "garden"
    ? terracePath(path)
    : path.map((p) => atFloor(p, floor));
}

export function careStance(placement: Placement, p: Point) {
  const target = surfacePoint(placement),
    floor = roomFloor(placement.room);
  const distance = dist(p, target);
  if (distance < 0.33 || distance > (inSoil(placement.room) ? 1.38 : 1.22))
    return Infinity;
  const zone = rooms[surfaceRoom(placement.room)];
  if (
    floor !== "garden" &&
    (p.x < zone.x + 0.06 ||
      p.x > zone.x + zone.width - 0.06 ||
      p.z < zone.z + 0.06 ||
      p.z > zone.z + zone.depth - 0.06)
  )
    return Infinity;
  if (
    (placement.room === "countertop" && p.z <= target.z) ||
    (placement.room === "shelf" && p.x <= target.x) ||
    (placement.room === "window" && p.x >= target.x)
  )
    return Infinity;
  return Math.abs(distance - 0.73) * 3.4;
}

export function choreRoute(
  placement: Placement,
  obstacles: Placement[] = [],
  origin?: WalkOrigin,
): { route: Vec[]; target: Vec } | null {
  if (!validPlacement(placement)) return null;
  const occupied = [...obstacles, placement];
  const target = surfacePoint(placement),
    floor = roomFloor(placement.room);
  const soil: Vec = [
    target.x,
    target.y +
      (inSoil(placement.room) ? 0.006 : 0.522 * specimenScale(placement.room)),
    target.z,
  ];
  if (origin) {
    const [x, , z] = origin.position;
    return origin.floor === floor &&
      Number.isFinite(careStance(placement, { x, z }))
      ? { route: [[...origin.position]], target: soil }
      : null;
  }
  const cost = (p: Point) => careStance(placement, p);
  const staging = { x: 4.83, z: 7.6 },
    porch = { x: 4.85, z: 9.0 };
  if (floor !== "upper") {
    const route = shortestWalk(
      floor === "garden" ? porch : staging,
      target,
      floor,
      occupied,
      cost,
    );
    return route ? { route, target: soil } : null;
  }
  const nearStairs = { x: STAIR.x, z: STAIR.zStart + 0.36 };
  const first = shortestWalk(staging, nearStairs, "ground", occupied, (p) =>
    dist(p, nearStairs) < 0.18 ? dist(p, nearStairs) * 2 : Infinity,
  );
  if (!first) return null;
  const upperLanding = { x: STAIR.x, z: STAIR.zEnd - 0.28 };
  const second = shortestWalk(upperLanding, target, "upper", occupied, cost);
  if (
    !second ||
    Math.hypot(second[0][0] - upperLanding.x, second[0][2] - upperLanding.z) >
      0.3
  )
    return null;
  const route: Vec[] = [
    ...first,
    [STAIR.x, STAIR.lowY, STAIR.zStart],
    [STAIR.x, STAIR.highY, STAIR.zEnd],
    ...second,
  ];
  return { route, target: soil };
}
