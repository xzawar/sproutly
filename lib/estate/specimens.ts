import { branch, face, globe, round, type Mesh, type Vec } from "./mesh";
import type { Species } from "./garden";
import type { PlantHealth } from "./health";

export type PlantDetail = "low" | "balanced" | "ultra";
export interface SpecimenOptions {
  detail?: PlantDetail;
  health?: Pick<PlantHealth, "stress" | "dryness">;
  inGround?: boolean;
  /** Signed breeze amplitude. Zero renders the resting pose. */
  sway?: number;
  /** Uniform appearance animation, from soil to full size at 1. */
  emergence?: number;
}
const TAU = 2 * Math.PI,
  GOLDEN = 2.39996323;
const green = ["#487b4d", "#5b904f", "#356b49", "#83a661", "#608e58"];
const root: Vec = [0, 0, 0];
const polar = (a: number, reach: number, height: number, from = root): Vec => [
  from[0] + Math.cos(a) * reach,
  from[1] + height,
  from[2] + Math.sin(a) * reach,
];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const between = (a: Vec, b: Vec, t: number): Vec => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const tier = (detail: PlantDetail) =>
  detail === "low" ? 0 : detail === "ultra" ? 2 : 1;
// Geometry roles survive until the template is posed and colored. The returned mesh
// uses the plant ID on every face, including the rim, soil and petals, for picking.
const foliage = "leaf",
  stem = "stem",
  bloom = "flower",
  pot = "pot",
  soil = "soil";

type LeafStyle = "plain" | "fleshy" | "striped" | "split";
function leaf(
  m: Mesh,
  from: Vec,
  angle: number,
  reach: number,
  rise: number,
  width: number,
  color: string,
  style: LeafStyle = "plain",
  role = foliage,
) {
  const dx = Math.cos(angle),
    dz = Math.sin(angle);
  const fleshy = style === "fleshy",
    split = style === "split";
  const stops = split
    ? [0, 0.13, 0.24, 0.29, 0.39, 0.48, 0.54, 0.63, 0.72, 0.77, 0.89, 1]
    : [0, 0.26, 0.6, 1];
  const widths = split
    ? [0, 0.72, 0.98, 0.28, 0.98, 0.92, 0.3, 0.82, 0.67, 0.25, 0.44, 0]
    : [0, 1, 0.84, 0];
  function point(row: number, side: number, bottom = false): Vec {
    const t = stops[row],
      w = widths[row] * width;
    const fold = bottom
      ? -w * 0.38
      : (1 - Math.abs(side)) * w * (fleshy ? 0.74 : 0.3);
    return [
      from[0] + dx * t * reach - dz * side * w,
      from[1] +
        rise * t +
        Math.sin(Math.PI * t) * Math.abs(reach) * 0.28 +
        fold,
      from[2] + dz * t * reach + dx * side * w,
    ];
  }
  const bands =
    style === "striped" ? [0, 0.8, 1] : split ? [0, 0.36, 0.69, 1] : [0, 1];
  for (let i = 1; i < stops.length; i++)
    for (const sign of [-1, 1]) {
      for (let k = 1; k < bands.length; k++) {
        // Open fenestrations pass through the lamina, visible from either side.
        if (split && k === 2 && (i === 5 || (i === 8 && sign === 1))) continue;
        const inside = sign * bands[k - 1],
          outside = sign * bands[k];
        const points = [point(i - 1, inside), point(i, inside)];
        if (i !== stops.length - 1) points.push(point(i, outside));
        if (i !== 1) points.push(point(i - 1, outside));
        if (sign > 0) points.reverse();
        face(
          m,
          points,
          style === "striped" && k === 2 ? "#b4bb76" : color,
          role,
        );
      }
      if (fleshy) {
        const points = [point(i - 1, 0, true), point(i, 0, true)];
        if (i !== stops.length - 1) points.push(point(i, sign));
        if (i !== 1) points.push(point(i - 1, sign));
        if (sign < 0) points.reverse();
        face(m, points, color, role);
      }
    }
}

