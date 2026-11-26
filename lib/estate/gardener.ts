import { roomFloor, type Placement } from "../home";
import { choreRoute, footSurface, type WalkOrigin } from "./navigation";
import {
  box,
  branch,
  face,
  globe,
  type Material,
  type Mesh,
  type Vec,
} from "./mesh";

export type CareAction = "Water" | "Fertilize" | "Prune" | "Mist" | "Inspect";
export type VisitPhase =
  "arriving" | "approaching" | "turning" | "working" | "returning" | "idle";
export interface VisitPlan {
  placement: Placement;
  action: CareAction;
  target: Vec;
  stance: Vec;
  originYaw?: number;
  route: Vec[];
  lengths: number[];
  distance: number;
  walkDuration: number;
  workStartsAt: number;
  workCompleteAt: number;
  duration: number;
}
const workTimes: Record<CareAction, number> = {
  Water: 3.5,
  Fertilize: 3.06,
  Prune: 3.2,
  Mist: 3.0,
  Inspect: 3.3,
};
const stepIn = 0.24,
  turnIn = 0.64,
  turnOut = 0.62,
  settle = 0.38;
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v: Vec): Vec => mul(v, 1 / (Math.hypot(...v) || 1));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixV = (a: Vec, b: Vec, t: number): Vec => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => {
  const s = clamp(t);
  return s * s * (3 - 2 * s);
};
const angleMix = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const facing = (from: Vec, to: Vec) =>
  Math.atan2(to[0] - from[0], to[2] - from[2]);
export function planVisit(
  placement: Placement,
  action: CareAction,
  obstacles: Placement[] = [],
  origin?: WalkOrigin,
): VisitPlan | null {
  if (!Object.hasOwn(workTimes, action)) return null;
  const navigation = choreRoute(placement, obstacles, origin);
  if (!navigation) return null;
  const route = navigation.route.filter(
    (p, i, all) => !i || Math.hypot(...sub(p, all[i - 1])) > 0.002,
  );
  const lengths = [0];
  for (let i = 1; i < route.length; i++)
    lengths[i] = lengths[i - 1] + Math.hypot(...sub(route[i], route[i - 1]));
  const distance = lengths[lengths.length - 1],
    walkDuration =
      distance > 0 ? distance / 1.62 + Math.min(0.53, distance * 0.4) : 0;
  const workStartsAt = stepIn + walkDuration + turnIn,
    workCompleteAt = workStartsAt + workTimes[action];
  return {
    ...navigation,
    placement,
    action,
    route,
    lengths,
    distance,
    walkDuration,
    stance: route[route.length - 1],
    originYaw: origin?.yaw,
    workStartsAt,
    workCompleteAt,
    duration: workCompleteAt + turnOut + walkDuration + settle,
  };
}
function pointOnPath(plan: VisitPlan, distance: number): Vec {
  const d = Math.max(0, Math.min(distance, plan.distance));
  let i = 1;
  while (i < plan.lengths.length && plan.lengths[i] < d) i++;
  if (i === plan.lengths.length) return plan.stance;
  return mixV(
    plan.route[i - 1],
    plan.route[i],
    (d - plan.lengths[i - 1]) / (plan.lengths[i] - plan.lengths[i - 1]),
  );
}
function locomotion(plan: VisitPlan, seconds: number, backwards: boolean) {
  const duration = plan.walkDuration,
    time = Math.max(0, Math.min(seconds, duration)),
    ramp = Math.min(0.53, duration * 0.23);
  const speed = plan.distance / (duration - ramp || 1);
  let d = speed * (time - ramp * 0.5),
    weight = 1;
  if (time < ramp) {
    d = (speed * time * time) / (2 * ramp);
    weight = time / ramp;
  } else if (time > duration - ramp) {
    const end = duration - time;
    d = plan.distance - (speed * end * end) / (2 * ramp);
    weight = end / ramp;
  }
  if (!plan.distance) weight = 0;
  const progress = backwards ? plan.distance - d : d;
  const before = pointOnPath(plan, progress - 0.18),
    after = pointOnPath(plan, progress + 0.18);
  return {
    position: pointOnPath(plan, progress),
    yaw: backwards ? facing(after, before) : facing(before, after),
    weight,
    travel: d,
  };
}
function sample(plan: VisitPlan, time: number) {
  const t = Math.max(0, Math.min(time, plan.duration)),
    arrival = stepIn + plan.walkDuration;
  const toPlant = facing(plan.stance, plan.target);
  let phase: VisitPhase = "idle",
    position = plan.route[0],
    yaw = plan.originYaw ?? locomotion(plan, 0, false).yaw,
    weight = 0,
    travel = 0,
    work = 0;
  if (t >= stepIn && t < arrival) {
    const walk = locomotion(plan, t - stepIn, false);
    ({ position, yaw, weight, travel } = walk);
    phase = plan.distance - travel < 0.9 ? "approaching" : "arriving";
  } else if (t >= arrival && t < plan.workStartsAt) {
    position = plan.stance;
    yaw = angleMix(
      plan.originYaw ?? locomotion(plan, plan.walkDuration, false).yaw,
      toPlant,
      ease((t - arrival) / turnIn),
    );
    phase = "turning";
  } else if (t >= plan.workStartsAt && t <= plan.workCompleteAt) {
    position = plan.stance;
    yaw = toPlant;
    work = clamp((t - plan.workStartsAt) / workTimes[plan.action]);
    phase = "working";
  } else if (t > plan.workCompleteAt && plan.originYaw !== undefined) {
    position = plan.stance;
    yaw = toPlant;
  } else if (t > plan.workCompleteAt && t < plan.workCompleteAt + turnOut) {
    position = plan.stance;
    yaw = angleMix(
      toPlant,
      locomotion(plan, 0, true).yaw,
      ease((t - plan.workCompleteAt) / turnOut),
    );
    phase = "returning";
  } else if (t >= plan.workCompleteAt + turnOut) {
    const walk = locomotion(plan, t - plan.workCompleteAt - turnOut, true);
    ({ position, yaw, weight, travel } = walk);
    phase = t < plan.duration - settle ? "returning" : "idle";
  }
  return { position, yaw, weight, travel, work, phase };
}

