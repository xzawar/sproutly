import {
  box,
  round,
  face,
  branch,
  labelFaces,
  finishes,
  type Mesh,
  type Vec,
} from "./mesh";
import {
  inSoil,
  roomSurfaceY,
  specimenScale,
  surfacePoint,
  visibleOnLevel,
  type Placement,
} from "../home";
import { type Level, type Specimen } from "./garden";
import { specimen } from "./specimens";
import { buildWallShell, wallVolumes } from "./envelope";
import { landscape } from "./landscape";
import {
  cabinet,
  feature,
  furniture as f,
  GROUND_Y,
  elevations,
  DOOR_HEIGHT,
  WALL_HEIGHT,
  WALL_THICKNESS,
  rect,
  STAIR,
  stairwell,
  UPPER_Y,
  type Rect,
} from "./plan";

type Detail = "low" | "balanced" | "ultra";
type Axis = "x" | "z";
const plaster = "#f1e6d1",
  lintel = "#e3d4b9",
  cedar = "#a77752",
  oak = "#caa075";
const dark = "#354844",
  metal = "#596764",
  slate = "#65746f",
  wool = "#d3c4a8";

function block(m: Mesh, b: Rect, base: number, height: number, color: string) {
  box(m, b.x, base, b.z, b.width, height, b.depth, color);
}
function beam(
  m: Mesh,
  axis: Axis,
  a: number,
  along: number,
  y: number,
  span: number,
  h: number,
  thick: number,
  color: string,
) {
  if (axis === "x") box(m, a, y, along, span, h, thick, color);
  else box(m, along, y, a, thick, h, span, color);
}
function panel(
  m: Mesh,
  axis: Axis,
  side: number,
  pos: number,
  a: number,
  y: number,
  span: number,
  h: number,
  color: string,
  depth = 0.035,
) {
  const start = side > 0 ? pos : pos - depth;
  beam(m, axis, a, start, y, span, h, depth, color);
}
function ringRail(
  m: Mesh,
  axis: Axis,
  fixed: number,
  start: number,
  length: number,
  y: number,
  height = 0.92,
) {
  const n = Math.max(2, Math.ceil(length / 0.8));
  for (let i = 0; i <= n; i++) {
    const a = start + (length * i) / n;
    beam(m, axis, a - 0.027, fixed - 0.027, y, 0.054, height, 0.054, dark);
  }
  for (const h of [0.19, 0.42, 0.65])
    beam(m, axis, start, fixed - 0.012, y + h, length, 0.021, 0.024, metal);
  beam(
    m,
    axis,
    start - 0.035,
    fixed - 0.041,
    y + height,
    length + 0.07,
    0.065,
    0.082,
    cedar,
  );
}
function floorTile(
  m: Mesh,
  x: number,
  z: number,
  right: number,
  far: number,
  y: number,
  color: string,
) {
  face(
    m,
    [
      [x, y, z],
      [x, y, far],
      [right, y, far],
      [right, y, z],
    ],
    color,
  );
}
function openSlab(m: Mesh, r: Rect, y: number, color: string) {
  box(m, r.x, y - GROUND_Y, r.z, r.width, GROUND_Y, r.depth, color, "", false);
}
function planks(m: Mesh, r: Rect, y: number, detail: Detail, deck = false) {
  const grain = deck
    ? ["#ba976e", "#b4916a", "#bd9c76"]
    : ["#ceaf88", "#d9b993", "#d5b68c", "#d1b18a"];
  const course = deck ? 0.24 : 0.37;
  const cols = Math.ceil(r.depth / course);
  const seam = deck ? "#927654" : "#b29676";
  openSlab(m, r, y, seam);
  for (let j = 0; j < cols; j++) {
    const z = r.z + (r.depth * j) / cols;
    const h = r.depth / cols - 0.013;
    // Separate top quads give each plank a grain direction at very low cost.
    const boundary =
      detail === "low"
        ? [0, r.width]
        : [
            0,
            ...Array.from(
              { length: Math.ceil(r.width / 2.6) },
              (_, i) => 0.48 + ((j * 7) % 11) * 0.13 + i * 2.6,
            ).filter((x) => x < r.width - 0.15),
            r.width,
          ];
    for (let i = 1; i < boundary.length; i++) {
      const left = r.x + boundary[i - 1],
        right = r.x + boundary[i],
        gap = 0.008;
      floorTile(
        m,
        left,
        z,
        right - gap,
        z + h,
        y,
        grain[(i + j * 3) % grain.length],
      );
      floorTile(m, right - gap, z, right, z + h, y, seam);
    }
    floorTile(
      m,
      r.x,
      z + h,
      r.x + r.width,
      r.z + (r.depth * (j + 1)) / cols,
      y,
      seam,
    );
  }
}
function architecturalWalls(
  m: Mesh,
  storey: "ground" | "upper",
  section: boolean,
) {
  buildWallShell(m, wallVolumes(storey, section, true));
  const base = storey === "ground" ? GROUND_Y : UPPER_Y;
  const start = m.length;
  for (const f of elevations[storey]) {
    const height = section ? f.cut : WALL_HEIGHT;
    for (const o of f.openings) {
      const h = Math.min(o.h, height - o.lo);
      if (h <= 0.06) continue;
      const t = 0.043,
        bottom = base + o.lo;
      // Set the frame in the reveal. The clear opening extends to the underside of the head.
      const span = (
        left: number,
        y: number,
        width: number,
        rise: number,
        color: string,
        depth = 0.068,
      ) => {
        beam(
          m,
          f.axis,
          left,
          f.pos - depth * 0.5,
          y,
          width,
          rise,
          depth,
          color,
        );
      };
      if (o.door) {
        // Trim is mounted outside the opening, so the jamb and head preserve the clear dimensions.
        const pos = f.pos + (f.side * WALL_THICKNESS) / 2;
        panel(m, f.axis, f.side, pos, o.a - t, base, t, h, dark, 0.027);
        panel(m, f.axis, f.side, pos, o.a + o.w, base, t, h, dark, 0.027);
        if (height >= o.h + t)
          panel(
            m,
            f.axis,
            f.side,
            pos,
            o.a - t,
            base + h,
            o.w + 2 * t,
            t,
            dark,
            0.027,
          );
        continue;
      }
      span(o.a, bottom, t, h, dark);
      span(o.a + o.w - t, bottom, t, h, dark);
      span(o.a + t, bottom, o.w - 2 * t, t, dark);
      span(o.a + t, bottom + h - t, o.w - 2 * t, t, dark);
      const panes = Math.ceil(o.w / 1.25),
        pitch = (o.w - t) / panes;
      for (let i = 0; i < panes; i++) {
        const a = o.a + t + i * pitch;
        if (i) span(a - t, bottom + t, t, h - 2 * t, dark);
        // A single two-sided sheet keeps the glass tint uniform from either room.
        const point = (along: number, y: number): Vec =>
          f.axis === "x" ? [along, y, f.pos] : [f.pos, y, along];
        const right = a + pitch - t;
        const pane = [
          point(a, bottom + t),
          point(right, bottom + t),
          point(right, bottom + h - t),
          point(a, bottom + h - t),
        ];
        if ((f.axis === "x" ? 1 : -1) !== f.side) pane.reverse();
        face(m, pane, "#a8c8ca", "", finishes.glass);
      }
      panel(
        m,
        f.axis,
        f.side,
        f.pos + (f.side * WALL_THICKNESS) / 2,
        o.a - 0.03,
        bottom - 0.035,
        o.w + 0.06,
        0.035,
        lintel,
        0.09,
      );
    }
  }
  labelFaces(m, start, "windows", finishes.frame);
}
function openDoorLeaf(
  m: Mesh,
  x: number,
  z: number,
  y: number,
  h: number,
  hinge: "south" | "north",
) {
  // The leaf is held open against its reveal; the walking aisle stays clear.
  const d = hinge === "south" ? -1 : 1;
  box(m, x, y, z + Math.min(0, 0.85 * d), 0.055, h, 0.85, cedar);
  for (let i = 1; i < 7; i++)
    box(
      m,
      x + 0.058,
      y + 0.045,
      z + i * 0.118 * d,
      0.017,
      h - 0.09,
      0.014,
      oak,
    );
  box(m, x + 0.075, y + 0.9, z + 0.74 * d, 0.055, 0.07, 0.12, metal);
}
function stair(m: Mesh, detail: Detail) {
  const n = STAIR.steps,
    run = (STAIR.zStart - STAIR.zEnd) / n,
    rise = (STAIR.highY - STAIR.lowY) / n;
  for (let i = 0; i < n; i++) {
    const z = STAIR.zStart - (i + 1) * run;
    box(
      m,
      STAIR.x - STAIR.width / 2,
      GROUND_Y + i * rise,
      z,
      STAIR.width,
      rise - 0.035,
      run,
      cedar,
    );
    box(
      m,
      STAIR.x - STAIR.width / 2 - 0.02,
      GROUND_Y + (i + 1) * rise - 0.035,
      z - 0.008,
      STAIR.width + 0.04,
      0.035,
      run + 0.033,
      oak,
    );
  }
  const railX = STAIR.x - STAIR.width * 0.52;
  for (const x of [railX, STAIR.x + STAIR.width * 0.46])
    branch(
      m,
      [x, GROUND_Y - 0.03, STAIR.zStart],
      [x, UPPER_Y - 0.03, STAIR.zEnd],
      0.055,
      dark,
    );
  const a: Vec = [railX, GROUND_Y + 0.87, STAIR.zStart],
    b: Vec = [railX, UPPER_Y + 0.87, STAIR.zEnd];
  branch(m, a, b, 0.052, cedar);
  for (const t of detail === "low" ? [0, 0.5, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const z = STAIR.zStart + (STAIR.zEnd - STAIR.zStart) * t,
      y = GROUND_Y + (UPPER_Y - GROUND_Y) * t;
    round(m, railX, y, z, 0.026, 0.026, 0.87, dark, "", 5);
  }
}
function stool(m: Mesh, b: Rect, y: number, top: number, paint = oak) {
  const inset = 0.075;
  for (const dx of [inset, b.width - inset - 0.06])
    for (const dz of [inset, b.depth - inset - 0.06])
      box(m, b.x + dx, y, b.z + dz, 0.06, top - y - 0.07, 0.06, cedar);
  block(m, b, top - 0.075, 0.075, paint);
}
function tiledRug(m: Mesh, b: Rect, y: number, col: string) {
  block(m, b, y, 0.008, col);
  for (const d of [0.08, 0.15]) {
    const edge = "#b8a27e";
    box(m, b.x + d, y + 0.009, b.z + d, b.width - 2 * d, 0.006, 0.018, edge);
    box(
      m,
      b.x + d,
      y + 0.009,
      b.z + b.depth - d,
      b.width - 2 * d,
      0.006,
      0.018,
      edge,
    );
    box(
      m,
      b.x + d,
      y + 0.009,
      b.z + d + 0.018,
      0.018,
      0.006,
      b.depth - 2 * d - 0.036,
      edge,
    );
    box(
      m,
      b.x + b.width - d,
      y + 0.009,
      b.z + d + 0.018,
      0.018,
      0.006,
      b.depth - 2 * d - 0.036,
      edge,
    );
  }
}
function couch(m: Mesh, b: Rect, y: number) {
  block(
    m,
    {
      ...b,
      x: b.x + 0.09,
      z: b.z + 0.07,
      width: b.width - 0.18,
      depth: b.depth - 0.14,
    },
    y,
    0.15,
    "#8e7050",
  );
  block(m, b, y + 0.14, 0.31, "#738a79");
  block(m, { ...b, depth: 0.17 }, y + 0.42, 0.45, "#88a18b");
  for (const x of [b.x, b.x + b.width - 0.14])
    box(m, x, y + 0.43, b.z + 0.13, 0.14, 0.2, b.depth - 0.16, "#8ca38d");
  const cushions = b.width > 2.4 ? 3 : 2,
    w = (b.width - 0.35) / cushions;
  for (let i = 0; i < cushions; i++)
    box(
      m,
      b.x + 0.18 + i * w,
      y + 0.44,
      b.z + 0.2,
      w - 0.028,
      0.13,
      b.depth - 0.25,
      "#a1b59c",
    );
  // Separate angled pillows break up the silhouette of the bench seat.
  for (const side of [0, 1]) {
    const x = b.x + (side ? b.width - 0.53 : 0.25),
      z = b.z + 0.24;
    face(
      m,
      [
        [x, y + 0.55, z + 0.11],
        [x + 0.29, y + 0.54, z + 0.12],
        [x + 0.27, y + 0.83, z],
        [x + 0.03, y + 0.85, z - 0.012],
      ],
      side ? "#c7b28d" : "#d1bb9b",
    );
    face(
      m,
      [
        [x + 0.03, y + 0.85, z - 0.012],
        [x + 0.27, y + 0.83, z],
        [x + 0.28, y + 0.8, z - 0.055],
        [x + 0.04, y + 0.82, z - 0.064],
      ],
      wool,
    );
  }
}
function lowerFurniture(m: Mesh, detail: Detail) {
  const y = GROUND_Y,
    b = f.bed;
  block(m, b, y, 0.3, cedar);
  block(
    m,
    { ...b, x: b.x + 0.025, width: b.width - 0.05 },
    y + 0.3,
    0.21,
    "#eee9d4",
  );
  box(m, b.x - 0.02, y, b.z - 0.08, b.width + 0.04, 0.85, 0.13, cedar);
  box(
    m,
    b.x + 0.025,
    y + 0.49,
    b.z + 0.7,
    b.width - 0.05,
    0.13,
    b.depth - 0.73,
    "#c69478",
  );
  box(
    m,
    b.x + 0.025,
    y + 0.625,
    b.z + 0.72,
    b.width - 0.05,
    0.028,
    0.26,
    "#d4ac88",
  );
  for (const dx of [0.12, 1.03])
    box(m, b.x + dx, y + 0.5, b.z + 0.09, 0.75, 0.12, 0.46, "#f7f0db");
  stool(m, f.nightstand, y, y + 0.49);
  round(m, 2.72, y + 0.49, 0.86, 0.12, 0.08, 0.19, "#899785", "", 8);
  round(m, 2.72, y + 0.68, 0.86, 0.21, 0.15, 0.25, "#d7bf93", "", 10);
  tiledRug(m, rect(0.97, 5.24, 2.49, 2.41), y + 0.002, "#e0ccaa");
  couch(m, f.sofa, y);
  stool(m, f.coffee, y, y + 0.42);
  box(m, 1.77, y + 0.42, 6.35, 0.45, 0.055, 0.24, "#737e64");
  box(m, 1.83, y + 0.475, 6.37, 0.35, 0.035, 0.2, "#d2bb8f");
  round(m, 2.58, y + 0.42, 6.48, 0.09, 0.145, 0.1, "#907554", "", 9);
  block(m, cabinet, y, 0.8, "#82998b");
  block(
    m,
    {
      ...cabinet,
      x: cabinet.x - 0.045,
      width: cabinet.width + 0.09,
      depth: cabinet.depth + 0.06,
    },
    0.98,
    0.14,
    "#e1d8c3",
  );
  for (let i = 0; i < 6; i++) {
    const x = cabinet.x + 0.035 + i * ((cabinet.width - 0.06) / 6);
    box(m, x, 0.3, 1.237, 0.64, 0.59, 0.034, i % 2 ? "#8eaa98" : "#94ad9b");
    box(m, x + 0.43, 0.82, 1.274, 0.18, 0.026, 0.023, dark);
  }
  box(m, 5.82, 1.12, 0.49, 0.75, 0.025, 0.52, metal);
  box(m, 5.87, 1.145, 0.53, 0.65, 0.008, 0.43, "#81948c");
  branch(m, [5.91, 1.13, 0.42], [5.91, 1.41, 0.42], 0.023, dark);
  branch(m, [5.91, 1.41, 0.42], [5.91, 1.4, 0.64], 0.022, dark);
  box(m, 6.67, 1.123, 0.47, 0.63, 0.02, 0.56, dark);
  for (const x of [6.83, 7.12])
    for (const z of [0.61, 0.86])
      round(m, x, 1.144, z, 0.09, 0.09, 0.005, "#68756c", "", 8);
  stool(m, f.breakfast, y, y + 0.77);
  if (detail !== "low") {
    // Breakfast crockery and a turned bowl sit clear of managed countertop spots.
    for (const [x, z] of [
      [7.23, 2.24],
      [7.98, 2.44],
    ]) {
      round(m, x, 0.95, z, 0.098, 0.11, 0.018, "#e0d7bf", "", 12);
      round(m, x, 0.968, z, 0.055, 0.068, 0.09, "#abb9aa", "", 12);
      round(m, x, 1.058, z, 0.056, 0.054, 0.002, "#725647", "", 10);
      branch(m, [x + 0.055, 1.034, z], [x + 0.1, 1.028, z], 0.009, "#acb6a7");
      branch(m, [x + 0.1, 1.028, z], [x + 0.061, 0.988, z], 0.009, "#acb6a7");
    }
    round(m, 7.65, 0.95, 2.31, 0.09, 0.16, 0.07, "#b48e65", "", 12);
    round(m, 7.65, 1.02, 2.31, 0.139, 0.14, 0.005, "#8c704e", "", 12);
  }
  block(m, feature.shelf, roomSurfaceY("shelf") - 0.075, 0.075, oak);
  block(m, feature.shelf, y + 0.18, 0.055, cedar);
  for (const z of [5.45, 7.32])
    for (const x of [0.27, 0.79]) box(m, x, y, z, 0.06, 0.6, 0.06, dark);
  block(m, feature.window, roomSurfaceY("window") - 0.08, 0.08, "#ddc8a7");
  for (const z of [6.69, 7.8])
    branch(m, [9.7, 0.54, z], [9.09, 0.945, z], 0.026, metal);
  stool(m, f.desk, y, y + 0.83);
  const screenX = 7.26;
  box(m, screenX + 0.37, 1.01, 4.63, 0.12, 0.2, 0.12, dark);
  box(m, screenX, 1.19, 4.62, 0.9, 0.5, 0.058, dark);
  box(m, screenX + 0.045, 1.235, 4.68, 0.81, 0.41, 0.015, "#91aaa5");
  stool(m, f.deskChair, y, y + 0.43, "#829684");
  box(m, f.deskChair.x, 0.58, f.deskChair.z + 0.48, 0.54, 0.4, 0.07, "#92aa94");
  if (detail !== "low") {
    // Timber picture rails and books share the room's muted colours.
    box(m, 6.53, 1.013, 4.57, 0.36, 0.05, 0.27, "#cda580");
    box(m, 6.57, 1.063, 4.59, 0.3, 0.038, 0.23, "#708874");
    round(m, 8.87, 1.015, 4.6, 0.075, 0.08, 0.17, "#c0a788", "", 7);
  }
}
function upperFurniture(m: Mesh, detail: Detail) {
  const y = UPPER_Y;
  tiledRug(m, rect(0.49, 2.27, 2.07, 1.9), y + 0.002, "#ded0bc");
  couch(m, f.upstairsSofa, y);
  stool(m, f.upstairsTable, y, y + 0.44);
  block(m, f.books, y, 1.13, cedar);
  for (let j = 0; j < 3; j++) {
    box(m, 0.57, y + 0.12 + j * 0.33, 4.65, 0.1, 0.24, 0.97, "#675541");
    for (let k = 0; k < 5; k++)
      box(
        m,
        0.64,
        y + 0.14 + j * 0.33,
        4.69 + k * 0.169,
        0.085,
        0.16 + (k % 3) * 0.025,
        0.105,
        ["#9ba08c", "#c39270", "#749184", "#dfbe8b", "#9c8069"][k],
      );
  }
  stool(m, f.terraceTable, y, y + 0.72);
  if (detail !== "low") {
    round(m, 8.84, y + 0.72, 0.97, 0.1, 0.14, 0.165, "#9b7859", "", 9);
    box(m, 1.07, y + 0.44, 3.02, 0.35, 0.064, 0.23, "#aa866d");
  }
}

function lowerStorey(
  m: Mesh,
  section: boolean,
  detail: Detail,
  walking = false,
) {
  const y = GROUND_Y;
  if (section) {
    // Room-specific finishes sit on one continuous slab, including the hallway.
    planks(m, rect(0, 0, 5.6, 4), y, detail);
    openSlab(m, rect(5.6, 0, 4.4, 4), y, "#c5c3ab");
    // The tile and grout partition the top surface and share edges at every zoom.
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 5; j++) {
        const x = 5.6 + (4.4 / 6) * i,
          z = 0.8 * j,
          right = x + 4.4 / 6 - 0.008,
          far = z + 0.792;
        floorTile(m, x, z, right, far, y, (i + j) % 3 ? "#dedcca" : "#d8d6c3");
        floorTile(m, right, z, x + 4.4 / 6, far, y, "#bfbda8");
        floorTile(m, x, far, x + 4.4 / 6, z + 0.8, y, "#bfbda8");
      }
    planks(m, rect(0, 4, 6, 4.5), y, detail);
    planks(m, rect(6, 4, 4, 4.5), y, detail);
    lowerFurniture(m, detail);
  }
  architecturalWalls(m, "ground", section && !walking);
  if (section && !walking) {
    // The office ledge remains legible with the east wall cut away.
    beam(m, "z", 6.51, 9.83, y, 1.61, 0.8, 0.14, plaster);
    for (const z of [6.53, 7.33, 8.07])
      box(m, 9.85, 1.04, z, 0.055, 0.64, 0.046, dark);
    beam(m, "z", 6.51, 9.85, 1.66, 1.61, 0.04, 0.055, dark);
  } else {
    openDoorLeaf(m, 4.14, 8.38, y, DOOR_HEIGHT - 0.015, "south");
    openDoorLeaf(m, 5.09, 0.14, y, DOOR_HEIGHT - 0.015, "north");
    // A timber entry reveal, canopy with standing seams, and warm wall sconces.
    for (const [start, end] of [
      [3.56, 4.0],
      [5.66, 6.04],
    ]) {
      for (let x = start; x < end; x += 0.095)
        box(m, x, y + 0.03, 8.515, 0.052, 2.64, 0.049, cedar);
    }
    box(m, 3.73, 2.54, 8.31, 2.22, 0.12, 0.94, cedar);
    box(m, 3.69, 2.66, 8.29, 2.3, 0.055, 1, slate);
    for (const x of [3.91, 5.68]) {
      box(m, x, 1.66, 8.52, 0.105, 0.31, 0.095, dark);
      box(m, x + 0.02, 1.69, 8.622, 0.065, 0.21, 0.012, "#edcd94");
    }
  }
  planks(m, rect(10, 2.5, 2.8, 6), y, detail, true);
  ringRail(m, "x", 2.53, 10.02, 2.7, y, 0.77);
  ringRail(m, "z", 12.72, 2.54, 5.88, y, 0.77);
  ringRail(m, "x", 8.43, 10.04, 2.68, y, 0.77);
}
function studioFloor(m: Mesh, detail: Detail) {
  // Four slab segments leave a real void at the stair head.
  const gap = stairwell;
  planks(m, rect(0, 0, gap.x, 6), UPPER_Y, detail);
  planks(
    m,
    rect(gap.x + gap.width, 0, 6 - gap.x - gap.width, 6),
    UPPER_Y,
    detail,
  );
  planks(m, rect(gap.x, 0, gap.width, gap.z), UPPER_Y, detail);
  planks(
    m,
    rect(gap.x, gap.z + gap.depth, gap.width, 6 - gap.z - gap.depth),
    UPPER_Y,
    detail,
  );
  ringRail(m, "z", gap.x + 0.01, gap.z, gap.depth, UPPER_Y, 0.74);
  ringRail(m, "z", gap.x + gap.width - 0.01, gap.z, gap.depth, UPPER_Y, 0.74);
  ringRail(m, "x", gap.z + gap.depth, gap.x, gap.width, UPPER_Y, 0.74);
}
function ridgeRoof(m: Mesh, detail: Detail) {
  const x0 = -0.26,
    x1 = 6.24,
    cx = 2.99,
    z0 = -0.28,
    z1 = 6.28,
    eave = UPPER_Y + WALL_HEIGHT - 0.065,
    ridge = eave + 1.22;
  const left: Vec[] = [
    [x0, eave, z0],
    [x0, eave, z1],
    [cx, ridge, z1],
    [cx, ridge, z0],
  ];
  const right: Vec[] = [
    [cx, ridge, z0],
    [cx, ridge, z1],
    [x1, eave, z1],
    [x1, eave, z0],
  ];
  face(m, left, "#687973");
  face(m, right, "#78847c");
  for (const [x1p, y1p, x2p, y2p] of [
    [x0, eave, cx, ridge],
    [cx, ridge, x1, eave],
  ]) {
    for (const z of [z0, z1]) {
      const edge: Vec[] = [
        [x1p, y1p, z],
        [x2p, y2p, z],
        [x2p, y2p - 0.105, z],
        [x1p, y1p - 0.105, z],
      ];
      face(m, z === z0 ? edge : edge.reverse(), "#4c5c55");
    }
    for (let z = z0 + 0.21; z < z1; z += detail === "low" ? 0.91 : 0.54)
      branch(m, [x1p, y1p + 0.014, z], [x2p, y2p + 0.014, z], 0.017, "#87928a");
  }
  for (const z of [0, 6]) {
    const gable: Vec[] = [
      [0, UPPER_Y + WALL_HEIGHT, z],
      [2.99, ridge - 0.085, z],
      [6, UPPER_Y + WALL_HEIGHT, z],
    ];
    face(m, z === 0 ? gable : gable.reverse(), "#d7c1a1");
    for (let x = 0.34; x < 5.82; x += 0.26) {
      const len = (1 - Math.abs((x - 2.99) / 3)) * 1.02;
      box(
        m,
        x,
        eave - 0.045,
        z + (z > 1 ? 0.015 : -0.035),
        0.035,
        len,
        0.042,
        oak,
      );
    }
  }
  for (const x of [x0 + 0.02, x1 - 0.02])
    beam(m, "z", z0, x, eave - 0.105, z1 - z0, 0.12, 0.1, dark);
  branch(
    m,
    [cx, ridge + 0.02, z0 - 0.025],
    [cx, ridge + 0.02, z1 + 0.025],
    0.053,
    slate,
  );
  box(m, 0.98, eave + 0.4, 1.15, 0.58, 0.86, 0.55, "#c5bba6");
  box(m, 0.92, eave + 1.26, 1.09, 0.7, 0.07, 0.67, slate);
}
function upperStorey(
  m: Mesh,
  section: boolean,
  detail: Detail,
  walking = false,
) {
  const y = UPPER_Y;
  if (section) {
    studioFloor(m, detail);
    upperFurniture(m, detail);
  }
  architecturalWalls(m, "upper", section && !walking);
  if (!section || walking) {
    for (let x = 4.45; x < 5.8; x += 0.12)
      box(m, x, y + 0.07, 6.01, 0.055, 2.54, 0.06, cedar);
  }
  planks(m, rect(6, 0, 4, 6), y, detail, true);
  ringRail(m, "x", 0.055, 6.03, 3.9, y);
  ringRail(m, "x", 5.945, 6.03, 3.9, y);
  ringRail(m, "z", 9.945, 0.07, 5.86, y);
  // A cedar brise-soleil provides shade at the back without enclosing the deck.
  for (const x of [6.24, 9.67]) box(m, x, y, 0.21, 0.108, 2.09, 0.108, cedar);
  box(m, 6.19, y + 2.07, 0.18, 3.65, 0.14, 0.16, cedar);
  if (detail !== "low")
    for (let x = 6.25; x < 9.8; x += 0.41)
      box(m, x, y + 2.18, 0.09, 0.076, 0.075, 0.68, oak);
}
function houseContact(m: Mesh) {
  const path: Vec[] = [
    [-0.2, 0.006, -0.18],
    [-0.36, 0.006, 8.53],
    [0, 0.006, 8.77],
    [9.99, 0.006, 8.77],
    [10.33, 0.006, 8.43],
    [10.33, 0.006, 0],
    [9.99, 0.006, -0.18],
  ];
  face(m, path, "#9a9e77");
}
export function buildEnvironment(
  level: Level,
  detail: Detail = "balanced",
  includeLandscape = true,
): Mesh {
  if (level === "garden") {
    const mesh = includeLandscape ? walkLandscape(detail) : [];
    return mesh.concat(walkStructure(detail), walkRoof(detail));
  }
  const m: Mesh =
    level === "dollhouse" && includeLandscape ? walkLandscape(detail) : [];
  if (level !== "upper") lowerStorey(m, true, detail);
  if (level !== "ground") upperStorey(m, true, detail);
  stair(m, detail);
  labelFaces(m, 0, "house");
  return m;
}
/** Continuous outdoor context with furnished, full-height rooms and an open stairwell. */
export function walkLandscape(detail: Detail): Mesh {
  const mesh: Mesh = [];
  landscape(mesh, detail);
  houseContact(mesh);
  labelFaces(mesh, 0, "yard");
  return mesh;
}
export function walkStructure(detail: Detail): Mesh {
  const mesh: Mesh = [];
  lowerStorey(mesh, true, detail, true);
  upperStorey(mesh, true, detail, true);
  stair(mesh, detail);
  labelFaces(mesh, 0, "house");
  return mesh;
}
export function walkRoof(detail: Detail): Mesh {
  const mesh: Mesh = [];
  ridgeRoof(mesh, detail);
  block(
    mesh,
    rect(-0.17, 5.99, 10.34, 2.68),
    GROUND_Y + WALL_HEIGHT,
    0.16,
    lintel,
  );
  block(mesh, rect(-0.19, 5.98, 10.38, 2.71), 3.16, 0.055, slate);
  if (detail !== "low")
    for (let x = 0.4; x < 10; x += 0.85)
      box(mesh, x, 3.213, 6.03, 0.024, 0.026, 2.57, "#73827a");
  labelFaces(mesh, 0, "roof", finishes.roof);
  return mesh;
}
export function buildPlant(
  level: Level,
  p: Specimen,
  placement: Placement,
  selected: boolean,
  detail: Detail = "balanced",
  sway = 0,
): Mesh {
  if (!visibleOnLevel(level, placement.room)) return [];
  const pt = surfacePoint(placement);
  const m: Mesh = [];
  specimen(
    m,
    pt.x,
    pt.y,
    pt.z,
    p.model,
    p.id,
    specimenScale(placement.room),
    selected,
    {
      health: p.health,
      detail,
      inGround: inSoil(placement.room),
      sway,
    },
  );
  return m;
}
export function buildPlants(
  level: Level,
  plants: Specimen[],
  selected: string,
  draft: Placement | null,
  detail: Detail = "balanced",
  sway = 0,
) {
  const mesh: Mesh = [];
  const positions = new Map<string, ReturnType<typeof surfacePoint>>();
  for (const p of plants) {
    const placement = p.id === selected && draft ? draft : p.placement;
    if (!placement || !visibleOnLevel(level, placement.room)) continue;
    positions.set(p.id, surfacePoint(placement));
    for (const triangle of buildPlant(
      level,
      p,
      placement,
      p.id === selected,
      detail,
      sway,
    ))
      mesh.push(triangle);
  }
  return { mesh, positions };
}
export function buildScene(
  level: Level,
  plants: Specimen[],
  selected: string,
  draft: Placement | null,
  detail: Detail = "balanced",
) {
  const { mesh, positions } = buildPlants(
    level,
    plants,
    selected,
    draft,
    detail,
  );
  return { mesh: buildEnvironment(level, detail).concat(mesh), positions };
}
