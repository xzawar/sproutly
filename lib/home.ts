import {
  contains,
  feature,
  floorObstructed,
  STAIR,
  GROUND_Y,
  GARDEN_HEIGHTS,
  rect,
  UPPER_Y,
  type Rect,
  type Storey,
} from "./estate/plan";

// Existing percentages stay stable if a room is redrawn. Height comes from the
// actual supporting surface; it cannot be set independently to make a pot float.
export const roomIds = [
  "living",
  "bedroom",
  "kitchen",
  "office",
  "balcony",
  "studio",
  "terrace",
  "countertop",
  "shelf",
  "window",
  "hall",
  "front-garden",
  "backyard",
  "patio",
] as const;
export type RoomId = (typeof roomIds)[number];
export type Placement = { room: RoomId; x: number; y: number };
type Spot = { label: string; x: number; y: number };
type Room = Rect & { name: string; color: string; spots: Spot[] };
const spot = (label: string, x: number, y: number): Spot => ({ label, x, y });
function room(
  name: string,
  bounds: Rect,
  color: string,
  ...spots: Spot[]
): Room {
  return { name, ...bounds, color, spots };
}
export const rooms: Record<RoomId, Room> = {
  living: room(
    "Living room",
    rect(0, 4, 6, 4.5),
    "#ceb28b",
    spot("By the sofa", 66, 38),
    spot("Beside the rug", 55, 75),
    spot("Reading corner", 25, 83),
  ),
  bedroom: room(
    "Bedroom",
    rect(0, 0, 5, 4),
    "#d7bc99",
    spot("Foot of bed", 17, 83),
    spot("Beside the bed", 55, 75),
    spot("Dressing corner", 49, 83),
  ),
  kitchen: room(
    "Kitchen",
    rect(5, 0, 5, 4),
    "#c7caa8",
    spot("Breakfast nook", 84, 69),
    spot("By the doorway", 24, 70),
    spot("Kitchen corner", 88, 83),
  ),
  office: room(
    "Home office",
    rect(6, 4, 4, 4.5),
    "#cdb48d",
    spot("Reading corner", 34, 78),
    spot("By the desk", 27, 48),
    spot("Book corner", 59, 83),
  ),
  balcony: room(
    "Balcony",
    rect(10, 2.5, 2.8, 6),
    "#bc9872",
    spot("By the railing", 72, 72),
    spot("Near the door", 32, 70),
    spot("Far corner", 72, 14),
  ),
  studio: room(
    "Upstairs studio",
    rect(0, 0, 6, 6),
    "#d5bc96",
    spot("Reading corner", 24, 73),
    spot("By the window", 82, 23),
    spot("Studio corner", 84, 84),
  ),
  terrace: room(
    "Roof terrace",
    rect(6, 0, 4, 6),
    "#bc9b77",
    spot("By the trellis", 79, 51),
    spot("Sun terrace", 38, 66),
    spot("Beside the railing", 62, 85),
  ),
  countertop: room(
    "Kitchen countertop",
    feature.countertop,
    "#ded5bc",
    spot("Counter end", 78, 54),
    spot("Prep counter", 42, 54),
    spot("Counter corner", 15, 54),
  ),
  shelf: room(
    "Indoor plant shelf",
    feature.shelf,
    "#b67f53",
    spot("Middle of shelf", 52, 50),
    spot("Shelf end", 52, 87),
    spot("Near the sofa", 52, 13),
  ),
  window: room(
    "Window ledge",
    feature.window,
    "#d9c8ac",
    spot("Morning light", 46, 24),
    spot("Window corner", 46, 77),
    spot("Near the office", 46, 16),
  ),
  hall: room(
    "Hallway",
    rect(4.12, 0, 1.78, 8.5),
    "#cdb28c",
    spot("Entry alcove", 74, 85),
    spot("Hall corner", 74, 56),
    spot("Console end", 74, 72),
  ),
  "front-garden": room(
    "Front garden",
    feature.frontBed,
    "#69583c",
    spot("Front border", 26, 50),
    spot("Sunny bed", 57, 50),
    spot("East border", 87, 50),
  ),
  backyard: room(
    "Backyard",
    feature.backBed,
    "#66543c",
    spot("Back border", 50, 50),
    spot("West border", 15, 50),
    spot("East border", 82, 50),
  ),
  patio: room(
    "Patio",
    feature.patio,
    "#b38e69",
    spot("By the entrance", 77, 55),
    spot("Timber deck", 50, 55),
    spot("Patio corner", 15, 55),
  ),
};
export const roomFloor = (r: RoomId): Storey =>
  r === "studio" || r === "terrace"
    ? "upper"
    : r === "front-garden" || r === "backyard" || r === "patio"
      ? "garden"
      : "ground";
