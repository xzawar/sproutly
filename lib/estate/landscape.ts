import {
  box,
  branch,
  face,
  round,
  type Mesh,
  type Vec,
  type Material,
} from "./mesh";

import { HOUSE, SITE, GARDEN_HEIGHTS, type Rect } from "./plan";
export { GARDEN_HEIGHTS } from "./plan";

type PlanPoint = [number, number];
type Region = { minX: number; maxX: number; minZ: number; maxZ: number };
export type LandscapeDetail = "low" | "balanced" | "ultra";

export const GARDEN_PLOT: Region = {
  minX: SITE.x,
  maxX: SITE.x + SITE.width,
  minZ: SITE.z,
  maxZ: SITE.z + SITE.depth,
};
export const GARDEN_DECK: Region = {
  minX: -0.23,
  maxX: 10.25,
  minZ: 8.5,
  maxZ: 10.05,
};
export const GARDEN_BEDS = {
  front: { minX: 1, maxX: 10, minZ: 11.5, maxZ: 12.7 },
  back: { minX: 1, maxX: 10, minZ: -3.8, maxZ: -2.6 },
} satisfies Record<string, Region>;
// Landscape components were surveyed from the bottom of a 40 mm turf layer.
const turfThickness = 0.04;
const westEdge: PlanPoint[] = [
  [-11.18, -3.6],
  [-7.8, -4.05],
  [-5.18, -3.22],
  [-3.6, -2.8],
  [-1.2, -3.24],
  [2.0, -3.0],
  [4.6, -2.57],
  [7.4, -3.15],
  [9.5, -3.65],
  [11.85, -2.75],
  [13.6, -2.28],
  [15.5, -2.72],
  [17.25, -3.38],
  [18.8, -4.3],
  [19.35, -5.47],
];
// The crescent's width tapers into the gateway path at the west and blends into the pond at the east.
function crescent(x: number) {
  const t = Math.min(1, Math.max(0, (x - 0.52) / 11.72));
  return {
    z: 16.72 + 1.36 * Math.sin(t * Math.PI * 0.88) + 0.48 * t,
    radius:
      0.94 *
      Math.min(1, Math.sqrt(t * 13)) *
      (1 + 0.18 * Math.sin(t * 4 * Math.PI)),
  };
}
// Each obstacle uses the same footprint as its visible timber or bench.
export const pottingPosts: PlanPoint[] = [
  [11.9, 10.46],
  [14.5, 10.46],
  [11.9, 12.54],
  [14.5, 12.54],
];
export const pottingBench = {
  minX: 12.12,
  maxX: 14.28,
  minZ: 10.44,
  maxZ: 10.98,
};
const pond: PlanPoint = [12.65, 16.9];
const chairs: [number, number, number][] = [
  [7.72, 15.35, -0.5],
  [9.43, 15.01, 0.48],
];
const table: PlanPoint = [8.56, 15.36];
const arch: PlanPoint = [-0.6, 16.3];
const archYaw = -0.23;
const stone = ["#b6b0a0", "#aaa695", "#c5c0ac", "#a19e93"];
const grass = "#a7b778";
const darkGreens = ["#375e46", "#426b4b", "#578154", "#698e60"];
const sages = ["#6b895a", "#799c67", "#90af75", "#acc68b"];
const lime = ["#83994e", "#9bae64", "#b2bb72", "#c2ca88"];
const maple = ["#ab5c3c", "#c06d45", "#d9814d", "#e7a364", "#cb7845"];
const flowers = ["#78528c", "#9769ab", "#ae82bd", "#c09bc9"];
const blossom = ["#d0c8a5", "#e6dec2", "#f6eed6"];
const tau = Math.PI * 2;

function boundaryAt(z: number) {
  const next = westEdge.findIndex(([row]) => row >= z);
  if (next <= 0) return next === 0 ? westEdge[0][1] : westEdge.at(-1)![1];
  const [z0, x0] = westEdge[next - 1],
    [z1, x1] = westEdge[next];
  const t = (z - z0) / (z1 - z0);
  return x0 + (x1 - x0) * t * t * (3 - 2 * t);
}
function rotate(x: number, z: number, yaw: number): PlanPoint {
  return [
    x * Math.cos(yaw) + z * Math.sin(yaw),
    z * Math.cos(yaw) - x * Math.sin(yaw),
  ];
}
function toWorld(
  origin: PlanPoint,
  yaw: number,
  x: number,
  y: number,
  z: number,
): Vec {
  const [dx, dz] = rotate(x, z, yaw);
  return [origin[0] + dx, y, origin[1] + dz];
}
// Use the same rotated gateway and wood dimensions for the camera and the drawing.
export function gatewaySolids() {
  function timber(
    x: number,
    z: number,
    width: number,
    depth: number,
    bottom: number,
    top: number,
  ) {
    const corners = [
      toWorld(arch, archYaw, x, 0, z),
      toWorld(arch, archYaw, x + width, 0, z),
      toWorld(arch, archYaw, x, 0, z + depth),
      toWorld(arch, archYaw, x + width, 0, z + depth),
    ];
    const xs = corners.map((p) => p[0]),
      zs = corners.map((p) => p[2]),
      left = Math.min(...xs),
      back = Math.min(...zs);
    return {
      rect: {
        x: left,
        z: back,
        width: Math.max(...xs) - left,
        depth: Math.max(...zs) - back,
      },
      bottom: bottom - turfThickness,
      top: top - turfThickness,
    };
  }
  return [
    ...[-0.88, 0.88].map((x) =>
      timber(x - 0.084, -0.084, 0.168, 0.168, 0.04, 2.26),
    ),
    timber(-1.21, -0.139, 2.42, 0.278, 2.19, 2.41),
    timber(-0.91, -0.054, 1.82, 0.108, 1.91, 2),
  ];
}
function inRect(x: number, z: number, r: Region, pad: number) {
  return (
    x >= r.minX - pad &&
    x <= r.maxX + pad &&
    z >= r.minZ - pad &&
    z <= r.maxZ + pad
  );
}
function inOval(
  x: number,
  z: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  pad: number,
) {
  return ((x - cx) / (rx + pad)) ** 2 + ((z - cz) / (rz + pad)) ** 2 < 1;
}

/** Landscape obstacles only. The building and individual managed pots have separate colliders. */
export function blockedLandscape(x: number, z: number, radius = 0.2): boolean {
  const r = Math.max(0, radius);
  if (!Number.isFinite(x + z + r) || !inRect(x, z, GARDEN_PLOT, -r - 0.18))
    return true;
  if (z < GARDEN_PLOT.minZ + 0.96 + r || (z < 9.5 && x > 14.96 - r))
    return true;
  if (z < westEdge.at(-1)![0] + r && x < boundaryAt(z) + r) return true;
  // Obround managed beds have semicircular caps outside their rectangular planting areas.
  for (const bed of Object.values(GARDEN_BEDS)) {
    const cz = (bed.minZ + bed.maxZ) / 2;
    const dx = x - Math.min(bed.maxX, Math.max(bed.minX, x));
    if (Math.hypot(dx, z - cz) < (bed.maxZ - bed.minZ) / 2 + 0.055 + r)
      return true;
  }
  if (x >= 0.52 - r && x <= 12.24 + r) {
    const bed = crescent(x);
    if (Math.abs(z - bed.z) < bed.radius + r) return true;
  }
  if (
    inRect(x, z, pottingBench, r) ||
    pottingPosts.some(
      ([px, pz]) =>
        Math.abs(x - px) < 0.075 + r && Math.abs(z - pz) < 0.075 + r,
    )
  )
    return true;
  if (inOval(x, z, pond[0], pond[1], 2.52, 2.02, r)) return true;
  for (const [cx, cz, yaw] of chairs) {
    const [dx, dz] = rotate(x - cx, z - cz, -yaw);
    if (Math.abs(dx) < 0.33 + r && Math.abs(dz) < 0.45 + r) return true;
  }
  if (Math.hypot(x - table[0], z - table[1]) < 0.3 + r) return true;
  return [-0.88, 0.88].some((offset) => {
    const p = toWorld(arch, archYaw, offset, 0, 0);
    return Math.hypot(x - p[0], z - p[2]) < 0.16 + r;
  });
}

