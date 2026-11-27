// Merge the intersecting wall runs before emitting their exposed faces. Shared coordinates
// are integer millimetres in the grid and metres in the resulting mesh.
import { face, finishes, type Mesh, type Vec } from "./mesh";
import {
  elevations,
  partitions,
  wallFootprint,
  GROUND_Y,
  UPPER_Y,
  WALL_HEIGHT,
  DOOR_HEIGHT,
  type Rect,
} from "./plan";

type Volume = { lo: Vec; hi: Vec };
export function wallVolumes(
  storey: "ground" | "upper",
  cutaway: boolean,
  interior: boolean,
) {
  const base = storey === "ground" ? GROUND_Y : UPPER_Y;
  const volumes: Volume[] = [];
  function add(r: Rect, bottom: number, top: number) {
    if (r.width < 0.001 || r.depth < 0.001 || top <= bottom) return;
    volumes.push({
      lo: [r.x, base + bottom, r.z],
      hi: [r.x + r.width, base + top, r.z + r.depth],
    });
  }
  for (const f of elevations[storey]) {
    const height = cutaway ? f.cut : WALL_HEIGHT;
    let start = f.start;
    for (const o of f.openings) {
      add(wallFootprint(f, start, o.a), 0, height);
      const footprint = wallFootprint(f, o.a, o.a + o.w);
      add(footprint, 0, Math.min(o.lo, height));
      add(footprint, o.lo + o.h, height);
      start = o.a + o.w;
    }
    add(wallFootprint(f, start, f.end), 0, height);
  }
  if (storey === "ground" && interior) {
    for (const r of partitions) add(r, 0, cutaway ? 0.82 : WALL_HEIGHT);
    if (!cutaway) {
      add(
        { x: 1.75, z: 3.94, width: 1.37, depth: 0.12 },
        DOOR_HEIGHT,
        WALL_HEIGHT,
      );
      add(
        { x: 6.88, z: 3.94, width: 1.38, depth: 0.12 },
        DOOR_HEIGHT,
        WALL_HEIGHT,
      );
      add(
        { x: 5.95, z: 5.16, width: 0.12, depth: 1.34 },
        DOOR_HEIGHT,
        WALL_HEIGHT,
      );
    }
  }
  return volumes;
}

export function buildWallShell(mesh: Mesh, volumes: Volume[]) {
  if (!volumes.length) return;
  const cut = [0, 1, 2].map((d) =>
    [
      ...new Set(
        volumes.flatMap((v) => [
          Math.round(v.lo[d] * 1000),
          Math.round(v.hi[d] * 1000),
        ]),
      ),
    ].sort((a, b) => a - b),
  );
  const size = cut.map((a) => a.length - 1);
  const cell = (x: number, y: number, z: number) =>
    x + size[0] * (y + size[1] * z);
  const cells = new Uint8Array(size[0] * size[1] * size[2]);
  for (const v of volumes) {
    const lo = cut.map((a, i) => a.indexOf(Math.round(v.lo[i] * 1000)));
    const hi = cut.map((a, i) => a.indexOf(Math.round(v.hi[i] * 1000)));
    for (let z = lo[2]; z < hi[2]; z++)
      for (let y = lo[1]; y < hi[1]; y++)
        cells.fill(1, cell(lo[0], y, z), cell(hi[0], y, z));
  }
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3,
      v = (d + 2) % 3,
      cols = size[u],
      rows = size[v];
    const mask = new Int8Array(cols * rows);
    const stride = [1, size[0], size[0] * size[1]];
    for (let plane = 0; plane <= size[d]; plane++) {
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const index = plane * stride[d] + i * stride[u] + j * stride[v];
          mask[j * cols + i] =
            (plane ? cells[index - stride[d]] : 0) -
            (plane < size[d] ? cells[index] : 0);
        }
      const point = (i: number, j: number): Vec => {
        const p: Vec = [0, 0, 0];
        p[d] = cut[d][plane] / 1000;
        p[u] = cut[u][i] / 1000;
        p[v] = cut[v][j] / 1000;
        return p;
      };
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const sign = mask[j * cols + i];
          if (!sign) continue;
          let w = 1,
            h = 1;
          while (i + w < cols && mask[j * cols + i + w] === sign) w++;
          extend: while (j + h < rows) {
            for (let k = 0; k < w; k++)
              if (mask[(j + h) * cols + i + k] !== sign) break extend;
            h++;
          }
          for (let r = 0; r < h; r++)
            mask.fill(0, (j + r) * cols + i, (j + r) * cols + i + w);
          const quad = [
            point(i, j),
            point(i + w, j),
            point(i + w, j + h),
            point(i, j + h),
          ];
          face(
            mesh,
            sign > 0 ? quad : quad.reverse(),
            "#eee5d3",
            "",
            finishes.plaster,
          );
          mesh[mesh.length - 1].group = "walls";
        }
    }
  }
}