// Rest geometry is built once in bone-local coordinates. Every articulated
// piece inherits the parent bone's rigid transform (pelvis -> spine -> head,
// pelvis -> thigh -> shin -> shoe, shoulder -> arm -> wrist -> tool).
type Joint = { x: Vec; y: Vec; z: Vec; p: Vec };
const rotate = (m: Joint, v: Vec): Vec => [
  m.x[0] * v[0] + m.y[0] * v[1] + m.z[0] * v[2],
  m.x[1] * v[0] + m.y[1] * v[1] + m.z[1] * v[2],
  m.x[2] * v[0] + m.y[2] * v[1] + m.z[2] * v[2],
];
const transform = (m: Joint, v: Vec): Vec => add(m.p, rotate(m, v));
const chain = (a: Joint, b: Joint): Joint => ({
  x: rotate(a, b.x),
  y: rotate(a, b.y),
  z: rotate(a, b.z),
  p: transform(a, b.p),
});
function joint(p: Vec, pitch = 0, yaw = 0, roll = 0): Joint {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cr = Math.cos(roll),
    sr = Math.sin(roll);
  return {
    x: [cy * cr + sy * sp * sr, cp * sr, -sy * cr + cy * sp * sr],
    y: [-cy * sr + sy * sp * cr, cp * cr, sy * sr + cy * sp * cr],
    z: [sy * cp, -sp, cy * cp],
    p,
  };
}
function segment(a: Vec, b: Vec, restLength: number): Joint {
  const y = norm(sub(a, b));
  const x = norm(cross(y, Math.abs(y[2]) < 0.95 ? [0, 0, 1] : [0, 1, 0]));
  return {
    x,
    y: mul(y, Math.hypot(...sub(a, b)) / restLength),
    z: cross(x, y),
    p: a,
  };
}
// Two-bone analytic IK with an elbow/knee pole. The target is limited to
// anatomical reach; the elbow and wrist stay connected during every clip.
function solveLimb(
  start: Vec,
  wanted: Vec,
  upper: number,
  lower: number,
  pole: Vec,
) {
  const delta = sub(wanted, start),
    dir = norm(delta);
  const distance = Math.max(
    Math.abs(upper - lower) + 0.001,
    Math.min(upper + lower - 0.001, Math.hypot(...delta)),
  );
  const along =
    (upper * upper + distance * distance - lower * lower) / (2 * distance);
  const out = norm(sub(pole, mul(dir, dot(dir, pole))));
  return {
    mid: add(
      start,
      add(
        mul(dir, along),
        mul(out, Math.sqrt(Math.max(0, upper * upper - along * along))),
      ),
    ),
    end: add(start, mul(dir, distance)),
  };
}

