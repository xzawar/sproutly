// World units are metres. Furniture, door openings, stairs and planting surfaces
// are shared by architecture, placement validation and the gardener's route planner.
export type Storey = "garden" | "ground" | "upper";
export type Rect = { x: number; z: number; width: number; depth: number };
export const rect = (
  x: number,
  z: number,
  width: number,
  depth: number,
): Rect => ({ x, z, width, depth });
export const HOUSE = rect(0, 0, 10, 8.5);
export const SITE = rect(-6, -11.5, 22, 31.5);
export const GARDEN_HEIGHTS = { lawn: 0, soil: 0.06, patio: 0.105 } as const;
export const WALL_HEIGHT = 2.82;
export const DOOR_HEIGHT = 2.1;
export const EYE_HEIGHT = 1.65;
export const WALL_THICKNESS = 0.14;
export const GROUND_Y = 0.18;
export const UPPER_Y = 3.18;
export const STAIR = {
  x: 3.78,
  zStart: 4.72,
  zEnd: 1.04,
  width: 1,
  steps: 15,
  lowY: GROUND_Y,
  highY: UPPER_Y,
};
export const stairwell = rect(
  STAIR.x - 0.56,
  STAIR.zEnd - 0.03,
  1.12,
  STAIR.zStart - STAIR.zEnd + 0.075,
);
export const FRONT_DOOR: [number, number, number] = [4.85, GROUND_Y, 8.5];
export const BACK_DOOR: [number, number, number] = [4.56, GROUND_Y, 0];
export const feature = {
  countertop: rect(7.5, 0.34, 2.2, 0.81),
  shelf: rect(0.22, 5.35, 0.71, 2.13),
  window: rect(9.02, 6.51, 0.74, 1.61),
  patio: rect(0.4, 8.65, 3.35, 0.95),
  frontBed: rect(1, 11.5, 9, 1.2),
  backBed: rect(1, -3.8, 9, 1.2),
} as const;
export const cabinet = rect(5.6, 0.25, 4.14, 0.98);
export const furniture = {
  bed: rect(0.4, 0.52, 1.92, 2.18),
  nightstand: rect(2.46, 0.58, 0.52, 0.56),
  sofa: rect(0.31, 4.4, 1.9, 0.8),
  coffee: rect(1.52, 6.2, 1.46, 0.6),
  breakfast: rect(7.05, 2.02, 1.14, 0.62),
  desk: rect(6.47, 4.35, 2.65, 0.86),
  deskChair: rect(7.55, 5.4, 0.54, 0.52),
  cabinet,
  shelf: feature.shelf,
  window: feature.window,
  upstairsSofa: rect(0.38, 1.3, 2.25, 0.78),
  upstairsTable: rect(0.83, 2.88, 1.22, 0.59),
  books: rect(0.28, 4.58, 0.37, 1.13),
  terraceTable: rect(8.32, 0.72, 1.04, 0.62),
} as const;
export const groundFurniture = [
  furniture.bed,
  furniture.nightstand,
  furniture.sofa,
  furniture.coffee,
  furniture.breakfast,
  furniture.desk,
  furniture.deskChair,
  cabinet,
  feature.shelf,
  feature.window,
];
export const upperFurniture = [
  furniture.upstairsSofa,
  furniture.upstairsTable,
  furniture.books,
  furniture.terraceTable,
];
export const partitions = [
  rect(0.14, 3.94, 1.61, 0.12),
  rect(3.12, 3.94, 0.12, 0.12),
  rect(4.28, 0.14, 0.12, 2.51),

  rect(5.6, 2.73, 0.12, 1.21),
  rect(5.6, 3.94, 1.28, 0.12),
  rect(8.26, 3.94, 1.6, 0.12),
  rect(5.95, 4.06, 0.12, 1.1),
  rect(5.95, 6.5, 0.12, 1.88),
];
export type Opening = {
  a: number;
  w: number;
  lo: number;
  h: number;
  door?: true;
};
export type Facade = {
  axis: "x" | "z";
  pos: number;
  start: number;
  end: number;
  side: 1 | -1;
  openings: Opening[];
  cut: number;
};
const windowBay = (
  a: number,
  w: number,
  sill = 0.85,
  header = 2.2,
): Opening => ({ a, w, lo: sill, h: header - sill });
const door = (a: number, w: number): Opening => ({
  a,
  w,
  lo: 0,
  h: DOOR_HEIGHT,
  door: true,
});
export const elevations: Record<"ground" | "upper", Facade[]> = {
  ground: [
    {
      axis: "x",
      pos: 0.07,
      start: 0,
      end: 10,
      side: -1,
      cut: 1.6,
      openings: [
        windowBay(0.52, 2.3),
        door(3.97, 1.18),
        windowBay(6.05, 2.95, 1.12),
      ],
    },
    {
      axis: "z",
      pos: 0.07,
      start: 0.14,
      end: 8.36,
      side: -1,
      cut: 1.35,
      openings: [windowBay(1.12, 1.64), windowBay(5.35, 2.13)],
    },
    {
      axis: "x",
      pos: 8.43,
      start: 0,
      end: 10,
      side: 1,
      cut: 0,
      openings: [
        windowBay(0.53, 2.98),
        door(4.18, 1.34),
        windowBay(6.19, 3.09),
      ],
    },
    {
      axis: "z",
      pos: 9.93,
      start: 0.14,
      end: 8.36,
      side: 1,
      cut: 0,
      openings: [
        windowBay(0.72, 2.35),
        door(5.23, 1.24),
        windowBay(6.51, 1.61),
      ],
    },
  ],
  upper: [
    {
      axis: "x",
      pos: 0.07,
      start: 0,
      end: 6,
      side: -1,
      cut: 1.55,
      openings: [windowBay(0.47, 2.52)],
    },
    {
      axis: "z",
      pos: 0.07,
      start: 0.14,
      end: 5.86,
      side: -1,
      cut: 1.35,
      openings: [windowBay(2.27, 1.54)],
    },
    {
      axis: "x",
      pos: 5.93,
      start: 0,
      end: 6,
      side: 1,
      cut: 0,
      openings: [windowBay(0.59, 3.7)],
    },
    {
      axis: "z",
      pos: 5.93,
      start: 0.14,
      end: 5.86,
      side: 1,
      cut: 0,
      openings: [windowBay(0.53, 1.22), door(2.25, 1.39)],
    },
  ],
};
export function wallFootprint(f: Facade, a: number, b: number): Rect {
  const edge = f.pos - WALL_THICKNESS / 2;
  return f.axis === "x"
    ? rect(a, edge, b - a, WALL_THICKNESS)
    : rect(edge, a, WALL_THICKNESS, b - a);
}
export function standingWalls(f: Facade): Rect[] {
  let start = f.start;
  const segments: Rect[] = [];
  for (const o of f.openings)
    if (o.door) {
      segments.push(wallFootprint(f, start, o.a));
      start = o.a + o.w;
    }
  segments.push(wallFootprint(f, start, f.end));
  return segments;
}
export const groundPerimeter = elevations.ground.flatMap(standingWalls);
export const upperPartitions = standingWalls(elevations.upper[3]);
export function overlapsCircle(r: Rect, x: number, z: number, radius: number) {
  const dx = Math.max(r.x - x, 0, x - r.x - r.width);
  const dz = Math.max(r.z - z, 0, z - r.z - r.depth);
  return dx * dx + dz * dz <= radius * radius;
}
export function contains(r: Rect, x: number, z: number, inset = 0) {
  return (
    x >= r.x + inset &&
    x <= r.x + r.width - inset &&
    z >= r.z + inset &&
    z <= r.z + r.depth - inset
  );
}
export function floorObstructed(
  floor: "ground" | "upper",
  x: number,
  z: number,
  radius: number,
) {
  const furnitureList = floor === "ground" ? groundFurniture : upperFurniture;
  const walls = floor === "ground" ? partitions : upperPartitions;
  return (
    furnitureList.some((r) => overlapsCircle(r, x, z, radius)) ||
    walls.some((r) => overlapsCircle(r, x, z, radius)) ||
    overlapsCircle(stairwell, x, z, radius) ||
    (floor === "ground" &&
      groundPerimeter.some((r) => overlapsCircle(r, x, z, radius)))
  );
}