function thorn(
  m: Mesh,
  from: Vec,
  end: Vec,
  width: number,
  color: string,
  role = stem,
) {
  const dx = end[0] - from[0],
    dz = end[2] - from[2],
    horizontal = Math.hypot(dx, dz) || 1;
  const a: Vec = [
    from[0] - (dz / horizontal) * width,
    from[1],
    from[2] + (dx / horizontal) * width,
  ];
  const b: Vec = [
    from[0] + (dz / horizontal) * width,
    from[1],
    from[2] - (dx / horizontal) * width,
  ];
  const c: Vec = [from[0], from[1] + width * 1.5, from[2]];
  face(m, [a, b, end], color, role);
  face(m, [b, c, end], color, role);
  face(m, [c, a, end], color, role);
}

/** An overlapping, curved flower petal. Its upper lip and central fold are separate vertices. */
function cupPetal(
  m: Mesh,
  base: Vec,
  a: number,
  radius: number,
  height: number,
  width: number,
  color: string,
  pointed = false,
) {
  const at = (r: number, y: number, s: number) =>
    polar(a + Math.PI / 2, s, y, polar(a, r, 0, base));
  const left = at(radius * 0.57, height * 0.48, -width * 0.82),
    right = at(radius * 0.57, height * 0.48, width * 0.82);
  const spine = at(radius * 0.69, height * 0.58, 0),
    rim = at(radius * 1.08, height * (pointed ? 1.22 : 1.02), 0);
  const lipL = at(radius * 0.9, height * 0.86, -width),
    lipR = at(radius * 0.9, height * 0.86, width);
  face(m, [base, left, spine], color, bloom);
  face(m, [base, spine, right], color, bloom);
  face(m, [left, lipL, rim, spine], color, bloom);
  face(m, [spine, rim, lipR, right], color, bloom);
}
function rosette(m: Mesh, kind: "sword" | "aloe", quality: number) {
  const snake = kind === "sword",
    count = snake ? 7 + 2 * quality : 9 + 3 * quality;
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN,
      ring = i % 3,
      base = polar(a, 0.06 + ring * 0.03, 0);
    leaf(
      m,
      base,
      a,
      snake ? 0.12 + 0.1 * ring : 0.27 + 0.17 * ring,
      snake ? 0.75 + 0.21 * ring + 0.09 * Math.sin(i * 2) : 0.76 - 0.16 * ring,
      snake ? 0.08 + ring * 0.013 : 0.115 + ring * 0.014,
      snake
        ? ["#58834d", "#3e714e", "#6b935c"][ring]
        : ["#659e85", "#93baa3", "#548e78"][ring],
      snake ? "striped" : "fleshy",
    );
    if (quality > 0 && !snake && ring === 2) {
      const reach = 0.27 + 0.17 * ring,
        rise = 0.76 - 0.16 * ring;
      for (const t of [0.3, 0.55])
        for (const side of [-1, 1]) {
          const bladePoint = polar(
            a + (side * Math.PI) / 2,
            0.136 * (t < 0.4 ? 1 : 0.88),
            0,
            polar(
              a,
              reach * t,
              rise * t + Math.sin(Math.PI * t) * reach * 0.28,
              base,
            ),
          );
          thorn(
            m,
            bladePoint,
            polar(a + side * 0.89, 0.036, 0.027, bladePoint),
            0.009,
            "#b7cfb0",
            foliage,
          );
        }
    }
  }
}