// Each planting has its own reproducible seed. Changing detail does not move a tree or a garden feature.
function sequence(seed: number) {
  let state = seed >>> 0;
  return () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function varied(palette: string[], t: number) {
  return palette[Math.min(palette.length - 1, Math.floor(t * palette.length))];
}
function ring(
  x: number,
  y: number,
  z: number,
  rx: number,
  rz: number,
  sides: number,
  seed = 0,
): Vec[] {
  // Smooth, star-convex shoreline/stone outlines. Negative winding gives an upward top normal.
  return Array.from({ length: sides }, (_, i) => {
    const a = (-tau * i) / sides;
    const warp =
      1 + 0.073 * Math.sin(a * 3 + seed) + 0.039 * Math.cos(a * 5 - seed * 0.7);
    return [x + rx * warp * Math.cos(a), y, z + rz * warp * Math.sin(a)];
  });
}
function disk(
  m: Mesh,
  rim: Vec[],
  center: Vec,
  color: string,
  material?: Material,
) {
  for (let i = 0; i < rim.length; i++)
    face(m, [center, rim[i], rim[(i + 1) % rim.length]], color, "", material);
}
function band(m: Mesh, a: Vec[], b: Vec[], color: string, material?: Material) {
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    face(m, [a[i], a[j], b[j], b[i]], color, "", material);
  }
}
function soilLens(m: Mesh, x: number, z: number, rx: number, rz: number) {
  const outer = ring(x, 0.054, z, rx, rz, 24, 1.3),
    inner = ring(x, 0.105, z, rx - 0.055, rz - 0.055, 24, 1.3);
  band(m, outer, inner, "#74765c");
  disk(m, inner, [x, 0.105, z], "#695f4d");
}
function managedBed(m: Mesh, r: Region) {
  const cz = (r.minZ + r.maxZ) / 2,
    rad = (r.maxZ - r.minZ) / 2;
  const outline = (add: number, y: number): Vec[] => {
    const p: Vec[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 - (Math.PI * i) / 10;
      p.push([
        r.maxX + (rad + add) * Math.cos(a),
        y,
        cz + (rad + add) * Math.sin(a),
      ]);
    }
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 - (Math.PI * i) / 10;
      p.push([
        r.minX + (rad + add) * Math.cos(a),
        y,
        cz + (rad + add) * Math.sin(a),
      ]);
    }
    return p;
  };
  band(m, outline(0.052, 0.045), outline(0.028, 0.12), "#8c745b");
  band(m, outline(0.028, 0.12), outline(0, 0.1), "#af9273");
  face(m, outline(0, 0.1), "#73624c");
  // Low mulch flakes break up empty planting surfaces without occupying a pot's volume.
  const rng = sequence(Math.round((cz + 13) * 113));
  for (let i = 0; i < 65; i++) {
    const x = r.minX + rng() * (r.maxX - r.minX),
      z = r.minZ + 0.06 + rng() * (r.maxZ - r.minZ - 0.12);
    const w = 0.022 + rng() * 0.04;
    face(
      m,
      [
        [x - w, 0.102, z],
        [x, 0.102, z + 0.012],
        [x + w, 0.102, z - 0.013],
      ],
      varied(["#887354", "#675a49", "#826b52"], rng()),
    );
  }
}
// Clip convex turf patches around foundations so their undersides never share its plane.
function outsideFootprint(poly: Vec[], r: Rect): Vec[][] {
  let inside = poly;
  const pieces: Vec[][] = [];
  for (const [axis, edge, sign] of [
    [0, r.x, 1],
    [0, r.x + r.width, -1],
    [2, r.z, 1],
    [2, r.z + r.depth, -1],
  ] as const) {
    if (!inside.length) break;
    const next: Vec[] = [],
      outside: Vec[] = [];
    for (let i = 0; i < inside.length; i++) {
      const a = inside[i],
        b = inside[(i + 1) % inside.length],
        da = (a[axis] - edge) * sign,
        db = (b[axis] - edge) * sign;
      if (da >= 0) next.push(a);
      if (da <= 0) outside.push(a);
      if (da * db < 0) {
        const t = da / (da - db),
          p = a.map((n, j) => n + (b[j] - n) * t) as Vec;
        next.push(p);
        outside.push(p);
      }
    }
    if (outside.length >= 3) pieces.push(outside);
    inside = next;
  }
  return pieces;
}
function plinth(m: Mesh) {
  const { minX: a, maxX: b, minZ: c, maxZ: d } = GARDEN_PLOT;
  const edge = (inset: number, y: number): Vec[] => {
    const k = 0.43,
      l = a + inset,
      r = b - inset,
      t = c + inset,
      s = d - inset;
    return [
      [l + k, y, s],
      [r - k, y, s],
      [r, y, s - k],
      [r, y, t + k],
      [r - k, y, t],
      [l + k, y, t],
      [l, y, t + k],
      [l, y, s - k],
    ];
  };
  const base = edge(0.16, -0.55),
    foot = edge(0.03, -0.45),
    lip = edge(0, -0.12),
    turf = edge(0.03, 0.04);
  band(m, base, foot, "#ab9e86");
  band(m, foot, lip, "#c7baa0");
  band(m, lip, turf, "#80905d");
  const deck = GARDEN_DECK;
  const foundations = [
    HOUSE,
    { x: 10, z: 2.5, width: 2.8, depth: 6 },
    {
      x: deck.minX,
      z: deck.minZ,
      width: deck.maxX - deck.minX,
      depth: deck.maxZ - deck.minZ,
    },
  ];
  let patches = [turf];
  for (const r of foundations)
    patches = patches.flatMap((p) => outsideFootprint(p, r));
  for (const p of patches) face(m, p, grass);
}
function paving(m: Mesh, detail: LandscapeDetail) {
  const boards = detail === "low" ? 8 : 13;
  const colors = ["#c19b73", "#caa77b", "#d3af88", "#c9a37b", "#bd9974"];
  const deck = GARDEN_DECK,
    width = deck.maxX - deck.minX,
    depth = deck.maxZ - deck.minZ;
  box(m, deck.minX, turfThickness, deck.minZ, width, 0.098, depth, "#987b5b");
  for (let i = 0; i < boards; i++) {
    const plankDepth = depth / boards;
    // Flush slats keep the underside clear for pots and the front-door threshold.
    box(
      m,
      deck.minX,
      GARDEN_HEIGHTS.patio + turfThickness - 0.007,
      deck.minZ + i * plankDepth,
      width,
      0.007,
      plankDepth - 0.007,
      colors[i % colors.length],
    );
  }
  const stones: [number, number, number, number][] = [
    [4.62, 10.34, 0.46, 0.22],
    [3.68, 10.59, 0.4, 0.23],
    [2.75, 10.7, 0.39, 0.21],
    [1.81, 10.61, 0.38, 0.2],
    [0.85, 10.65, 0.37, 0.23],
    [0.04, 11.16, 0.35, 0.25],
    [-0.48, 11.91, 0.31, 0.27],
    [-0.71, 12.85, 0.35, 0.29],
    [-0.86, 13.81, 0.34, 0.24],
    [-0.86, 14.71, 0.35, 0.23],
    [-0.72, 15.63, 0.36, 0.23],
    [-0.54, 16.54, 0.4, 0.25],
    [-0.34, 17.52, 0.37, 0.24],
    [0.01, 18.43, 0.39, 0.26],
    [4.55, -0.38, 0.45, 0.24],
    [4.55, -1.18, 0.41, 0.25],
    [3.67, -1.62, 0.43, 0.25],
    [2.66, -1.67, 0.43, 0.25],
    [1.61, -1.72, 0.43, 0.25],
    [0.58, -1.93, 0.43, 0.25],
    [-0.15, -2.56, 0.43, 0.25],
    [-0.31, -3.45, 0.43, 0.25],
    [-0.04, -4.31, 0.43, 0.25],
    [0.58, -5.04, 0.43, 0.25],
    [1.37, -5.63, 0.43, 0.25],
    [2.25, -6.08, 0.43, 0.25],
  ];
  stones.forEach(([x, z, rx, rz], i) => {
    const lo = ring(x, 0.041, z, rx, rz, 7, i * 1.1),
      hi = lo.map((p) => [p[0], 0.065, p[2]] as Vec);
    band(m, lo, hi, "#999784");
    face(m, hi, stone[i % stone.length]);
  });
}
function screen(
  m: Mesh,
  a: PlanPoint,
  b: PlanPoint,
  detail: LandscapeDetail,
  sharedStart = false,
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz),
    n = Math.ceil(length / 3.1);
  const horizontal = Math.abs(dx) > Math.abs(dz),
    rails = detail === "low" ? 6 : 10;
  for (let i = 0; i <= n; i++) {
    const x = a[0] + (dx * i) / n,
      z = a[1] + (dz * i) / n;
    // Step down toward the viewer so the flowering border remains visible over the screen.
    const height = horizontal || z < 8 ? 1.66 : z < 13 ? 1.14 : 0.74;
    if (i > 0 || !sharedStart) {
      box(m, x - 0.115, 0.04, z - 0.115, 0.23, height, 0.23, "#c9b99e");
      box(m, x - 0.145, height + 0.04, z - 0.145, 0.29, 0.062, 0.29, "#e0d3b5");
    }
    if (i === n) break;
    const w = length / n - 0.19,
      count = Math.max(3, Math.round((rails * height) / 1.66));
    const p = (u: number, v: number, t: number): Vec =>
      horizontal ? [x + 0.098 + u, v, z + t] : [x + t, v, z + 0.098 + u];
    for (let j = 0; j < count; j++) {
      const step = (height - 0.22) / count,
        lo = 0.11 + j * step,
        hi = lo + step - 0.015;
      const color = ["#b09070", "#bb9973", "#c9a67e", "#b99471"][
        (i + 2 * j) % 4
      ];
      face(
        m,
        [p(0, lo, -0.04), p(0, hi, -0.04), p(w, hi, -0.04), p(w, lo, -0.04)],
        color,
      );
      face(
        m,
        [p(w, lo, 0.04), p(w, hi, 0.04), p(0, hi, 0.04), p(0, lo, 0.04)],
        color,
      );
      face(
        m,
        [p(0, hi, -0.04), p(0, hi, 0.04), p(w, hi, 0.04), p(w, hi, -0.04)],
        "#c4a37b",
      );
    }
    box(
      m,
      x + (horizontal ? 0.1 : -0.075),
      height - 0.09,
      z + (horizontal ? -0.075 : 0.1),
      horizontal ? w : 0.15,
      0.072,
      horizontal ? 0.15 : w,
      "#a78360",
    );
  }
}
function borderBed(m: Mesh) {
  const start = westEdge[0][0],
    end = westEdge.at(-1)![0],
    slices = 65;
  for (let i = 0; i < slices; i++) {
    const z = start + ((end - start) * i) / slices,
      n = start + ((end - start) * (i + 1)) / slices;
    const x = boundaryAt(z),
      xx = boundaryAt(n);
    face(
      m,
      [
        [-5.82, 0.104, n],
        [xx, 0.104, n],
        [x, 0.104, z],
        [-5.82, 0.104, z],
      ],
      "#645d4c",
    );
    face(
      m,
      [
        [x, 0.104, z],
        [xx, 0.104, n],
        [xx + 0.06, 0.045, n],
        [x + 0.06, 0.045, z],
      ],
      "#777859",
    );
  }
  box(m, -5.65, 0.04, -11.29, 21.14, 0.06, 0.76, "#716751");
  box(m, 14.96, 0.04, -10.55, 0.81, 0.06, 20.02, "#776c54");
}