type Piece = {
  points: Vec[];
  faces: { indices: number[]; center: Vec; rgb: Vec; albedo?: Vec }[];
};
function piece(draw: (m: Mesh) => void): Piece {
  const mesh: Mesh = [];
  draw(mesh);
  const points: Vec[] = [],
    ids = new Map<string, number>();
  const faces = mesh.map((f) => ({
    indices: f.points.map((p) => {
      const key = p.join(",");
      let id = ids.get(key);
      if (id === undefined) {
        id = points.length;
        points.push(p);
        ids.set(key, id);
      }
      return id;
    }),
    center: f.center,
    rgb: f.rgb,
    albedo: f.albedo,
  }));
  return { points, faces };
}
const fabricFinish: Material = { roughness: 0.84 };
const enamelFinish: Material = { roughness: 0.38, metalness: 0.32 };
function attach(
  mesh: Mesh,
  part: Piece,
  bone: Joint,
  material: Material = fabricFinish,
) {
  const points = part.points.map((p) => transform(bone, p));
  for (const f of part.faces)
    mesh.push({
      points: f.indices.map((i) => points[i]),
      center: transform(bone, f.center),
      rgb: f.rgb,
      albedo: f.albedo,
      material,
      owner: "",
    });
}
type Ring = [y: number, rx: number, rz: number, cz?: number];
function loft(m: Mesh, rings: Ring[], color: string, n = 10) {
  const levels = rings.map(([y, rx, rz, cz = 0]) =>
    Array.from({ length: n }, (_, i): Vec => {
      const a = (Math.PI * 2 * i) / n;
      return [Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
    }),
  );
  for (let k = 1; k < levels.length; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      face(
        m,
        [levels[k - 1][i], levels[k][i], levels[k][j], levels[k - 1][j]],
        color,
      );
    }
  face(m, levels[0].slice(), color);
  face(m, levels.at(-1)!.slice().reverse(), color);
}
const clay = "#ad7253",
  skin = "#c58e6c",
  hair = "#48342f",
  linen = "#e9d8b5",
  apron = "#446f59",
  trousers = "#4a5657",
  leather = "#76503d",
  cuff = "#c7b691",
  metal = "#709091",
  brass = "#d0a96c";
const pelvis = piece((m) => {
  loft(
    m,
    [
      [-0.125, 0.178, 0.116],
      [-0.01, 0.18, 0.127],
      [0.107, 0.16, 0.109],
    ],
    trousers,
    10,
  );
  loft(
    m,
    [
      [0.06, 0.168, 0.118],
      [0.097, 0.165, 0.115],
    ],
    leather,
    10,
  );
  // Leather tool loop, folded work cloth and the brass stud at the gardener's hip.
  loft(
    m,
    [
      [0.069, 0.173, 0.127],
      [0.093, 0.171, 0.126],
    ],
    "#8b6348",
    12,
  );
  box(m, 0.131, -0.063, -0.073, 0.065, 0.16, 0.071, "#805b42");
  box(m, 0.142, 0.045, -0.064, 0.042, 0.075, 0.047, "#b98454");
  face(
    m,
    [
      [-0.12, 0.077, -0.101],
      [-0.037, 0.077, -0.127],
      [-0.035, -0.089, -0.141],
      [-0.082, -0.106, -0.142],
      [-0.13, -0.073, -0.106],
    ],
    "#9eaa92",
  );
});
const coat = piece((m) => {
  loft(
    m,
    [
      [0.01, 0.163, 0.118],
      [0.18, 0.18, 0.131],
      [0.36, 0.204, 0.14],
      [0.44, 0.237, 0.118],
      [0.49, 0.09, 0.081],
    ],
    linen,
    12,
  );
  // Fitted apron panel with darts and a real stitched pocket, following the torso.
  face(
    m,
    [
      [-0.105, 0.408, 0.128],
      [0.105, 0.408, 0.128],
      [0.14, 0.12, 0.144],
      [-0.14, 0.12, 0.144],
    ],
    apron,
  );
  face(
    m,
    [
      [-0.14, 0.12, 0.144],
      [0.14, 0.12, 0.144],
      [0.172, -0.135, 0.133],
      [-0.17, -0.135, 0.133],
    ],
    apron,
  );
  face(
    m,
    [
      [-0.087, 0.095, 0.146],
      [0.087, 0.095, 0.146],
      [0.077, -0.005, 0.15],
      [0, -0.027, 0.153],
      [-0.077, -0.005, 0.15],
    ],
    "#69846a",
  );
  for (const s of [-1, 1]) {
    branch(
      m,
      [s * 0.094, 0.395, 0.135],
      [s * 0.117, 0.475, 0.038],
      0.018,
      "#976747",
    );
    branch(
      m,
      [s * 0.117, 0.475, 0.038],
      [s * 0.09, 0.45, -0.095],
      0.016,
      "#976747",
    );
    const shoulder: Vec = [s * 0.09, 0.45, -0.108],
      crossBack: Vec = [s * 0.024, 0.33, -0.147],
      waist: Vec = [-s * 0.13, 0.105, -0.126];
    branch(m, shoulder, crossBack, 0.014, apron);
    branch(m, crossBack, waist, 0.014, apron);
    globe(
      m,
      waist[0],
      waist[1],
      waist[2] - 0.006,
      0.012,
      0.012,
      0.006,
      brass,
      "",
      5,
    );
    globe(m, s * 0.092, 0.39, 0.136, 0.014, 0.015, 0.008, brass, "", 5);
  }
  loft(
    m,
    [
      [0.455, 0.094, 0.077],
      [0.489, 0.098, 0.082],
      [0.51, 0.075, 0.067],
    ],
    "#9d6748",
    9,
  );
});
const head = piece((m) => {
  loft(
    m,
    [
      [-0.044, 0.062, 0.057],
      [0.027, 0.062, 0.062],
    ],
    skin,
    8,
  );
  loft(
    m,
    [
      [0.015, 0.064, 0.063, 0.016],
      [0.049, 0.09, 0.087, 0.013],
      [0.111, 0.102, 0.1],
      [0.178, 0.106, 0.095, -0.004],
      [0.218, 0.087, 0.081, -0.009],
    ],
    skin,
    12,
  );
  for (const s of [-1, 1]) {
    globe(m, s * 0.1, 0.117, -0.001, 0.021, 0.032, 0.018, clay, "", 5);
    box(m, s * 0.042 - 0.009, 0.128, 0.09, 0.018, 0.012, 0.009, hair);
    branch(m, [s * 0.025, 0.15, 0.091], [s * 0.06, 0.154, 0.077], 0.0058, hair);
    globe(m, s * 0.081, 0.14, -0.035, 0.024, 0.046, 0.025, hair, "", 5);
  }
  face(
    m,
    [
      [-0.014, 0.092, 0.098],
      [0.013, 0.092, 0.098],
      [0, 0.102, 0.124],
      [0, 0.133, 0.097],
    ],
    clay,
  );
  branch(m, [-0.021, 0.067, 0.093], [0.024, 0.068, 0.093], 0.004, "#87564a");
  globe(m, 0, 0.175, -0.078, 0.083, 0.062, 0.062, hair, "", 7);
  globe(m, 0, 0.137, -0.124, 0.044, 0.041, 0.037, hair, "", 6);
  loft(
    m,
    [
      [0.178, 0.199, 0.194],
      [0.185, 0.205, 0.198],
      [0.201, 0.119, 0.108],
      [0.257, 0.097, 0.089],
      [0.27, 0.072, 0.064],
    ],
    "#d7af70",
    14,
  );
  loft(
    m,
    [
      [0.198, 0.119, 0.11],
      [0.22, 0.113, 0.106],
    ],
    "#697c64",
    14,
  );
});
const thigh = piece((m) =>
  loft(
    m,
    [
      [-0.39, 0.067, 0.068],
      [-0.28, 0.082, 0.085],
      [-0.06, 0.097, 0.104],
      [0.025, 0.083, 0.087],
    ],
    trousers,
    8,
  ),
);
const shin = piece((m) => {
  loft(
    m,
    [
      [-0.367, 0.057, 0.064],
      [-0.24, 0.064, 0.072],
      [-0.105, 0.078, 0.079],
      [0.019, 0.069, 0.071],
    ],
    trousers,
    8,
  );
  loft(
    m,
    [
      [-0.356, 0.062, 0.072],
      [-0.31, 0.064, 0.072],
    ],
    "#72806e",
    8,
  );
});
const boot = piece((m) => {
  loft(
    m,
    [
      [-0.063, 0.071, 0.124, 0.046],
      [-0.034, 0.074, 0.131, 0.049],
      [-0.003, 0.071, 0.119, 0.038],
      [0.042, 0.058, 0.066, -0.005],
      [0.092, 0.052, 0.054, -0.006],
    ],
    leather,
    9,
  );
  loft(
    m,
    [
      [-0.071, 0.075, 0.127, 0.047],
      [-0.054, 0.074, 0.13, 0.047],
    ],
    "#433e35",
    9,
  );
  branch(m, [-0.025, 0.028, 0.065], [0.026, 0.03, 0.069], 0.005, "#b08e67");
});
const sleeve = piece((m) => {
  loft(
    m,
    [
      [-0.224, 0.063, 0.068],
      [-0.165, 0.087, 0.081],
      [-0.05, 0.09, 0.094],
      [0.027, 0.072, 0.069],
    ],
    linen,
    9,
  );
  loft(
    m,
    [
      [-0.234, 0.072, 0.071],
      [-0.18, 0.081, 0.08],
    ],
    cuff,
    9,
  );
  loft(
    m,
    [
      [-0.277, 0.052, 0.051],
      [-0.223, 0.059, 0.059],
    ],
    skin,
    8,
  );
});
const forearm = piece((m) => {
  loft(
    m,
    [
      [-0.24, 0.036, 0.037],
      [-0.125, 0.048, 0.051],
      [-0.03, 0.058, 0.057],
      [0.012, 0.053, 0.054],
    ],
    skin,
    8,
  );
  loft(
    m,
    [
      [-0.228, 0.042, 0.044],
      [-0.192, 0.044, 0.045],
    ],
    "#84917b",
    8,
  );
});
const palm = piece((m) => {
  loft(
    m,
    [
      [-0.057, 0.042, 0.038],
      [-0.017, 0.049, 0.039],
      [0.036, 0.036, 0.035],
    ],
    "#b99462",
    8,
  );
});
function taperTube(
  m: Mesh,
  a: Vec,
  b: Vec,
  r0: number,
  r1: number,
  color: string,
  sides = 8,
) {
  const axis = norm(sub(b, a)),
    u = norm(cross(axis, Math.abs(axis[1]) < 0.93 ? [0, 1, 0] : [1, 0, 0])),
    v = cross(axis, u);
  const rim = (p: Vec, r: number) =>
    Array.from({ length: sides }, (_, i) =>
      add(
        p,
        add(
          mul(u, r * Math.cos((i * 2 * Math.PI) / sides)),
          mul(v, r * Math.sin((i * 2 * Math.PI) / sides)),
        ),
      ),
    );
  const base = rim(a, r0),
    top = rim(b, r1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    face(m, [base[i], base[j], top[j], top[i]], color);
  }
  face(m, top, color);
}
const canTip: Vec = [0, 0.072, 0.427];
const wateringCan = piece((m) => {
  loft(
    m,
    [
      [-0.267, 0.096, 0.113, 0.015],
      [-0.251, 0.114, 0.14, 0.014],
      [-0.128, 0.12, 0.151, 0.019],
      [-0.081, 0.107, 0.134, 0.024],
    ],
    "#759396",
    12,
  );
  loft(
    m,
    [
      [-0.252, 0.115, 0.142, 0.014],
      [-0.239, 0.117, 0.143, 0.014],
    ],
    metal,
    12,
  );
  loft(
    m,
    [
      [-0.089, 0.108, 0.138, 0.022],
      [-0.075, 0.11, 0.139, 0.023],
    ],
    brass,
    12,
  );
  loft(
    m,
    [
      [-0.074, 0.087, 0.107, 0.02],
      [-0.073, 0.087, 0.107, 0.02],
    ],
    "#506564",
    10,
  );
  const handle: Vec[] = [
    [0, -0.124, -0.093],
    [0, -0.042, -0.137],
    [0, 0.018, -0.099],
    [0, 0.03, -0.005],
    [0, 0.004, 0.045],
    [0, -0.091, 0.082],
  ];
  for (let i = 1; i < handle.length; i++)
    taperTube(m, handle[i - 1], handle[i], 0.013, 0.013, brass, 6);
  taperTube(m, [0, -0.203, 0.129], [0, 0.046, 0.383], 0.046, 0.019, "#729092");
  taperTube(m, [0, 0.046, 0.383], canTip, 0.021, 0.047, brass);
});
const scoop = piece((m) => {
  taperTube(m, [0, -0.013, -0.05], [0, 0.036, 0.195], 0.02, 0.014, leather, 7);
  loft(
    m,
    [
      [0.018, 0.016, 0.034, 0.215],
      [0.043, 0.047, 0.069, 0.23],
      [0.055, 0.051, 0.073, 0.233],
    ],
    "#a6aea5",
    8,
  );
  globe(m, 0, 0.056, 0.238, 0.039, 0.013, 0.053, "#c5a771", "", 6);
});
const fertiliserBag = piece((m) => {
  loft(
    m,
    [
      [-0.149, 0.066, 0.047],
      [-0.103, 0.083, 0.045],
      [0.042, 0.072, 0.04],
      [0.072, 0.047, 0.027],
    ],
    "#d3bb8a",
    8,
  );
  box(m, -0.045, -0.087, 0.043, 0.09, 0.057, 0.004, apron);
});
const spray = piece((m) => {
  loft(
    m,
    [
      [-0.171, 0.047, 0.048],
      [-0.139, 0.058, 0.061],
      [-0.035, 0.058, 0.058],
      [0.007, 0.027, 0.033],
    ],
    "#89b4a8",
    9,
  );
  loft(
    m,
    [
      [0.004, 0.029, 0.033],
      [0.028, 0.039, 0.035],
    ],
    "#e1dbc5",
    8,
  );
  box(m, -0.026, 0.025, -0.043, 0.052, 0.046, 0.153, "#4e6e65");
  taperTube(
    m,
    [0, 0.031, 0.076],
    [0, 0.007, 0.061],
    0.011,
    0.007,
    "#7f9588",
    6,
  );
});
const shears = piece((m) => {
  branch(m, [0, 0, -0.083], [0, 0, 0.04], 0.021, "#b47450");
  face(
    m,
    [
      [-0.016, 0.011, 0.025],
      [0.012, 0.009, 0.061],
      [0.006, 0.003, 0.16],
      [-0.018, 0.008, 0.111],
    ],
    "#b8c5ba",
  );
  face(
    m,
    [
      [-0.018, 0.008, 0.111],
      [0.006, 0.003, 0.16],
      [-0.002, -0.006, 0.063],
    ],
    metal,
  );
});
const loupe = piece((m) => {
  taperTube(m, [0, -0.024, -0.025], [0, 0.1, 0.049], 0.014, 0.014, leather, 7);
  const c: Vec = [0, 0.16, 0.069];
  for (let i = 0; i < 12; i++) {
    const at = (k: number): Vec => [
      c[0] + 0.066 * Math.cos((k * Math.PI) / 6),
      c[1] + 0.066 * Math.sin((k * Math.PI) / 6),
      c[2],
    ];
    branch(m, at(i), at(i + 1), 0.009, brass);
  }
  // Two reflected arcs keep the lens readable while the centre stays transparent.
  branch(m, [-0.042, 0.185, 0.071], [-0.021, 0.204, 0.071], 0.004, "#c8e4dd");
});
const tools: Record<CareAction, Piece> = {
  Water: wateringCan,
  Fertilize: scoop,
  Prune: shears,
  Mist: spray,
  Inspect: loupe,
};
function droplet(m: Mesh, p: Vec, r: number, color: string, elongation = 1) {
  const a: Vec = [p[0] - r, p[1], p[2]],
    b: Vec = [p[0] + r * 0.6, p[1], p[2] - r],
    c: Vec = [p[0] + r * 0.56, p[1], p[2] + r],
    d: Vec = [p[0], p[1] + r * elongation, p[2]],
    e: Vec = [p[0], p[1] - r * elongation, p[2]];
  face(m, [a, b, d], color);
  face(m, [b, c, d], color);
  face(m, [c, a, d], color);
  face(m, [a, e, b], color);
  face(m, [b, e, c], color);
  face(m, [c, e, a], color);
}
type Effect = {
  kind: "water" | "spray" | "granules";
  origin: Vec;
  target: Vec;
};
function drawEffect(m: Mesh, e: Effect, seconds: number, intensity: number) {
  const water = e.kind === "water",
    spray = e.kind === "spray",
    count = water ? 6 : spray ? 15 : 7;
  // Stagger discrete droplets down separate parabolic arcs. Water sections are
  // short lengths of 3D tube on the trajectory; fertilizer uses heavier grains.
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996,
      spread =
        (spray ? 0.135 : water ? 0.068 : 0.046) * (0.44 + (i % 4) * 0.18);
    const end = add(e.target, [
      Math.cos(angle) * spread,
      spray ? Math.sin(i * 12.3) * 0.095 : 0,
      Math.sin(angle) * spread,
    ]);
    const start = add(e.origin, [
      water ? 0.016 * Math.cos(angle) : 0,
      0,
      water ? 0.015 * Math.sin(angle) : 0,
    ]);
    const arc = (t: number): Vec => {
      const p = mixV(start, end, t);
      const lift = spray
        ? 0.09
        : Math.min(0.13, Math.max(0, start[1] - end[1]) * 0.2);
      p[1] += lift * 4 * t * (1 - t);
      return p;
    };
    const n = water ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const t = (seconds * (spray ? 2.8 : 1.8) + i * 0.618 + k / n) % 1;
      if (t > intensity) continue;
      const p = arc(t);
      if (water)
        branch(
          m,
          p,
          arc(Math.min(t + 0.12, 1)),
          0.0065,
          i % 2 ? "#a5d4d7" : "#c4e1de",
        );
      else
        droplet(
          m,
          p,
          spray ? 0.009 : 0.014,
          spray ? "#b7d8d3" : "#c3a263",
          spray ? 1 : 1.28,
        );
    }
  }
}