function cactus(m: Mesh, quality: number) {
  const ribs = 7 + quality * 2;
  function body(base: Vec, radius: number, height: number, detailed: boolean) {
    const levels = [0.0, 0.12, 0.38, 0.7, 0.89, 0.98],
      shape = [0.7, 0.94, 1, 0.91, 0.67, 0.21];
    const at = (i: number, j: number): Vec =>
      polar(
        (i * Math.PI) / ribs,
        radius * shape[j] * (i % 2 ? 0.82 : 1),
        levels[j] * height,
        base,
      );
    for (let i = 0; i < ribs * 2; i++) {
      for (let j = 1; j < levels.length; j++)
        face(
          m,
          [at(i, j - 1), at(i, j), at(i + 1, j), at(i + 1, j - 1)],
          i % 2 ? "#55936d" : "#397758",
          foliage,
        );
      face(
        m,
        [at(i, 5), polar(0, 0, height, base), at(i + 1, 5)],
        "#87a77b",
        foliage,
      );
      if (i % 2 || !detailed) continue;
      for (let j = 1; j <= (quality === 0 ? 2 : 4); j++) {
        const a = (i * Math.PI) / ribs,
          anchor = at(i, j);
        for (const side of quality === 0 ? [0] : [-0.48, 0.48])
          thorn(
            m,
            anchor,
            polar(a + side, 0.047 + quality * 0.006, 0.033, anchor),
            0.01,
            "#d7c6a0",
            foliage,
          );
      }
    }
  }
  body(root, 0.255, 1.0, true);
  body([0.19, 0.015, 0.1], 0.134, 0.46, quality > 0);
  if (quality > 0) body([-0.18, 0.015, -0.05], 0.099, 0.37, false);
  const bud: Vec = [0.045, 0.97, 0.032];
  for (let i = 0; i < 5; i++)
    cupPetal(m, bud, (i * TAU) / 5, 0.063, 0.055, 0.028, "#db8b79", true);
}
function rose(m: Mesh, quality: number) {
  const count = 2 + quality;
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN + 0.35,
      joint = polar(a, 0.1, 0.39),
      top = polar(a, 0.21 + (i % 2) * 0.045, 0.74 + (i % 3) * 0.15);
    branch(m, root, joint, 0.024, "#648157", stem);
    branch(m, joint, top, 0.018, "#60845a", stem);
    for (let j = 0; j < 2 + quality; j++) {
      const node = between(joint, top, 0.12 + j / (2.6 + quality)),
        direction = a + j * GOLDEN;
      const end = polar(direction, 0.19, 0.09, node);
      branch(m, node, end, 0.01, "#68904d", stem);
      leaf(m, end, direction, 0.135, 0.026, 0.052, green[(i + j) % 5]);
      for (const side of [-1, 1])
        leaf(
          m,
          between(node, end, 0.56),
          direction + side * 0.9,
          0.12,
          0.022,
          0.045,
          green[(i + j + 2) % 5],
        );
      const anchor = between(root, top, 0.18 + j * 0.145);
      thorn(
        m,
        anchor,
        polar(direction + 1.4, 0.055, -0.028, anchor),
        0.014,
        "#955e49",
      );
    }
    const layers = quality === 0 ? 2 : 3;
    for (let layer = 0; layer < layers; layer++) {
      const petals = 7 - layer,
        base = polar(0, 0, 0.012 * layer, top);
      for (let j = 0; j < petals; j++)
        cupPetal(
          m,
          base,
          a + layer * 0.7 + (j * TAU) / petals,
          0.154 - 0.043 * layer,
          0.093 + 0.023 * layer,
          0.076 - 0.015 * layer,
          ["#c95465", "#db7080", "#b4475a"][layer],
        );
    }
    if (quality > 0)
      for (let j = 0; j < 4; j++)
        leaf(m, top, a + (j * TAU) / 4, 0.081, 0.03, 0.024, "#51794b");
  }
}
function sunflower(m: Mesh, quality: number) {
  const stemJoint: Vec = [-0.04, 0.78, 0],
    head: Vec = [0.06, 1.5, 0.06];
  branch(m, root, stemJoint, 0.032, "#70904c", stem);
  branch(m, stemJoint, head, 0.025, "#758e53", stem);
  for (let i = 0; i < 4 + quality; i++) {
    const a = GOLDEN * i,
      from = between(root, head, 0.12 + 0.12 * i),
      end = polar(a, 0.11, 0.05, from);
    branch(m, from, end, 0.014, "#69884c", stem);
    leaf(m, end, a, 0.33 - 0.019 * i, 0.12, 0.129 - 0.007 * i, green[i % 5]);
  }
  // The disk faces diagonally upward. Individual ray florets remain legible in side view.
  const at = (x: number, y: number, depth: number): Vec => [
    head[0] + x,
    head[1] + y * 0.94 + depth * 0.342,
    head[2] - y * 0.342 + depth * 0.94,
  ];
  const ring = (a: number, r: number, d: number) =>
    at(Math.cos(a) * r, Math.sin(a) * r, d);
  const petals = 11 + quality * 3;
  for (let layer = 0; layer < (quality ? 2 : 1); layer++)
    for (let j = 0; j < petals; j++) {
      const a = ((j + 0.42 * layer) * TAU) / petals,
        base = ring(a, 0.115, 0),
        left = ring(a - 0.109, 0.216, 0.012),
        right = ring(a + 0.109, 0.216, 0.012),
        tip = ring(a, 0.32 - 0.046 * layer, 0.04),
        ridge = ring(a, 0.225, 0.034);
      face(m, [base, left, tip, ridge], layer ? "#ffd66a" : "#e7a53a", bloom);
      face(m, [base, ridge, tip, right], layer ? "#f8ca45" : "#f5b23c", bloom);
    }
  for (let j = 0; j < petals; j++) {
    const a = (j * TAU) / petals,
      b = ((j + 1) * TAU) / petals;
    face(
      m,
      [
        ring(a, 0.15, 0),
        ring(b, 0.15, 0),
        ring(b, 0.12, 0.036),
        ring(a, 0.12, 0.036),
      ],
      "#885e3b",
      bloom,
    );
    face(
      m,
      [ring(a, 0.12, 0.036), ring(b, 0.12, 0.036), at(0, 0, 0.051)],
      "#684a35",
      bloom,
    );
  }
  if (quality > 0)
    for (let i = 0; i < 13 * quality; i++) {
      const a = i * GOLDEN,
        r = 0.106 * Math.sqrt((i + 0.4) / (13 * quality));
      const x = r * Math.cos(a),
        y = r * Math.sin(a),
        d = 0.055 - (0.012 * r) / 0.11;
      face(
        m,
        [at(x - 0.009, y, d), at(x + 0.009, y, d), at(x, y + 0.015, d + 0.003)],
        "#b8874c",
        bloom,
      );
    }
}
function tulip(m: Mesh, quality: number) {
  const count = 2 + quality;
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN,
      base = polar(a, 0.06, 0),
      tip = polar(a, 0.16 + 0.038 * (i % 2), 0.65 + 0.16 * (i % 3));
    branch(m, base, tip, 0.018, "#6f9e68", stem);
    leaf(m, base, a + 0.4, 0.26, 0.45 + 0.15 * (i % 2), 0.085, "#679c82");
    leaf(m, between(base, tip, 0.2), a + 2.4, 0.17, 0.32, 0.065, "#80ac89");
    for (let j = 0; j < 6; j++)
      cupPetal(
        m,
        tip,
        a + (j * TAU) / 6,
        0.115 - (j % 2) * 0.019,
        0.18 + (j % 2) * 0.022,
        0.073,
        ["#d5788d", "#de8ea1", "#d47583"][i % 3],
      );
  }
}
function fronds(m: Mesh, kind: "fern" | "vine", quality: number) {
  const fern = kind === "fern",
    count = (fern ? 5 : 4) + quality * 2,
    segments = fern ? 4 + quality : 4;
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN,
      reach = (fern ? 0.54 : 0.51) + 0.08 * (i % 3);
    const at = (t: number) =>
      polar(
        a + 0.17 * t,
        reach * t,
        (fern ? 0.17 : -0.25) * t +
          (fern ? 0.41 : 0.33) * Math.sin(Math.PI * t),
        root,
      );
    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      branch(
        m,
        at((j - 1) / segments),
        at(t),
        fern ? 0.01 : 0.013,
        "#678451",
        stem,
      );
      const sides = fern ? [-1, 1] : [j % 2 ? -1 : 1];
      for (const side of sides)
        leaf(
          m,
          at(t - 0.065),
          a + side * (fern ? 0.95 : 1.18),
          fern ? 0.2 * (1 - t * 0.67) : 0.18 + 0.027 * (j % 2),
          fern ? 0.037 : -0.086,
          fern ? 0.025 * (1 - 0.37 * t) : 0.088,
          fern
            ? green[(i + j) % 5]
            : ["#5d9558", "#83a85e", "#578658"][(i + j) % 3],
        );
    }
  }
}
function leafyHerb(m: Mesh, basil: boolean, quality: number) {
  const count = (basil ? 3 : 4) + quality;
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN,
      top = polar(a, 0.15 + 0.034 * (i % 2), 0.47 + 0.085 * (i % 3));
    branch(m, root, top, 0.015, "#6f9654", stem);
    const nodes = 2 + quality;
    for (let j = 0; j < nodes; j++) {
      const t = 0.23 + (j * 0.6) / Math.max(1, nodes - 1),
        start = between(root, top, t);
      for (const offset of [0, Math.PI])
        leaf(
          m,
          start,
          a + offset + (j * Math.PI) / 2,
          (basil ? 0.219 : 0.157) * (1 - 0.35 * t),
          0.08 * (1 - 0.32 * t),
          basil ? 0.095 * (1 - 0.3 * t) : 0.049,
          ["#568e49", "#79a75a", "#6b9e50"][(i + j) % 3],
        );
    }
    leaf(m, top, a, 0.085, 0.1, 0.04, "#9bbc6c");
  }
}
function broad(m: Mesh, kind: Species, quality: number) {
  const split = kind === "monstera",
    count = (split ? 4 : 5) + quality * 2;
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN,
      end = polar(a, 0.15 + 0.031 * (i % 3), 0.28 + 0.14 * (i % 3));
    branch(m, root, end, 0.022, "#587e50", stem);
    leaf(
      m,
      end,
      a,
      0.36 + 0.056 * (i % 3),
      0.15 + 0.07 * (i % 2),
      split ? 0.218 : 0.139,
      green[i % 5],
      split ? "split" : "plain",
    );
  }
}
function otherFlower(
  m: Mesh,
  kind: "flower" | "lily" | "vegetable",
  quality: number,
) {
  for (let i = 0; i < 3 + quality; i++) {
    const a = i * GOLDEN,
      top = polar(a, 0.22, 0.48 + 0.16 * (i % 3));
    branch(m, root, top, 0.022, "#658b55", stem);
    for (let j = 0; j < 2 + quality; j++)
      leaf(
        m,
        between(root, top, 0.19 + j * 0.2),
        a + j * 1.9,
        0.29 + 0.018 * j,
        kind === "lily" ? 0.32 : 0.1,
        kind === "lily" ? 0.125 : 0.086,
        green[(i + j) % 5],
      );
    if (kind === "lily") {
      leaf(m, top, a, 0.16, 0.3, 0.101, "#f8f7df", "plain", bloom);
      branch(m, top, polar(a, 0.04, 0.19, top), 0.021, "#dfbe69", bloom);
    } else if (kind === "vegetable") {
      globe(
        m,
        top[0],
        top[1] - 0.05,
        top[2],
        0.096,
        0.091,
        0.093,
        "#cf6a4e",
        bloom,
        6 + quality,
      );
    } else {
      for (let j = 0; j < 7; j++)
        cupPetal(m, top, a + (j * TAU) / 7, 0.115, 0.039, 0.041, "#cd92ac");
      globe(
        m,
        top[0],
        top[1] + 0.028,
        top[2],
        0.044,
        0.029,
        0.044,
        "#dcb85e",
        bloom,
        5,
      );
    }
  }
}
function smallTree(m: Mesh, quality: number) {
  branch(m, root, [0, 1.22, 0], 0.052, "#86674c", stem);
  for (let i = 0; i < 5 + quality; i++) {
    const a = i * GOLDEN,
      top = polar(a, i === 0 ? 0.06 : 0.35, 0.9 + (i % 3) * 0.15);
    branch(m, [0, 0.52, 0], top, 0.027, "#806447", stem);
    globe(m, ...top, 0.29, 0.256, 0.26, green[i % 5], foliage, 5 + quality);
    if (quality > 0)
      for (let j = 0; j < 3 * quality; j++)
        leaf(
          m,
          polar(a + j * GOLDEN, 0.22, 0.054 * (j % 3), top),
          a + j * GOLDEN,
          0.115,
          0.07,
          0.041,
          green[(i + j + 2) % 5],
        );
  }
}
const builders: Record<Species, (m: Mesh, q: number) => void> = {
  aloe: (m, q) => rosette(m, "aloe", q),
  sword: (m, q) => rosette(m, "sword", q),
  rose,
  sunflower,
  tulip,
  cactus,
  fern: (m, q) => fronds(m, "fern", q),
  vine: (m, q) => fronds(m, "vine", q),
  basil: (m, q) => leafyHerb(m, true, q),
  herb: (m, q) => leafyHerb(m, false, q),
  flower: (m, q) => otherFlower(m, "flower", q),
  lily: (m, q) => otherFlower(m, "lily", q),
  vegetable: (m, q) => otherFlower(m, "vegetable", q),
  tree: smallTree,
  monstera: (m, q) => broad(m, "monstera", q),
  broadleaf: (m, q) => broad(m, "broadleaf", q),
};