/** Uneven rings give each crown a different silhouette and a shaded interior. */
function crown(
  m: Mesh,
  c: Vec,
  rx: number,
  ry: number,
  rz: number,
  colors: string[],
  seed: number,
  sides: number,
) {
  const rng = sequence(seed),
    rims: Vec[][] = [];
  if (sides <= 4) {
    const p: Vec[] = Array.from({ length: sides + 1 }, (_, i) => {
      const t = (-tau * i) / (sides + 1) + (seed % 7) * 0.09,
        radius = 0.82 + 0.27 * rng();
      return [
        c[0] + rx * Math.cos(t) * radius,
        c[1] + ry * (rng() - 0.5) * 0.38,
        c[2] + rz * Math.sin(t) * radius,
      ];
    });
    // A second irregular ring breaks up the silhouette at eye level, even on Low.
    const shoulders: Vec[] = p.map(([x, , z], i) => [
      c[0] + (x - c[0]) * (0.57 + 0.28 * rng()) + 0.08 * rx,
      c[1] + ry * (0.42 + 0.34 * rng()),
      c[2] + (z - c[2]) * (0.64 + 0.18 * rng()) + 0.09 * rz * Math.sin(i),
    ]);
    const bottom: Vec = [c[0] + rx * 0.14, c[1] - ry * 0.63, c[2] - 0.08 * rz];
    const top: Vec = [c[0] - 0.17 * rx, c[1] + ry * 0.82, c[2] + 0.12 * rz];
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length;
      face(m, [bottom, p[j], p[i]], colors[Math.floor(rng() * 2)]);
      face(m, [p[i], p[j], shoulders[j]], colors[i % colors.length]);
      face(
        m,
        [p[i], shoulders[j], shoulders[i]],
        colors[(i + 1) % colors.length],
      );
      face(
        m,
        [shoulders[i], shoulders[j], top],
        colors[colors.length - 1 - (i % 3 ? 0 : 1)],
      );
    }
    return;
  }
  for (const [height, radius, twist] of [
    [-0.48, 0.6, 0],
    [0.02, 1, 0.29],
    [0.57, 0.7, -0.09],
  ]) {
    rims.push(
      Array.from({ length: sides }, (_, i) => {
        const a = (-tau * (i + twist)) / sides,
          w = radius * (0.85 + 0.29 * rng());
        return [
          c[0] + rx * w * Math.cos(a),
          c[1] + ry * (height + 0.19 * rng()),
          c[2] + rz * w * Math.sin(a),
        ];
      }),
    );
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    face(
      m,
      [[c[0], c[1] - ry * 0.79, c[2]], rims[0][j], rims[0][i]],
      colors[0],
    );
    for (let k = 0; k < 2; k++) {
      const tint = Math.min(
        colors.length - 1,
        k + Math.floor(rng() * (colors.length - k)),
      );
      face(
        m,
        [rims[k][i], rims[k][j], rims[k + 1][j]],
        colors[Math.max(0, tint - 1)],
      );
      face(m, [rims[k][i], rims[k + 1][j], rims[k + 1][i]], colors[tint]);
    }
    face(
      m,
      [[c[0] + rx * 0.06, c[1] + ry * 0.89, c[2]], rims[2][i], rims[2][j]],
      colors[colors.length - 1 - (i % 3 === 0 ? 1 : 0)],
    );
  }
}
function blade(
  m: Mesh,
  origin: Vec,
  angle: number,
  reach: number,
  height: number,
  width: number,
  color: string,
  underside = color,
) {
  const a = Math.cos(angle),
    b = Math.sin(angle),
    [x, y, z] = origin;
  const tip: Vec = [x + reach * a, y + height, z + reach * b];
  const left: Vec = [
    x + reach * 0.56 * a - width * b,
    y + height * 0.65,
    z + reach * 0.56 * b + width * a,
  ];
  const right: Vec = [
    x + reach * 0.56 * a + width * b,
    y + height * 0.65,
    z + reach * 0.56 * b - width * a,
  ];
  const mid: Vec = [
    x + reach * 0.54 * a,
    y + height * 0.65 + width * 0.36,
    z + reach * 0.54 * b,
  ];
  face(m, [origin, left, mid], color);
  face(m, [left, tip, mid], color);
  face(m, [origin, mid, right], underside);
  face(m, [mid, tip, right], underside);
}
function tree(
  m: Mesh,
  x: number,
  z: number,
  height: number,
  colors: string[],
  seed: number,
  detail: LandscapeDetail,
  slender = false,
) {
  const rng = sequence(seed),
    branchCount = detail === "low" ? (slender ? 4 : 5) : slender ? 6 : 8,
    sprigs = detail === "low" ? 4 : detail === "ultra" ? 12 : 7;
  const trunk = slender ? "#b4ac89" : "#806a4f",
    bark = slender ? "#a29f82" : "#8e7454";
  const lean = (rng() - 0.5) * height * 0.11;
  branch(
    m,
    [x, 0.1, z],
    [x + lean, height * 0.66, z + 0.06],
    height * (slender ? 0.018 : 0.029),
    trunk,
  );
  for (let k = 0; k < branchCount; k++) {
    const t = k / (branchCount - 1),
      theta = k * 2.39996 + rng() * 0.4;
    const spread = height * (slender ? 0.292 : 0.4) * (0.86 - 0.68 * t);
    const origin: Vec = [x + lean * 0.8, height * (0.29 + t * 0.43), z + 0.04];
    const elbow: Vec = [
      origin[0] + spread * 0.52 * Math.cos(theta),
      origin[1] + height * 0.139,
      origin[2] + spread * 0.52 * Math.sin(theta),
    ];
    const c: Vec = [
      origin[0] + spread * Math.cos(theta),
      height * (0.58 + 0.35 * t),
      origin[2] + spread * Math.sin(theta),
    ];
    branch(m, origin, elbow, height * 0.012, trunk);
    branch(m, elbow, c, height * 0.009, bark);
    const width = height * (slender ? 0.197 : 0.232) * (1 - 0.26 * t),
      crownSeed = seed + 115 * k;
    crown(
      m,
      c,
      width,
      width * (slender ? 1.06 : 0.79),
      width * 0.94,
      colors,
      crownSeed,
      detail === "low" ? 4 : 7,
    );
    const leaves = sequence(crownSeed + 88);
    for (let n = 0; n < sprigs; n++) {
      const a = leaves() * tau,
        radius = width * (0.7 + 0.34 * leaves()),
        slope = (leaves() - 0.5) * 0.79;
      const o: Vec = [
        c[0] + radius * Math.cos(a),
        c[1] + width * slope,
        c[2] + radius * Math.sin(a),
      ];
      // Paired leaves and a forked spray read as foliage from below the canopy.
      const length = width * (0.23 + 0.14 * leaves());
      const twig: Vec = [
        o[0] + 0.25 * width * Math.cos(a),
        o[1] - 0.12 * width,
        o[2] + 0.25 * width * Math.sin(a),
      ];
      if (n % 2 === 0)
        branch(
          m,
          [
            c[0] + (o[0] - c[0]) * 0.78,
            o[1] + width * 0.13,
            c[2] + (o[2] - c[2]) * 0.78,
          ],
          twig,
          0.012,
          bark,
        );
      blade(
        m,
        twig,
        a - 0.64,
        length * 0.94,
        -length * 0.45,
        length * 0.29,
        varied(colors, leaves()),
      );
      if (detail !== "low")
        blade(
          m,
          twig,
          a + 0.55,
          length,
          -length * 0.65,
          length * 0.32,
          varied(colors, leaves()),
        );
      blade(
        m,
        o,
        a + 0.5 * (leaves() - 0.5),
        length,
        -length * (0.45 + leaves()),
        length * 0.31,
        varied(colors, leaves()),
        varied(colors, leaves()),
      );
    }
  }
}
function cypress(
  m: Mesh,
  x: number,
  z: number,
  h: number,
  seed: number,
  detail: LandscapeDetail,
) {
  const rng = sequence(seed),
    tiers = detail === "low" ? 3 : 5;
  round(m, x, 0.1, z, 0.072, 0.047, h * 0.65, "#7a7158", "", 5);
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1),
      width = h * (0.17 - 0.097 * f);
    crown(
      m,
      [
        x + Math.sin(i * 1.8) * 0.04,
        0.27 * h + f * 0.61 * h,
        z + (rng() - 0.5) * 0.06,
      ],
      width,
      h * (0.29 - 0.09 * f),
      width * 0.87,
      ["#355a49", "#416951", "#537454", "#638264"],
      seed + i * 65,
      detail === "low" ? 4 : 5,
    );
  }
}
function shrub(
  m: Mesh,
  x: number,
  z: number,
  size: number,
  palette: string[],
  seed: number,
  detail: LandscapeDetail,
  flowering = false,
) {
  const lobes = detail === "low" ? 2 : 3,
    rng = sequence(seed);
  for (let k = 0; k < lobes; k++) {
    const a = k * 2.4 + rng() * 0.8;
    const c: Vec = [
      x + Math.cos(a) * size * 0.36,
      0.14 + size * (0.42 + 0.23 * rng()),
      z + Math.sin(a) * size * 0.32,
    ];
    crown(
      m,
      c,
      size * (0.54 + 0.13 * rng()),
      size * 0.59,
      size * (0.5 + 0.18 * rng()),
      palette,
      seed + k * 7,
      detail === "low" ? 4 : 5,
    );
    if (flowering) {
      const heads = detail === "low" ? 1 : 3;
      for (let j = 0; j < heads; j++) {
        const theta = j * 2.4 + k;
        const bud: Vec = [
          c[0] + size * 0.26 * Math.cos(theta),
          c[1] + size * (0.4 + 0.17 * rng()),
          c[2] + size * 0.25 * Math.sin(theta),
        ];
        crown(
          m,
          bud,
          size * 0.245,
          size * 0.235,
          size * 0.25,
          blossom,
          seed + k * 9 + j,
          4,
        );
      }
    }
  }
}
function spike(
  m: Mesh,
  a: Vec,
  b: Vec,
  w: number,
  colors: string[],
  seed: number,
) {
  const rng = sequence(seed),
    center: Vec = [
      (a[0] + b[0]) * 0.5,
      (a[1] + b[1]) * 0.5,
      (a[2] + b[2]) * 0.5,
    ];
  const ring: Vec[] = [
    [center[0] + w, center[1], center[2]],
    [center[0], center[1], center[2] - w],
    [center[0] - w, center[1], center[2]],
    [center[0], center[1], center[2] + w],
  ];
  for (let i = 0; i < 4; i++) {
    face(m, [b, ring[i], ring[(i + 1) % 4]], varied(colors, rng()));
    if (i % 2 === 0) face(m, [a, ring[(i + 1) % 4], ring[i]], colors[0]);
  }
}
function lavender(
  m: Mesh,
  x: number,
  z: number,
  size: number,
  seed: number,
  detail: LandscapeDetail,
) {
  crown(
    m,
    [x, 0.18, z],
    size * 0.76,
    size * 0.24,
    size * 0.53,
    ["#526e59", "#5f7b61", "#718b70"],
    seed,
    5,
  );
  const rng = sequence(seed),
    count = detail === "low" ? 6 : detail === "ultra" ? 20 : 13;
  // Lower, interlocked flowering panicles keep the drift legible in the whole-house view.
  for (let j = 0; j < 3; j++) {
    const theta = j * 2.39996 + (seed % 6) * 0.32;
    const panicle: Vec = [
      x + size * 0.29 * Math.cos(theta),
      0.14 + size * (0.48 + 0.06 * (j % 2)),
      z + size * 0.25 * Math.sin(theta),
    ];
    crown(
      m,
      panicle,
      size * 0.29,
      size * 0.21,
      size * 0.26,
      flowers,
      seed + j * 27,
      4,
    );
  }
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996,
      r = Math.sqrt((i + 0.5) / count),
      h = size * (0.55 + 0.4 * rng() - 0.13 * r);
    const base: Vec = [
      x + size * 0.27 * r * Math.cos(a),
      0.17,
      z + size * 0.24 * r * Math.sin(a),
    ];
    const head: Vec = [
      x + size * 0.7 * r * Math.cos(a),
      0.13 + h,
      z + size * 0.52 * r * Math.sin(a),
    ];
    const start: Vec = [
      head[0] - (head[0] - base[0]) * 0.19,
      head[1] - size * 0.37,
      head[2] - (head[2] - base[2]) * 0.19,
    ];
    face(
      m,
      [
        [base[0] - 0.017, base[1], base[2]],
        [base[0] + 0.017, base[1], base[2]],
        start,
      ],
      "#74836a",
    );
    spike(m, start, head, 0.057 + size * 0.035, flowers, seed + i * 13);
  }
}
function grasses(
  m: Mesh,
  x: number,
  z: number,
  size: number,
  seed: number,
  detail: LandscapeDetail,
  reeds = false,
) {
  const rng = sequence(seed),
    n = detail === "low" ? 5 : detail === "ultra" ? 14 : 10;
  const colors = reeds
    ? ["#9b9c6e", "#adb17d", "#c6bf8d"]
    : ["#476f54", "#65906a", "#88a77d"];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rng() * 0.37,
      r = size * 0.17 * Math.sqrt(rng()),
      height = size * (0.48 + 0.58 * rng());
    const o: Vec = [x + r * Math.cos(a), 0.117, z + r * Math.sin(a)];
    const reach = size * (reeds ? 0.32 : 0.66) * (0.48 + 0.73 * rng());
    blade(
      m,
      o,
      a,
      reach,
      height,
      (reeds ? 0.024 : 0.079) * size,
      varied(colors, rng()),
      colors[0],
    );
    if (reeds && i % 3 === 1) {
      const top: Vec = [
        o[0] + reach * Math.cos(a),
        o[1] + height,
        o[2] + reach * Math.sin(a),
      ];
      spike(
        m,
        top,
        [top[0] + 0.035, top[1] + size * 0.18, top[2] + 0.02],
        size * 0.028,
        ["#b9ab83", "#d0c397", "#e1d0a6"],
        seed + i,
      );
    }
  }
}
function borders(m: Mesh, detail: LandscapeDetail) {
  // Shrubs and flowering drifts follow the soil boundary, in layers below the taller stems.
  const westTrees: [number, number, number, string[], boolean][] = [
    [-4.71, -2.83, 3.89, maple, false],
    [-4.55, 2.25, 4.57, sages, true],
    [-4.22, 7.14, 4.92, maple, false],
    [-4.32, 11.16, 3.82, lime, true],
    [-4.08, 15.02, 3.47, sages, true],
    [12.96, -10.82, 4.26, maple, false],
    [9.99, -10.8, 3.62, lime, true],
    [15.46, 3.02, 3.77, sages, true],
  ];
  westTrees.forEach(([x, z, h, p, slender], i) =>
    tree(m, x, z, h, p, 191 + i * 53, detail, slender),
  );
  for (const [x, z, h] of [
    [-0.6, -10.93, 2.9],
    [2.9, -10.94, 2.4],
    [7.1, -10.9, 3.2],
    [-4.8, 4.35, 2.73],
  ])
    cypress(m, x, z, h, Math.round(429 + x * 13), detail);
  const areas: [number, number, number, string[], boolean][] = [
    [-4.77, -0.48, 0.96, darkGreens, false],
    [-3.92, 1.24, 0.83, sages, true],
    [-4.37, 3.69, 1.0, darkGreens, false],
    [-3.47, 5.03, 0.76, darkGreens, true],
    [-4.66, 8.59, 0.84, darkGreens, true],
    [-4.23, 9.65, 0.76, sages, false],
    [-3.65, 12.15, 0.76, darkGreens, false],
    [-3.5, 14.16, 0.88, sages, true],
    [-4.57, 16.31, 0.85, darkGreens, false],
    [-4.8, 17.6, 0.64, darkGreens, true],
    [-2.0, -10.95, 0.82, darkGreens, true],
    [4.8, -10.97, 0.71, sages, false],
    [8.5, -10.92, 0.64, darkGreens, true],
    [14.9, -3.5, 0.74, darkGreens, false],
    [15.43, -0.42, 0.76, darkGreens, true],
    [15.42, 5.11, 0.78, sages, false],
    [15.37, 7.47, 0.73, darkGreens, true],
  ];
  areas.forEach(([x, z, s, p, b], i) =>
    shrub(m, x, z, s * 1.38, p, 307 + i * 197, detail, b),
  );
  const drifts: [number, number, number][] = [
    [-3.43, 3.26, 0.77],
    [-3.36, 3.95, 0.71],
    [-3.6, 6.8, 0.77],
    [-3.77, 7.45, 0.73],
    [-3.65, 11.35, 0.81],
    [-3.15, 12.64, 0.8],
    [-3.11, 13.39, 0.71],
    [-4.37, 16.89, 0.72],
    [1.0, -10.97, 0.7],
    [1.78, -10.9, 0.71],
    [5.79, -10.88, 0.66],
    [6.42, -10.88, 0.68],
    [15.31, 1.3, 0.66],
    [15.4, 6.49, 0.69],
  ];
  drifts.forEach(([x, z, s], i) =>
    lavender(m, x, z, s * 1.28, 701 + i * 157, detail),
  );
  // A continuous understorey links the flowering specimens. Deep-green foliage sits behind the drifts.
  for (let i = 0; i < 19; i++) {
    const z = -3.82 + i * 1.12,
      x = -4.86 + 0.2 * Math.sin(i * 2.4),
      size = 0.88 + 0.26 * Math.cos(i * 1.57);
    crown(
      m,
      [x, 0.51, z],
      size * 0.76,
      size * 0.79,
      size * 1.02,
      i % 3 ? darkGreens : sages,
      45667 + i * 29,
      detail === "low" ? 4 : 5,
    );
  }
  for (let i = 0; i < 20; i++) {
    const x = -4.55 + i * 1.01,
      z = -11.05 + 0.11 * Math.sin(i * 1.7),
      s = 0.79 + 0.18 * Math.cos(i * 1.34);
    crown(
      m,
      [x, 0.51, z],
      s * 1.06,
      s * 0.83,
      s * 0.74,
      i % 3 ? darkGreens : sages,
      19777 + i * 53,
      detail === "low" ? 4 : 5,
    );
    if (i % 5 === 1 || i % 5 === 2)
      lavender(m, x, -10.66, 0.83, 38291 + i * 41, detail);
  }
  for (let i = 0; i < 14; i++) {
    const z = -3.68 + i * 1.15,
      s = 0.74 + 0.1 * Math.sin(i * 2.4);
    crown(
      m,
      [15.4, 0.45, z],
      s * 0.62,
      s * 0.73,
      s * 0.99,
      i % 4 ? sages : darkGreens,
      4465 + i * 73,
      detail === "low" ? 4 : 5,
    );
  }
  for (const [i, [x, z, s]] of [
    [-4.98, 1.13, 1.43],
    [-4.74, 6.2, 1.21],
    [-4.94, 12.82, 1.32],
    [-4.38, 17.31, 1.03],
    [3.68, -10.9, 0.98],
    [11.4, -10.9, 1.06],
    [15.42, 8.71, 1.17],
  ].entries())
    grasses(m, x, z, s, 228 + i * 53, detail, true);
}