export interface GardenerFrame {
  mesh: Mesh;
  position: Vec;
  phase: VisitPhase;
  effect: Effect | null;
}
// Pose clips author independent tool motions. The reach and spine bend are
// retargeted to the actual soil height (ground, shelf or countertop).
function renderPose(
  action: CareAction,
  position: Vec,
  yaw: number,
  travel: number,
  weight: number,
  work: number,
  time: number,
  target: Vec,
  showTool: boolean,
  garden: boolean,
) {
  const mesh: Mesh = [],
    root = joint(position, 0, yaw),
    gait = (travel * 2 * Math.PI) / 1.12;
  const engagement = ease(work / 0.23) * ease((1 - work) / 0.2),
    soilHeight = target[1] - position[1];
  const low = clamp(1 - soilHeight / 1.2),
    inspected = action === "Inspect",
    pruning = action === "Prune";
  const stoop =
    engagement *
    (inspected
      ? 0.27 + low * 0.3
      : pruning
        ? 0.16 + low * 0.34
        : 0.1 + low * 0.28);
  const breath = 0.004 * Math.sin(time * 1.9),
    bob = (-0.016 * Math.cos(gait * 2) + 0.012) * weight;
  const hip: Vec = [
    0.019 * Math.sin(gait) * weight,
    0.808 + bob + breath - stoop * 0.23,
    -stoop * 0.11,
  ];
  attach(
    mesh,
    pelvis,
    chain(root, joint(hip, 0, -0.065 * Math.sin(gait) * weight)),
  );
  const spine = joint(
    hip,
    stoop + 0.045 * weight,
    0.082 * Math.sin(gait) * weight,
    0.026 * Math.sin(gait) * weight,
  );
  const chest = chain(root, spine);
  attach(mesh, coat, chest);
  const neck = chain(
    chest,
    joint(
      [0, 0.51, -0.007],
      engagement * (0.14 + low * 0.16) - stoop * 0.26,
      inspected ? Math.sin(work * 8) * 0.13 * engagement : 0,
      inspected ? -0.1 * engagement : 0,
    ),
  );
  attach(mesh, head, neck);
  for (const side of [-1, 1]) {
    const cycle = gait + (side < 0 ? Math.PI : 0),
      wave = Math.sin(cycle),
      footLift = Math.max(0, Math.cos(cycle)) * weight;
    const ankle: Vec = [
      side * 0.103,
      0.073 + 0.095 * footLift,
      0.027 * side + 0.18 * weight * wave,
    ];
    const footPoint = transform(root, ankle);
    ankle[1] +=
      footSurface(footPoint[0], footPoint[2], position[1], garden) -
      position[1];
    const top: Vec = [hip[0] + side * 0.095, hip[1] - 0.01, hip[2]];
    const leg = solveLimb(top, ankle, 0.391, 0.37, [side * 0.04, -0.02, 1]);
    attach(mesh, thigh, chain(root, segment(top, leg.mid, 0.39)));
    attach(mesh, shin, chain(root, segment(leg.mid, leg.end, 0.37)));
    attach(mesh, boot, chain(root, joint(leg.end, -0.1 * wave * footLift)));
  }
  // Both hands have targets in the pelvis coordinate space; a separate wrist
  // frame keeps held tools oriented independently of elbows during the walk.
  const soilReach = Math.max(0.6, Math.min(1.37, soilHeight + 0.27));
  const sway = Math.sin(gait) * weight,
    pulse = Math.sin(work * Math.PI * 7);
  const intent: Record<CareAction, Vec> = {
    Water: [0.13, Math.min(1.5, soilReach + 0.16), 0.385],
    Fertilize: [0.115, soilReach + 0.04 + 0.045 * pulse, 0.39 + 0.045 * pulse],
    Prune: [
      0.09 + 0.06 * pulse,
      Math.min(1.45, soilReach + 0.17 + 0.055 * Math.cos(work * 18)),
      0.44 + 0.048 * Math.sin(work * 18),
    ],
    Mist: [0.115, Math.min(1.47, soilReach + 0.22), 0.37 + 0.03 * pulse],
    Inspect: [
      0.043,
      Math.min(1.41, Math.max(0.95, soilHeight + 0.34)),
      0.32 + 0.045 * Math.sin(work * 6),
    ],
  };
  let right: Vec = [0, 0, 0],
    left: Vec = [0, 0, 0];
  for (const side of [-1, 1]) {
    const dominant = side === 1,
      shoulder = transform(spine, [side * 0.212, 0.435, 0]);
    const rest: Vec = [
      side * (dominant ? 0.245 : 0.23),
      hip[1] - 0.055 + (dominant ? 0.035 : 0),
      dominant ? 0.115 - 0.075 * sway : 0.035 + 0.18 * sway,
    ];
    const steady: Vec =
      action === "Water"
        ? [-0.022, intent.Water[1] - 0.105, intent.Water[2] + 0.074]
        : action === "Fertilize"
          ? [-0.16, 0.96, 0.2]
          : action === "Prune"
            ? [-0.08, intent.Prune[1] - 0.018, 0.425]
            : action === "Inspect"
              ? [-0.075, intent.Inspect[1] - 0.14, 0.36]
              : [-0.09, 0.9, 0.25];
    const arm = solveLimb(
      shoulder,
      mixV(rest, dominant ? intent[action] : steady, engagement),
      0.278,
      0.24,
      [side * 0.62, -0.22, -0.74],
    );
    attach(mesh, sleeve, chain(root, segment(shoulder, arm.mid, 0.278)));
    attach(mesh, forearm, chain(root, segment(arm.mid, arm.end, 0.24)));
    attach(mesh, palm, chain(root, joint(arm.end, -0.2, side * 0.1)));
    if (dominant) right = arm.end;
    else left = arm.end;
  }
  let effect: Effect | null = null;
  if (showTool) {
    const tilt =
      action === "Water"
        ? (0.88 - 0.46 * clamp((soilHeight - 0.36) / 0.84)) * engagement
        : action === "Fertilize"
          ? (0.42 + 0.4 * pulse) * engagement
          : action === "Inspect"
            ? -0.12 * engagement
            : 0.035;
    const lower = action === "Prune" ? 0.24 * engagement : 0,
      wrist = chain(root, joint(right, tilt, -0.12 * engagement, lower));
    if (action === "Prune") {
      const opening =
        0.1 + 0.29 * (0.5 + 0.5 * Math.cos(work * Math.PI * 7)) * engagement;
      attach(mesh, shears, chain(wrist, joint([0, 0, 0], 0, opening)));
      attach(mesh, shears, chain(wrist, joint([0.005, 0, 0], 0, -opening)));
    } else attach(mesh, tools[action], wrist, enamelFinish);
    if (action === "Fertilize")
      attach(mesh, fertiliserBag, chain(root, joint(left, -0.12)));
    if (
      work > 0.27 &&
      work < 0.83 &&
      (action === "Water" || action === "Mist" || action === "Fertilize")
    ) {
      const amount =
        action === "Water"
          ? 1
          : action === "Mist"
            ? clamp(0.5 + 1.5 * Math.sin(work * 37))
            : clamp(0.45 + 1.25 * pulse);
      if (amount > 0.04) {
        const kind =
          action === "Water"
            ? "water"
            : action === "Mist"
              ? "spray"
              : "granules";
        const anchor =
          action === "Water"
            ? canTip
            : action === "Mist"
              ? ([0, 0.051, 0.109] as Vec)
              : ([0, 0.054, 0.266] as Vec);
        const towards = norm([
          position[0] - target[0],
          0,
          position[2] - target[2],
        ]);
        const aim = add(target, mul(towards, 0.075));
        if (action === "Mist") aim[1] += 0.35;
        effect = { kind, origin: transform(wrist, anchor), target: aim };
        drawEffect(
          mesh,
          effect,
          time,
          amount * ease((work - 0.27) / 0.055) * ease((0.83 - work) / 0.06),
        );
      }
    }
  }
  return { mesh, effect };
}

export function gardenerFrame(plan: VisitPlan, seconds: number): GardenerFrame {
  const pose = sample(plan, seconds);
  const rendered = renderPose(
    plan.action,
    pose.position,
    pose.yaw,
    pose.travel,
    pose.weight,
    pose.work,
    seconds,
    plan.target,
    true,
    roomFloor(plan.placement.room) === "garden",
  );
  return { ...rendered, position: pose.position, phase: pose.phase };
}

export function walkingGardener(
  position: Vec,
  yaw: number,
  stride: number,
  weight: number,
  time: number,
  garden: boolean,
) {
  return renderPose(
    "Inspect",
    position,
    yaw,
    stride,
    weight,
    0,
    time,
    position,
    false,
    garden,
  ).mesh;
}

export function idleGardener(
  position: Vec,
  seconds = 0,
  yaw = 0.55,
): GardenerFrame {
  return {
    ...renderPose(
      "Inspect",
      position,
      yaw,
      0,
      0,
      0,
      seconds,
      position,
      false,
      position[1] < 0.17,
    ),
    position,
    phase: "idle",
  };
}