const templates = new Map<string, Mesh>();
const surfaces = {
  ceramic: { roughness: 0.7 },
  soil: { roughness: 0.98 },
  leaf: { roughness: 0.53 },
  wax: { roughness: 0.38 },
  wilted: { roughness: 0.81 },
  stem: { roughness: 0.83 },
  petal: { roughness: 0.66 },
};
function template(kind: Species, detail: PlantDetail, inGround: boolean) {
  const key = `${kind}/${detail}/${inGround ? 1 : 0}`;
  let mesh = templates.get(key);
  if (mesh) return mesh;
  mesh = [];
  const q = tier(detail),
    sides = 8 + 4 * q;
  if (!inGround) {
    const ceramic =
      kind === "tree" || kind === "rose"
        ? "#b77d60"
        : kind === "basil" || kind === "herb" || kind === "vegetable"
          ? "#c78966"
          : kind === "aloe"
            ? "#cba98d"
            : "#ded5c0";
    round(mesh, 0, -0.52, 0, 0.25, 0.27, 0.048, ceramic, pot, sides);
    round(mesh, 0, -0.472, 0, 0.27, 0.386, 0.417, ceramic, pot, sides);
    round(mesh, 0, -0.078, 0, 0.391, 0.398, 0.066, ceramic, pot, sides);
  }
  const soilRadius = inGround ? 0.265 : 0.347;
  round(
    mesh,
    0,
    inGround ? -0.004 : -0.012,
    0,
    soilRadius,
    soilRadius,
    inGround ? 0.004 : 0.012,
    "#574637",
    soil,
    sides,
  );
  if (q > 0)
    for (let i = 0; i < 4 + q * 2; i++) {
      const a = i * GOLDEN,
        center = polar(
          a,
          soilRadius * Math.sqrt((i + 0.5) / (4 + q * 2)),
          0.002,
        );
      face(
        mesh,
        [
          polar(a, 0.016, 0, center),
          polar(a + 2.3, 0.022, 0, center),
          polar(a + 3.9, 0.018, 0, center),
        ],
        i % 2 ? "#76634b" : "#423b30",
        soil,
      );
    }
  builders[kind](mesh, q);
  templates.set(key, mesh);
  return mesh;
}
function healthColor(
  rgb: Vec,
  role: string,
  center: Vec,
  stress: number,
  dryness: number,
): Vec {
  let blend = 0;
  let target: Vec;
  if (role === soil) {
    blend = dryness * 0.74;
    target = [163, 131, 94];
  } else if (role === foliage && stress > 0) {
    const extent = clamp(Math.hypot(center[0], center[2]) / 0.55);
    const yellow = stress * (0.44 + 0.49 * extent);
    const brown = clamp((stress - 0.64) / 0.36) * (0.23 + 0.57 * extent);
    const brightness = clamp((rgb[0] + rgb[1] + rgb[2]) / 395);
    target = [
      mix(186, 136, brown),
      mix(166, 102, brown),
      mix(90, 65, brown),
    ].map((v) => v * (0.65 + 0.35 * brightness)) as Vec;
    blend = yellow;
  } else if (role === bloom && stress > 0) {
    blend = stress * 0.42;
    target = [155, 129, 98];
  } else return rgb;
  return [
    Math.round(mix(rgb[0], target[0], blend)),
    Math.round(mix(rgb[1], target[1], blend)),
    Math.round(mix(rgb[2], target[2], blend)),
  ];
}
/** Append drawable world-space polygons. Cached local meshes are shared by all plants of a species. */
export function specimen(
  m: Mesh,
  x: number,
  y: number,
  z: number,
  kind: Species,
  id: string,
  scale = 1,
  selected = false,
  options: SpecimenOptions = {},
) {
  const inGround = options.inGround ?? false,
    detail = options.detail ?? "balanced";
  const stress = clamp(options.health?.stress ?? 0),
    dryness = clamp(options.health?.dryness ?? 0.4);
  const sway =
    Math.max(-1, Math.min(1, options.sway ?? 0)) * (1 - 0.68 * stress);
  const s =
    scale *
    (options.emergence === undefined
      ? 1
      : Math.max(0.005, clamp(options.emergence)));
  const base = inGround ? 0.004 : 0.52;
  const stiffness =
    kind === "cactus"
      ? 0.15
      : kind === "aloe" || kind === "tree"
        ? 0.38
        : kind === "sword"
          ? 0.59
          : 1;
  const flex = stress * stiffness;
  function pose(p: Vec, living: boolean): Vec {
    let [px, py, pz] = p;
    if (living) {
      const h = Math.max(0, py),
        radius = Math.hypot(px, pz);
      // Continuous deformation across leaves, petioles, blooms and stems keeps their joints together.
      py = py * (1 - 0.14 * flex) - radius * radius * 0.6 * flex;
      px = px * (1 + 0.09 * flex) + (0.018 * sway + 0.052 * flex) * h * h;
      pz += sway * (0.009 + 0.009 * radius) * h * h;
      if (inGround) py = Math.max(0, py);
    }
    return [x + px * s, y + (base + py) * s, z + pz * s];
  }
  if (selected) {
    // An open ring leaves the existing floor or soil visible around the base.
    const outer = (inGround ? 0.4 : 0.46) * s,
      inner = outer - 0.029 * s,
      ringY = y + 0.008 * s;
    for (let i = 0; i < 24; i++) {
      const a = (i * TAU) / 24,
        b = ((i + 1) * TAU) / 24,
        center: Vec = [x, ringY, z];
      face(
        m,
        [
          polar(a, inner, 0, center),
          polar(b, inner, 0, center),
          polar(b, outer, 0, center),
          polar(a, outer, 0, center),
        ],
        "#8cae78",
        id,
      );
    }
  }
  for (const f of template(kind, detail, inGround)) {
    const living = f.owner !== pot && f.owner !== soil;
    m.push({
      points: f.points.map((p) => pose(p, living)),
      center: pose(f.center, living),
      rgb: healthColor(f.rgb, f.owner, f.center, stress, dryness),
      albedo: healthColor(
        f.albedo ?? f.rgb,
        f.owner,
        f.center,
        stress,
        dryness,
      ),
      material:
        f.owner === soil
          ? surfaces.soil
          : f.owner === pot
            ? surfaces.ceramic
            : f.owner === stem
              ? surfaces.stem
              : f.owner === bloom
                ? surfaces.petal
                : stress > 0.65
                  ? surfaces.wilted
                  : kind === "aloe" || kind === "cactus"
                    ? surfaces.wax
                    : surfaces.leaf,
      owner: id,
    });
  }
}