function contact(
  m: Mesh,
  x: number,
  z: number,
  rx: number,
  rz: number,
  seed = 1,
) {
  const colors = ["#a3b477", "#9eaf74", "#97aa70"];
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.14;
    const y = 0.0415 + i * 0.0009;
    disk(m, ring(x, y, z, rx * s, rz * s, 15, seed), [x, y, z], colors[i]);
  }
}
function boulder(
  m: Mesh,
  x: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  seed: number,
) {
  const base = ring(x, 0.071, z, rx, rz, 6, seed),
    shoulder = ring(
      x + 0.06 * rx,
      0.087 + ry * 0.52,
      z,
      rx * 0.93,
      rz * 0.92,
      6,
      seed,
    ),
    top = ring(
      x + 0.14 * rx,
      0.09 + ry,
      z + 0.06 * rz,
      rx * 0.6,
      rz * 0.66,
      6,
      seed,
    );
  band(m, base, shoulder, stone[(seed + 1) % 4]);
  band(m, shoulder, top, stone[seed % 4]);
  face(m, top, stone[(seed + 2) % 4]);
}
function ripple(
  m: Mesh,
  x: number,
  z: number,
  rx: number,
  rz: number,
  seed: number,
) {
  const a = seed * 0.35,
    count = 7;
  for (let i = 0; i < count; i++) {
    const t = a + i * 0.092,
      next = t + 0.092,
      w = 0.007 + 0.004 * Math.sin((Math.PI * i) / count);
    face(
      m,
      [
        [x + rx * Math.cos(t), 0.12, z + rz * Math.sin(t)],
        [x + rx * Math.cos(next), 0.12, z + rz * Math.sin(next)],
        [x + (rx - w) * Math.cos(next), 0.12, z + (rz - w) * Math.sin(next)],
        [x + (rx - w) * Math.cos(t), 0.12, z + (rz - w) * Math.sin(t)],
      ],
      "#a9c9bd",
    );
  }
}
function lilyPads(m: Mesh, x: number, z: number, detail: LandscapeDetail) {
  const count = detail === "low" ? 4 : 8;
  for (let k = 0; k < count; k++) {
    const a = k * 2.4,
      rx = 0.095 + 0.045 * (k % 3),
      px = x + 0.42 * Math.sqrt(k / count) * Math.cos(a),
      pz = z + 0.34 * Math.sqrt(k / count) * Math.sin(a);
    const center: Vec = [px, 0.126, pz];
    // Wedge at the petiole and slight radial folds give floating pads individually visible profiles.
    for (let i = 0; i < 8; i++) {
      const t = k * 0.91 + i * 0.7,
        u = t + 0.7;
      face(
        m,
        [
          center,
          [
            px + rx * Math.cos(t),
            0.127 + 0.002 * (i % 2),
            pz + rx * 0.8 * Math.sin(t),
          ],
          [
            px + rx * Math.cos(u),
            0.127 + 0.002 * ((i + 1) % 2),
            pz + rx * 0.8 * Math.sin(u),
          ],
        ],
        i % 4 ? "#73986f" : "#8eaa76",
      );
    }
    if (k === 1 || k === 4) {
      for (let i = 0; i < 6; i++)
        blade(
          m,
          [px, 0.134, pz],
          (i * tau) / 6,
          0.061,
          0.039,
          0.026,
          "#f3e6c4",
          "#decfae",
        );
      round(m, px, 0.14, pz, 0.026, 0.012, 0.045, "#d6ab61", "", 5);
    }
  }
}
function waterGarden(m: Mesh, detail: LandscapeDetail) {
  const [x, z] = pond;
  soilLens(m, x, z, 2.45, 1.93);
  const shore = ring(x, 0.112, z, 1.56, 1.2, 31, 0.8),
    outer = ring(x, 0.114, z, 1.49, 1.13, 31, 0.8),
    middle = ring(x - 0.06, 0.115, z + 0.04, 1.25, 0.91, 31, 0.8),
    deep = ring(x - 0.12, 0.117, z + 0.09, 0.91, 0.66, 31, 0.8);
  band(m, shore, outer, "#848a77");
  const water = { roughness: 0.23 };
  band(m, outer, middle, "#88b5a9", water);
  band(m, middle, deep, "#76aaa0", water);
  disk(m, deep, [x - 0.12, 0.117, z + 0.09], "#6a9b97", water);
  for (const [i, [dx, dz, w, d]] of [
    [-0.35, 0.28, 0.51, 0.21],
    [0.01, -0.35, 0.81, 0.21],
    [0.42, -0.18, 0.49, 0.2],
    [0.3, 0.22, 0.6, 0.21],
  ].entries())
    ripple(m, x + dx, z + dz, w, d, 4 + i * 6);
  const rocks = detail === "low" ? 11 : 17,
    rng = sequence(291);
  for (let i = 0; i < rocks; i++) {
    const a = 0.1 + (i * tau) / rocks;
    const s = 0.19 + 0.14 * rng();
    boulder(
      m,
      x + 1.54 * Math.cos(a),
      z + 1.18 * Math.sin(a),
      s * 1.11,
      s * (0.56 + rng() * 0.47),
      s * 0.78,
      8 + i,
    );
  }
  lilyPads(m, x + 0.57, z + 0.27, detail);
  for (const [i, [dx, dz, s, r]] of [
    [-1.57, -0.78, 0.87, 0],
    [-0.92, -1.4, 0.96, 1],
    [0.12, -1.52, 0.87, 1],
    [1.39, -0.82, 1.04, 1],
    [1.85, 0.13, 0.67, 0],
    [1.36, 0.91, 0.67, 0],
    [-0.79, 1.48, 0.61, 0],
  ].entries())
    grasses(m, x + dx, z + dz, s, 901 + i * 137, detail, Boolean(r));
  shrub(m, x - 1.7, z + 0.15, 0.65, sages, 30581, detail, true);
  shrub(m, x + 0.34, z + 1.47, 0.64, darkGreens, 37531, detail, true);
  lavender(m, x - 1.35, z + 0.9, 0.66, 22312, detail);
  lavender(m, x - 0.89, z + 1.29, 0.62, 69341, detail);
}
function chair(
  m: Mesh,
  cx: number,
  cz: number,
  yaw: number,
  detail: LandscapeDetail,
) {
  const p = (x: number, y: number, z: number) =>
    toWorld([cx, cz], yaw, x, 0.04 + y, z);
  const frame = "#414c43",
    timber = ["#ad8963", "#be9b70", "#b28f65"];
  for (const sign of [-1, 1]) {
    const x = sign * 0.255;
    branch(m, p(x, 0.01, -0.37), p(x, 0.51, 0.22), 0.025, frame);
    branch(m, p(x, 0.01, 0.38), p(x, 0.61, -0.28), 0.025, frame);
    branch(m, p(x, 0.36, 0.28), p(x, 0.42, -0.2), 0.026, frame);
    branch(m, p(x, 0.42, -0.2), p(x, 0.95, -0.4), 0.027, frame);
    branch(m, p(x, 0.57, -0.21), p(x, 0.57, 0.22), 0.024, "#a18465");
    branch(m, p(x, 0.38, 0.18), p(x, 0.57, 0.18), 0.018, frame);
  }
  branch(m, p(-0.255, 0.15, -0.25), p(0.255, 0.15, -0.25), 0.021, frame);
  branch(m, p(-0.255, 0.95, -0.4), p(0.255, 0.95, -0.4), 0.023, frame);
  const slats = detail === "low" ? 4 : 6;
  for (let i = 0; i < slats; i++) {
    const x = -0.222 + (0.447 * i) / slats,
      w = 0.447 / slats - 0.012;
    face(
      m,
      [
        p(x, 0.424, -0.19),
        p(x, 0.378, 0.27),
        p(x + w, 0.378, 0.27),
        p(x + w, 0.424, -0.19),
      ],
      timber[i % 3],
    );
    const lo = p(x, 0.455, -0.202),
      hi = p(x, 0.91, -0.383),
      hi2 = p(x + w, 0.91, -0.383),
      lo2 = p(x + w, 0.455, -0.202);
    face(m, [lo, hi, hi2, lo2], timber[(i + 1) % 3]);
  }
}
function pushBeam(
  m: Mesh,
  origin: PlanPoint,
  yaw: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
) {
  const p = (u: number, v: number, t: number) => toWorld(origin, yaw, u, v, t);
  const lo = [p(x, y, z), p(x + w, y, z), p(x + w, y, z + d), p(x, y, z + d)];
  const hi = lo.map(([u, v, t]) => [u, v + h, t] as Vec);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    face(m, [lo[i], hi[i], hi[j], lo[j]], color);
  }
  face(m, [...hi].reverse(), color);
}
function entrance(m: Mesh) {
  const cedar = "#a96f4d",
    faceWood = "#c18b61";
  for (const sign of [-1, 1]) {
    const x = 0.88 * sign;
    pushBeam(
      m,
      arch,
      archYaw,
      x - 0.13,
      0.04,
      -0.13,
      0.26,
      0.16,
      0.26,
      "#92876f",
    );
    pushBeam(
      m,
      arch,
      archYaw,
      x - 0.084,
      0.2,
      -0.084,
      0.168,
      2.06,
      0.168,
      cedar,
    );
    pushBeam(
      m,
      arch,
      archYaw,
      x - 0.04,
      0.22,
      0.087,
      0.081,
      2.0,
      0.011,
      faceWood,
    );
  }
  pushBeam(m, arch, archYaw, -1.17, 2.19, -0.112, 2.34, 0.18, 0.224, cedar);
  pushBeam(m, arch, archYaw, -1.21, 2.36, -0.139, 2.42, 0.043, 0.278, faceWood);
  pushBeam(m, arch, archYaw, -0.91, 1.91, -0.054, 1.82, 0.09, 0.108, faceWood);
  for (const x of [-0.87, 0.87]) {
    const a = toWorld(arch, archYaw, x, 0.38, 0),
      b = toWorld(arch, archYaw, x + 0.11 * Math.sign(x), 1.81, 0);
    branch(m, a, b, 0.018, "#6d8057");
    for (let i = 0; i < 7; i++) {
      const t = i / 7,
        y = 0.5 + t * 1.3;
      const o = toWorld(arch, archYaw, x + 0.092 * Math.cos(i * 2.1), y, 0.1);
      blade(m, o, i * 2.4, 0.148, 0.075, 0.045, "#829c66", "#66845b");
    }
  }
}

