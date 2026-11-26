// Export the same procedural meshes used by the Home viewer, including vertex colours.
import { writeFileSync } from "node:fs";
import { buildEnvironment } from "../lib/estate/buildings";
import { HOUSE } from "../lib/estate/plan";
import {
  faceNormal,
  type ModelGroup,
  type Mesh,
  type Vec,
} from "../lib/estate/mesh";

const output = process.argv[2];
if (!output) throw new Error("Pass an output .glb path.");
const detail = process.argv[3] ?? "balanced";
if (detail !== "low" && detail !== "balanced" && detail !== "ultra")
  throw new Error("Choose low, balanced or ultra.");

const parts = new Map<ModelGroup, Mesh>();
for (const f of buildEnvironment("garden", detail)) {
  const group = f.group ?? "house",
    mesh = parts.get(group);
  if (mesh) mesh.push(f);
  else parts.set(group, [f]);
}
const blocks: Buffer[] = [];
const views: {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  byteStride?: number;
  target: number;
}[] = [];
const accessors: {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  byteOffset?: number;
  normalized?: boolean;
  min?: number[];
  max?: number[];
}[] = [];
const materials: {
  name: string;
  doubleSided: boolean;
  alphaMode?: "BLEND";
  pbrMetallicRoughness: {
    baseColorFactor: number[];
    roughnessFactor: number;
    metallicFactor: number;
  };
}[] = [];
const materialIds = new Map<string, number>();
const nodes: {
  name: string;
  mesh?: number;
  children?: number[];
  translation?: Vec;
  scale?: number[];
}[] = [
  {
    name: "site",
    translation: [-HOUSE.x - HOUSE.width / 2, 0, -HOUSE.z - HOUSE.depth / 2],
    children: [1],
  },
  { name: "house", children: [] },
];
const meshes: {
  name: string;
  primitives: {
    attributes: { POSITION: number; COLOR_0: number; NORMAL?: number };
    indices: number;
    material: number;
  }[];
}[] = [];
let length = 0;

