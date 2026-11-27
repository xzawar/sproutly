// Convex faces with true 3D vertices. Both rendering paths consume this mesh.
export type Vec = [number, number, number];
export type Material = {
  roughness?: number;
  metalness?: number;
  opacity?: number;
};
export type ModelGroup = "house" | "walls" | "windows" | "roof" | "yard";
export const finishes = {
  plaster: { roughness: 0.93, metalness: 0 },
  timber: { roughness: 0.67, metalness: 0 },
  glass: { roughness: 0.17, metalness: 0.03, opacity: 0.23 },
  frame: { roughness: 0.44, metalness: 0.52 },
  roof: { roughness: 0.59, metalness: 0.26 },
} satisfies Record<string, Material>;
export type Face = {
  group?: ModelGroup;
  points: Vec[];
  rgb: Vec;
  owner: string;
  center: Vec;
  albedo?: Vec;
  material?: Material;
};
export type Mesh = Face[];
const palette = new Map<string, Vec>();
const architecturalPaint = new Map<string, Material>([
  ["#a77752", finishes.timber],
  ["#caa075", finishes.timber],
  ["#354844", finishes.frame],
  ["#596764", finishes.frame],
  ["#65746f", finishes.roof],
]);
function pigment(hex: string): Vec {
  let rgb = palette.get(hex);
  if (!rgb) {
    const n = parseInt(hex.slice(1), 16);
    rgb = [n >> 16, (n >> 8) & 255, n & 255];
    palette.set(hex, rgb);
  }
  return rgb;
}
export function faceNormal(points: Vec[]): Vec {
  const a = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const b = points[i],
      c = points[i + 1];
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    const x = uy * vz - uz * vy,
      y = uz * vx - ux * vz,
      z = ux * vy - uy * vx;
    const length = Math.hypot(x, y, z);
    if (length > 1e-12) return [x / length, y / length, z / length];
  }
  return [0, 0, 0];
}
export function labelFaces(
  mesh: Mesh,
  start: number,
  group: ModelGroup,
  material?: Material,
) {
  for (let i = start; i < mesh.length; i++) {
    mesh[i].group ??= group;
    mesh[i].material ??= material;
  }
}
export function face(
  m: Mesh,
  points: Vec[],
  color: string,
  id = "",
  material?: Material,
) {
  const n = faceNormal(points);
  if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
  const light =
    0.76 +
    (0.065 * (n[1] + 1)) / 2 +
    0.24 * Math.max(0, -0.45 * n[0] + 0.84 * n[1] + 0.33 * n[2]);
  const rgb = pigment(color).map((x) =>
    Math.min(255, Math.round(x * light)),
  ) as Vec;
  const center = [0, 1, 2].map(
    (i) => points.reduce((s, p) => s + p[i], 0) / points.length,
  ) as Vec;
  m.push({
    points,
    rgb,
    center,
    owner: id,
    albedo: pigment(color),
    material: material ?? architecturalPaint.get(color),
  });
}
export function box(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  id = "",
  includeTop = true,
) {
  const a: Vec = [x, y, z],
    b: Vec = [x + w, y, z],
    c: Vec = [x + w, y, z + d],
    e: Vec = [x, y, z + d];
  const up = (p: Vec): Vec => [p[0], p[1] + h, p[2]];
  const [A, B, C, E] = [a, b, c, e].map(up);
  if (includeTop) face(m, [A, E, C, B], color, id);
  for (const pts of [
    [a, A, B, b],
    [b, B, C, c],
    [c, C, E, e],
    [e, E, A, a],
    [a, b, c, e],
  ])
    face(m, pts, color, id);
}
export function round(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  bottom: number,
  top: number,
  height: number,
  color: string,
  id = "",
  steps = 12,
) {
  const lo: Vec[] = [],
    hi: Vec[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i * 2 * Math.PI) / steps,
      dx = Math.cos(t),
      dz = Math.sin(t);
    lo.push([x + dx * bottom, y, z + dz * bottom]);
    hi.push([x + dx * top, y + height, z + dz * top]);
  }
  for (let i = 0; i < steps; i++) {
    const j = (i + 1) % steps;
    face(m, [lo[i], hi[i], hi[j], lo[j]], color, id);
  }
  if (top > 0) face(m, hi.reverse(), color, id);
}
export function globe(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  color: string,
  id = "",
  sides = 8,
) {
  const at = (r: number, i: number): Vec => {
    const t = (Math.PI * r) / 4,
      k = (2 * Math.PI * (i + 0.18 * (r % 2))) / sides;
    return [
      x + rx * Math.sin(t) * Math.cos(k),
      y + ry * Math.cos(t),
      z + rz * Math.sin(t) * Math.sin(k),
    ];
  };
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < sides; i++) {
      const a = at(r, i),
        b = at(r, i + 1),
        c = at(r + 1, i + 1),
        d = at(r + 1, i);
      if (r !== 0) face(m, [a, b, d], color, id);
      if (r !== 3) face(m, [b, c, d], color, id);
    }
}
export function branch(
  m: Mesh,
  a: Vec,
  b: Vec,
  r: number,
  color: string,
  id = "",
) {
  const dx = b[0] - a[0],
    dz = b[2] - a[2],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy, dz) || 1;
  const horizontal = Math.hypot(dx, dz);
  const u: Vec =
    horizontal > 0.001 ? [-dz / horizontal, 0, dx / horizontal] : [1, 0, 0];
  const v: Vec = [
    (dy * u[2] - dz * u[1]) / length,
    (dz * u[0] - dx * u[2]) / length,
    (dx * u[1] - dy * u[0]) / length,
  ];
  const rim = (p: Vec, i: number): Vec =>
    p.map(
      (a, j) =>
        a +
        r *
          (u[j] * Math.cos((i * Math.PI) / 2) +
            v[j] * Math.sin((i * Math.PI) / 2)),
    ) as Vec;
  for (let i = 0; i < 4; i++)
    face(m, [rim(a, i), rim(a, i + 1), rim(b, i + 1), rim(b, i)], color, id);
}