function floweringCrescent(m: Mesh, detail: LandscapeDetail) {
  const count = 44;
  for (let i = 0; i < count; i++) {
    const x = 0.52 + (11.72 * i) / count,
      next = 0.52 + (11.72 * (i + 1)) / count,
      a = crescent(x),
      b = crescent(next);
    // Slightly below the soil lens where the border merges into the water garden.
    const lo: Vec = [x, 0.095, a.z - a.radius],
      hi: Vec = [x, 0.095, a.z + a.radius],
      nextLo: Vec = [next, 0.095, b.z - b.radius],
      nextHi: Vec = [next, 0.095, b.z + b.radius];
    face(m, [lo, hi, nextHi, nextLo], "#746b53");
    face(
      m,
      [hi, [x, 0.04, hi[2] + 0.05], [next, 0.04, nextHi[2] + 0.05], nextHi],
      "#85835e",
    );
    face(
      m,
      [nextLo, [next, 0.04, nextLo[2] - 0.05], [x, 0.04, lo[2] - 0.05], lo],
      "#85835e",
    );
  }
  const foreground: [number, number, number, boolean][] = [
    [1.29, -0.11, 0.89, false],
    [2.13, 0.16, 1.03, true],
    [3.45, 0.15, 1.02, false],
    [4.68, 0.09, 0.92, false],
    [5.6, -0.1, 0.78, true],
    [6.56, 0.23, 0.94, false],
    [7.74, 0.14, 0.99, false],
    [8.5, -0.17, 0.74, true],
    [9.56, 0.08, 0.86, false],
    [10.31, 0.24, 0.81, false],
    [11.29, -0.01, 0.79, true],
  ];
  for (const [index, [x, dz, s, bloom]] of foreground.entries()) {
    const z = crescent(x).z + dz;
    shrub(
      m,
      x,
      z,
      s,
      index % 3 ? darkGreens : sages,
      7033 + index * 93,
      detail,
      bloom,
    );
    if (index % 3 === 1)
      grasses(m, x + 0.34, z + 0.32, s * 0.89, 481 + index * 17, detail);
  }
  tree(m, 2.23, crescent(2.23).z - 0.22, 3.3, lime, 69143, detail, true);
  for (const [i, x] of [
    1.59, 2.83, 3.47, 4.09, 5.4, 6.33, 7.02, 7.69, 9.06, 9.69, 11.13,
  ].entries())
    lavender(
      m,
      x,
      crescent(x).z - 0.52,
      0.68 + (i % 3) * 0.085,
      8818 + i * 21,
      detail,
    );
}