function bufferView(bytes: Buffer, target: number, byteStride?: number) {
  const index = views.length;
  views.push({
    buffer: 0,
    byteOffset: length,
    byteLength: bytes.length,
    target,
    byteStride,
  });
  const padding = (4 - (bytes.length % 4)) % 4;
  blocks.push(bytes, Buffer.alloc(padding));
  length += bytes.length + padding;
  return index;
}
const linearByte = (value: number) => {
  const s = value / 255;
  return Math.round(
    255 * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4),
  );
};
for (const [name, faces] of parts) {
  const min: Vec = [Infinity, Infinity, Infinity],
    max: Vec = [-Infinity, -Infinity, -Infinity];
  for (const f of faces)
    for (const v of f.points)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], v[i]);
        max[i] = Math.max(max[i], v[i]);
      }
  const scale = Math.max(...max.map((n, i) => n - min[i]), 1);
  // Foliage has faceted shading. glTF derives flat triangle normals when NORMAL is absent.
  // Hard-surface parts carry explicit normals for editable, crisp edges.
  const explicitNormals = name !== "yard";
  const stride = explicitNormals ? 20 : 12;
  const used = new Map<string, number>();
  const vertices: number[][] = [];
  const groups = new Map<number, number[]>();
  for (const f of faces) {
    const roughness = f.material?.roughness ?? 0.82,
      metalness = f.material?.metalness ?? 0,
      opacity = f.material?.opacity ?? 1;
    const materialKey = [roughness, metalness, opacity].join(",");
    let material = materialIds.get(materialKey);
    if (material === undefined) {
      material = materials.length;
      materialIds.set(materialKey, material);
      materials.push({
        name: opacity < 1 ? "Window glass" : `Surface ${material + 1}`,
        doubleSided: true,
        ...(opacity < 1 ? { alphaMode: "BLEND" as const } : {}),
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, opacity],
          roughnessFactor: roughness,
          metallicFactor: metalness,
        },
      });
    }
    const indices = groups.get(material) ?? [];
    groups.set(material, indices);
    const color = (f.albedo ?? f.rgb).map(linearByte);
    const norm = explicitNormals
      ? faceNormal(f.points).map((n) => Math.round(n * 32767))
      : [];
    const polygon = f.points.map((v) => {
      const xyz = v.map((n, i) => Math.round(((n - min[i]) * 65535) / scale));
      const row = [...xyz, ...color, ...norm];
      const key = row.join(",");
      let index = used.get(key);
      if (index === undefined) {
        index = vertices.length;
        used.set(key, index);
        vertices.push(row);
      }
      return index;
    });
    for (let k = 1; k < polygon.length - 1; k++) {
      const a = polygon[0],
        b = polygon[k],
        c = polygon[k + 1];
      if (a !== b && b !== c && a !== c) indices.push(a, b, c);
    }
  }
  const bytes = Buffer.alloc(vertices.length * stride);
  for (const [index, row] of vertices.entries()) {
    const off = index * stride;
    for (let i = 0; i < 3; i++) {
      bytes.writeUInt16LE(row[i], off + 2 * i);
      bytes[off + 8 + i] = row[i + 3];
      if (explicitNormals) bytes.writeInt16LE(row[i + 6], off + 12 + 2 * i);
    }
    bytes[off + 11] = 255;
  }
  const view = bufferView(bytes, 34962, stride);
  const position = accessors.length;
  accessors.push({
    bufferView: view,
    componentType: 5123,
    count: vertices.length,
    type: "VEC3",
    normalized: true,
    min: [0, 0, 0],
    max: max.map((n, i) => Math.round(((n - min[i]) * 65535) / scale)),
  });
  const color = accessors.length;
  accessors.push({
    bufferView: view,
    byteOffset: 8,
    componentType: 5121,
    count: vertices.length,
    type: "VEC4",
    normalized: true,
  });
  const normal = explicitNormals ? accessors.length : undefined;
  if (explicitNormals)
    accessors.push({
      bufferView: view,
      byteOffset: 12,
      componentType: 5122,
      count: vertices.length,
      type: "VEC3",
      normalized: true,
    });
  const primitives = [];
  for (const [material, indices] of groups) {
    if (!indices.length) continue;
    const wide = vertices.length > 65535;
    const bytes = Buffer.alloc(indices.length * (wide ? 4 : 2));
    indices.forEach((n, i) =>
      wide ? bytes.writeUInt32LE(n, i * 4) : bytes.writeUInt16LE(n, i * 2),
    );
    const iv = bufferView(bytes, 34963);
    const accessor = accessors.length;
    accessors.push({
      bufferView: iv,
      componentType: wide ? 5125 : 5123,
      count: indices.length,
      type: "SCALAR",
    });
    primitives.push({
      attributes: { POSITION: position, COLOR_0: color, NORMAL: normal },
      indices: accessor,
      material,
    });
  }
  nodes[name === "yard" ? 0 : 1].children!.push(nodes.length);
  nodes.push({
    name: name === "house" ? "floors and furnishings" : name,
    mesh: meshes.length,
    translation: min,
    scale: [scale, scale, scale],
  });
  meshes.push({ name, primitives });
}
const extension = "KHR_mesh_quantization";
const json = Buffer.from(
  JSON.stringify({
    asset: { version: "2.0", generator: "Sproutly Home" },
    scene: 0,
    scenes: [{ name: "Sproutly Home", nodes: [0] }],
    nodes,
    meshes,
    materials,
    extensionsUsed: [extension],
    extensionsRequired: [extension],
    buffers: [{ byteLength: length }],
    bufferViews: views,
    accessors,
  }),
);
const jsonSize = (json.length + 3) & ~3;
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonSize + length, 8);
header.writeUInt32LE(jsonSize, 12);
header.write("JSON", 16);
const bin = Buffer.alloc(8);
bin.writeUInt32LE(length);
bin.write("BIN\0", 4);
writeFileSync(
  output,
  Buffer.concat([
    header,
    json,
    Buffer.alloc(jsonSize - json.length, 0x20),
    bin,
    ...blocks,
  ]),
);
console.log(
  `${output}: ${meshes.length} mesh groups, ${28 + jsonSize + length} bytes (${detail}).`,
);