export function surfaceRoom(r: RoomId): RoomId {
  return r === "countertop"
    ? "kitchen"
    : r === "shelf"
      ? "living"
      : r === "window"
        ? "office"
        : r;
}
export const inSoil = (r: RoomId) => r === "front-garden" || r === "backyard";
export function roomFloorY(r: RoomId) {
  if (roomFloor(r) === "upper") return UPPER_Y;
  if (r === "patio") return GARDEN_HEIGHTS.patio;
  if (inSoil(r)) return GARDEN_HEIGHTS.lawn;
  return GROUND_Y;
}
export function roomSurfaceY(r: RoomId) {
  if (r === "countertop") return 1.12;
  if (r === "shelf") return 0.85;
  if (r === "window") return 1.02;
  return inSoil(r) ? GARDEN_HEIGHTS.soil : roomFloorY(r);
}
export function specimenScale(r: RoomId) {
  if (inSoil(r)) return 0.83;
  if (surfaceRoom(r) !== r) return 0.46;
  return 0.66;
}
export function spotName(p: Placement) {
  return (
    rooms[p.room].spots.find((s) => s.x === p.x && s.y === p.y)?.label ??
    "Custom spot"
  );
}
export function worldPoint(p: Placement) {
  const r = rooms[p.room];
  return { x: r.x + (r.width * p.x) / 100, z: r.z + (r.depth * p.y) / 100 };
}
export function surfacePoint(p: Placement) {
  return { ...worldPoint(p), y: roomSurfaceY(p.room) };
}
export function savedPlacement(p: {
  home_room?: RoomId | null;
  home_x?: number | null;
  home_y?: number | null;
}): Placement | null {
  if (
    !p.home_room ||
    !roomIds.includes(p.home_room) ||
    p.home_x == null ||
    p.home_y == null
  )
    return null;
  return { room: p.home_room, x: p.home_x, y: p.home_y };
}
const aliases: [RegExp, RoomId][] = [
  [/counter|worktop|work top/, "countertop"],
  [/shel(f|ves)|plant stand|bookcase/, "shelf"],
  [/window|sill|ledge/, "window"],
  [/back ?yard|back garden|rear garden/, "backyard"],
  [/balcon/, "balcony"],
  [/roof|terrace/, "terrace"],
  [/patio|porch|entrance deck/, "patio"],
  [/front ?yard|garden|outdoor|flower ?bed|lawn|yard/, "front-garden"],
  [/kitchen|breakfast/, "kitchen"],
  [/bed ?room|bedside/, "bedroom"],
  [/hall|foyer|landing/, "hall"],
  [/studio|upstairs|first floor/, "studio"],
  [/office|study|desk/, "office"],
  [/living|lounge|indoor|ground floor/, "living"],
];
export function locationRoom(location: string): RoomId {
  const value = location.trim().toLowerCase().replace(/[-_]+/g, " ");
  return aliases.find(([pattern]) => pattern.test(value))?.[1] ?? "living";
}
// Keep the circulation spine and stair landings accessible while pots occupy
// designated areas to their sides. Elevated surfaces can take a narrower pot.
const hallLane = rect(4.1, 0, 1.24, 8.5);
const roomDoors = [
  rect(1.72, 3.45, 1.4, 1.08),
  rect(STAIR.x - 0.53, STAIR.zStart - 0.04, 1.06, 0.82),
  rect(4.98, 1.5, 1.15, 1.05),
  rect(6.98, 3.44, 1.2, 1.12),
  rect(5.48, 5.45, 1.13, 0.82),
  rect(9.36, 5.4, 1.24, 0.83),
];
export function validPlacement(p: Placement): boolean {
  if (
    !roomIds.includes(p.room) ||
    !Number.isInteger(p.x) ||
    !Number.isInteger(p.y)
  )
    return false;
  const { x, z } = worldPoint(p),
    r = rooms[p.room];
  if (!contains(r, x, z, 0.405 * specimenScale(p.room) + 0.035)) return false;
  if (surfaceRoom(p.room) !== p.room || roomFloor(p.room) === "garden")
    return true;
  const level = roomFloor(p.room) as "ground" | "upper";
  if (floorObstructed(level, x, z, 0.67 * specimenScale(p.room))) return false;
  if (level === "upper")
    return (
      !(
        x > 3.12 &&
        x < 4.6 &&
        (z < STAIR.zEnd + 0.45 ||
          (z > STAIR.zStart - 0.15 && z < STAIR.zStart + 0.52))
      ) && !(x > 5.4 && x < 6.7 && z > 2.26 && z < 3.63)
    );
  if (contains(hallLane, x, z) || roomDoors.some((d) => contains(d, x, z)))
    return false;
  if (p.room === "hall") return p.y > 51 && p.y < 92;
  if ((p.room === "living" || p.room === "bedroom") && x > 4.09) return false;
  return true;
}
const candidates = new Map<RoomId, Placement[]>();
function availablePoints(room: RoomId) {
  let list = candidates.get(room);
  if (list) return list;
  const bounds = rooms[room];
  const points = bounds.spots
    .map(({ x, y }) => ({ room, x, y }))
    .filter(validPlacement);
  // A metric grid with integer persistence coordinates makes allocation stable
  // across reloads, server processes and device aspect ratios.
  const nx = Math.max(1, Math.ceil(bounds.width / 0.36));
  const nz = Math.max(1, Math.ceil(bounds.depth / 0.36));
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p = {
        room,
        x: Math.round((100 * (i + 0.5)) / nx),
        y: Math.round((100 * (j + 0.5)) / nz),
      };
      if (validPlacement(p)) points.push(p);
    }
  }
  list = points;
  candidates.set(room, list);
  return list;
}
export function findPlacement(
  location: string,
  occupied: readonly Placement[],
  preferred?: Placement | null,
): Placement | null {
  const room = preferred?.room ?? locationRoom(location);
  const near = occupied
    .filter((p) => roomFloor(p.room) === roomFloor(room))
    .map((p) => ({ ...surfacePoint(p), radius: specimenScale(p.room) * 0.8 }));
  const radius = specimenScale(room) * 0.8;
  const vacancy = (p: Placement) => {
    const point = surfacePoint(p);
    return near.every(
      (other) =>
        Math.abs(other.y - point.y) > 1.3 ||
        Math.hypot(other.x - point.x, other.z - point.z) >=
          other.radius + radius,
    );
  };
  if (preferred && validPlacement(preferred) && vacancy(preferred))
    return preferred;
  const points = availablePoints(room);
  if (!preferred) return points.find(vacancy) ?? null;
  const anchor = worldPoint(preferred);
  let closest: Placement | null = null,
    best = Infinity;
  for (const point of points) {
    const world = worldPoint(point),
      d = (world.x - anchor.x) ** 2 + (world.z - anchor.z) ** 2;
    if (d < best && vacancy(point)) {
      closest = point;
      best = d;
    }
  }
  return closest;
}
export function allocateLegacyPlacement(
  location: string,
  occupied: readonly Placement[],
  preferred?: Placement | null,
) {
  const wanted = findPlacement(location, occupied, preferred);
  if (wanted) return wanted;
  const original = preferred?.room ?? locationRoom(location);
  const alternatives = [
    surfaceRoom(original),
    ...roomIds.filter((r) => roomFloor(r) === roomFloor(original)),
    ...roomIds,
  ];
  for (const room of new Set(alternatives)) {
    const result = findPlacement(rooms[room].name, occupied, {
      room,
      x: 50,
      y: 50,
    });
    if (result) return result;
  }
  return null;
}

export function visibleOnLevel(level: Storey | "dollhouse", room: RoomId) {
  return (
    level === "dollhouse" ||
    level === roomFloor(room) ||
    (level === "garden" && (room === "balcony" || room === "terrace"))
  );
}