/** Draw static hardscape and ornamental planting into the same world as the house and saved pots. */
function pottingCourt(m: Mesh, detail: LandscapeDetail) {
  const oak = "#b18b65",
    frame = "#946e4e",
    timber = "#c7a67d";
  // Flush pavers keep wheelchair and foot access open from the lawn.
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++)
      box(
        m,
        11.63 + col * 0.8,
        0.041,
        10.2 + row * 0.65,
        0.786,
        0.009,
        0.634,
        stone[(row + col) % 4],
      );
  for (const [x, z] of pottingPosts) {
    box(m, x - 0.065, 0.05, z - 0.065, 0.13, 2.22, 0.13, oak);
    box(m, x - 0.074, 0.05, z - 0.074, 0.148, 0.16, 0.148, "#687169");
  }
  for (const z of [10.46, 12.54])
    box(m, 11.69, 2.25, z - 0.075, 3.02, 0.18, 0.15, frame);
  for (const x of [11.9, 14.5])
    box(m, x - 0.065, 2.21, 10.29, 0.13, 0.12, 2.45, oak);
  const slats = detail === "low" ? 8 : 14;
  for (let i = 0; i < slats; i++)
    box(
      m,
      11.69 + (i * 2.96) / (slats - 1),
      2.43,
      10.23,
      0.069,
      0.09,
      2.55,
      timber,
    );
  for (const x of [12.22, 14.18])
    for (const z of [10.53, 10.9])
      box(m, x - 0.04, 0.052, z - 0.04, 0.08, 0.8, 0.08, frame);
  box(m, pottingBench.minX, 0.85, pottingBench.minZ, 2.16, 0.085, 0.54, oak);
  box(m, 12.18, 0.32, 10.5, 2.04, 0.055, 0.42, timber);
  for (const z of [10.55, 10.85])
    box(m, 12.15, 0.74, z, 2.09, 0.105, 0.05, frame);
  // Tapered clay vessels with a deep, open mouth and a turned rim.
  function vessel(x: number, y: number, z: number, r: number, h: number) {
    const sides = detail === "low" ? 8 : 12;
    const base = ring(x, y, z, r * 0.66, r * 0.66, sides),
      shoulder = ring(x, y + h * 0.84, z, r, r, sides);
    const lip = ring(x, y + h, z, r * 1.06, r * 1.06, sides),
      inner = ring(x, y + h, z, r * 0.86, r * 0.86, sides),
      well = ring(x, y + h * 0.57, z, r * 0.72, r * 0.72, sides);
    band(m, base, shoulder, "#bd7957");
    band(m, shoulder, lip, "#c98862");
    band(m, lip, inner, "#dda584");
    band(m, inner, well, "#956246");
    disk(m, well, [x, y + h * 0.57, z], "#70513e");
  }
  vessel(12.49, 0.935, 10.72, 0.17, 0.31);
  vessel(12.98, 0.935, 10.67, 0.12, 0.23);
  vessel(13.26, 0.375, 10.72, 0.18, 0.27);
  if (detail !== "low") {
    vessel(13.76, 0.375, 10.72, 0.14, 0.23);
    // A trowel has a wooden grip, shank and folded steel blade.
    branch(m, [13.83, 0.961, 10.72], [14.02, 0.961, 10.81], 0.035, frame);
    branch(m, [13.73, 0.956, 10.67], [13.83, 0.961, 10.72], 0.012, "#7c8980");
    const root: Vec = [13.74, 0.953, 10.68],
      tip: Vec = [13.48, 0.954, 10.56],
      mid: Vec = [13.62, 0.974, 10.62];
    face(m, [[13.65, 0.945, 10.56], tip, mid, root], "#a5b0a8");
    face(m, [[13.59, 0.947, 10.72], root, mid, tip], "#86988f");
  }
  // Train two stems against the back lattice. Foliage is folded geometry.
  for (let i = 0; i < 6; i++)
    box(m, 11.94 + i * 0.49, 1.04, 10.475, 0.035, 1.2, 0.026, timber);
  for (let i = 0; i < 4; i++)
    box(m, 11.93, 1.18 + i * 0.29, 10.47, 2.59, 0.034, 0.035, timber);
  for (const x of [11.97, 14.43]) {
    let last: Vec = [x, 0.052, 10.49];
    const steps = detail === "low" ? 7 : 13;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        dir = x < 13 ? 1 : -1;
      const at: Vec = [
        x + dir * (0.32 * t + 0.16 * Math.sin(t * 7)),
        0.052 + t * 2.32,
        10.52 + 0.045 * Math.sin(t * 10),
      ];
      branch(m, last, at, 0.016, "#737c49");
      const color = sages[i % sages.length];
      blade(m, at, i % 2 ? 0.25 : 2.86, 0.17, 0.06, 0.058, color);
      if (detail !== "low")
        blade(
          m,
          at,
          i % 2 ? 2.47 : 0.51,
          0.15,
          -0.07,
          0.053,
          darkGreens[i % 4],
        );
      last = at;
    }
  }
}
export function landscape(m: Mesh, detail: LandscapeDetail = "balanced") {
  const start = m.length;
  plinth(m);
  contact(m, -3.13, 5.93, 2.15, 1.41, 2.1);
  contact(m, -3.38, 10.75, 1.57, 1.05, 1.4);
  contact(m, -3.09, 14.49, 1.56, 1.0, 0.6);
  contact(m, 13.51, -10.76, 1.44, 0.78, 1.4);
  paving(m, detail);
  borderBed(m);
  managedBed(m, GARDEN_BEDS.front);
  managedBed(m, GARDEN_BEDS.back);
  screen(m, [-5.76, -11.25], [15.65, -11.25], detail);
  screen(m, [-5.76, -11.25], [-5.76, 18.42], detail, true);
  // A low coping on the open boundaries preserves the view over the garden from the entry.
  box(m, 15.7, 0.04, -11.01, 0.09, 0.2, 20.57, "#c4b594");
  borders(m, detail);
  floweringCrescent(m, detail);
  waterGarden(m, detail);
  pottingCourt(m, detail);
  entrance(m);
  for (const [cx, cz, yaw] of chairs) {
    contact(m, cx + 0.13, cz - 0.09, 0.5, 0.47);
    chair(m, cx, cz, yaw, detail);
  }
  const [tx, tz] = table;
  for (let i = 0; i < 3; i++) {
    const a = (tau * i) / 3;
    branch(
      m,
      [tx + 0.15 * Math.cos(a), 0.045, tz + 0.15 * Math.sin(a)],
      [tx + 0.1 * Math.cos(a), 0.4, tz + 0.1 * Math.sin(a)],
      0.018,
      "#465449",
    );
  }
  round(
    m,
    tx,
    0.4,
    tz,
    0.26,
    0.26,
    0.04,
    "#c9aa7b",
    "",
    detail === "low" ? 7 : 11,
  );
  // All plant, walk and camera coordinates use finished lawn as their common zero.
  const shifted = new Set<Vec>();
  for (let i = start; i < m.length; i++) {
    const f = m[i];
    f.group = "yard";
    f.center[1] -= turfThickness;
    for (const p of f.points)
      if (!shifted.has(p)) {
        p[1] -= turfThickness;
        shifted.add(p);
      }
  }
}
