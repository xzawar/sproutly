import { faceNormal, type Mesh, type Vec } from "./mesh";
import { roomLevel, type Level } from "./garden";
import { SITE } from "./plan";
import { rooms, roomIds, roomSurfaceY, type Placement } from "../home";

export type Quality = "low" | "balanced" | "ultra";
export type Camera = {
  yaw: number;
  pitch: number;
  distance: number;
  target: Vec;
  /** Vertical field of view in radians. Orbital views use the architectural lens. */
  fov?: number;
};
export type Layer = {
  mesh: Mesh;
  /** Shared geometry lives in model space. Picking retains each plant's own id. */
  at?: Vec;
  owner?: string;
  bounds?: { center: Vec; radius: number; half?: Vec };
  bornAt?: number;
  dynamic?: boolean;
  foot?: Vec;
  wind?: boolean;
};
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const zero: Vec = [0, 0, 0];
export const ORBIT_FOV = (40 * Math.PI) / 180;
export const EXPLORE_FOV = (66 * Math.PI) / 180;
const tan = Math.tan(ORBIT_FOV / 2);
const lensSlope = (c: Camera) =>
  c.fov === undefined ? tan : Math.tan(c.fov / 2);
export function cameraBasis(c: Camera) {
  const { yaw, pitch } = c;
  const back: Vec = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const right: Vec = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = cross(back, right);
  const eye = c.target.map((v, i) => v + c.distance * back[i]) as Vec;
  return { right, back, up, eye };
}
/** Fit the eight perspective-projected corners. Portrait screens retain the complete plot. */
export function fitCamera(
  low: Vec,
  high: Vec,
  aspect: number,
  yaw: number,
  pitch: number,
  margin = 1.08,
): Camera {
  const camera: Camera = {
    yaw,
    pitch,
    distance: 1,
    target: low.map((v, i) => (v + high[i]) / 2) as Vec,
  };
  const { right, up, back } = cameraBasis(camera);
  let distance = 1.4;
  for (const x of [low[0], high[0]])
    for (const y of [low[1], high[1]])
      for (const z of [low[2], high[2]]) {
        const rel = sub([x, y, z], camera.target);
        distance = Math.max(
          distance,
          dot(rel, back) +
            margin *
              Math.max(
                Math.abs(dot(rel, up)) / tan,
                Math.abs(dot(rel, right)) / (tan * Math.max(0.18, aspect)),
              ),
        );
      }
  return { ...camera, distance };
}
// A pitched perspective view of this irregular plot has more ground in front
// than roof at the far corners. Fit its silhouette, centring both image axes.
function exteriorCamera(aspect: number): Camera {
  const camera: Camera = {
    yaw: -0.91,
    pitch: 0.65,
    distance: 1,
    target: [0, 0, 0],
  };
  const { right, up, back } = cameraBasis(camera);
  const horizontal = (tan * Math.max(0.18, aspect)) / 1.07,
    vertical = tan / 1.09;
  const silhouette: Vec[] = [
    [-6.15, -0.4, SITE.z - 0.15],
    [16.15, -0.4, SITE.z - 0.15],
    [-6.15, -0.4, 20.15],
    [16.15, -0.4, 20.15],
    [-5.2, 4.4, SITE.z + 0.7],
    [14.5, 4.9, SITE.z + 0.7],
    [-5, 3.7, 7.8],
    [-4.7, 3, 16],
    [0, 7.2, 0],
    [6.2, 7.2, 0],
    [0, 7.2, 6.35],
    [6.2, 7.2, 6.35],
    [12.8, 3.9, 8.6],
    [8.9, 3.4, 18.2],
  ];
  let left = Infinity,
    rightEdge = -Infinity,
    bottom = Infinity,
    top = -Infinity;
  for (const v of silhouette) {
    const x = dot(v, right),
      y = dot(v, up),
      depth = dot(v, back);
    left = Math.min(left, x - horizontal * depth);
    rightEdge = Math.max(rightEdge, x + horizontal * depth);
    bottom = Math.min(bottom, y - vertical * depth);
    top = Math.max(top, y + vertical * depth);
  }
  camera.distance = Math.max(
    (rightEdge - left) / (2 * horizontal),
    (top - bottom) / (2 * vertical),
  );
  camera.target = right.map(
    (v, i) => (v * (rightEdge + left)) / 2 + (up[i] * (top + bottom)) / 2,
  ) as Vec;
  // Set the orbit pivot inside the property while preserving the fitted eye.
  const pivotDepth = dot([5, 1.5, 4.25], back);
  camera.target = camera.target.map((v, i) => v + back[i] * pivotDepth) as Vec;
  camera.distance -= pivotDepth;
  return camera;
}

export function initialCamera(
  level: Level,
  _count: number,
  aspect: number,
): Camera {
  if (level === "garden") return exteriorCamera(aspect);
  if (level === "dollhouse")
    return fitCamera(
      [-0.2, 0, -0.15],
      [12.8, 5.7, 8.7],
      aspect,
      0.6,
      0.67,
      1.1,
    );
  if (level === "upper")
    return fitCamera([0, 3, 0], [10, 4.95, 6], aspect, 0.5, 0.75);
  return fitCamera([0, 0.15, 0], [12.8, 2, 8.5], aspect, 0.48, 0.76);
}
export function interpolateCamera(a: Camera, b: Camera, t: number): Camera {
  const angle = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  return {
    yaw: a.yaw + angle * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    distance: a.distance + (b.distance - a.distance) * t,
    fov:
      (a.fov ?? ORBIT_FOV) + ((b.fov ?? ORBIT_FOV) - (a.fov ?? ORBIT_FOV)) * t,
    target: a.target.map((x, i) => x + (b.target[i] - x) * t) as Vec,
  };
}
function matrix(c: Camera, aspect: number) {
  const { right: r, up: u, back: b, eye: e } = cameraBasis(c);
  const tan = lensSlope(c);
  const near = 0.075,
    far = Math.max(240, c.distance * 2),
    k = (far + near) / (near - far),
    h = (2 * far * near) / (near - far);
  return new Float32Array([
    r[0] / (aspect * tan),
    u[0] / tan,
    k * b[0],
    -b[0],
    r[1] / (aspect * tan),
    u[1] / tan,
    k * b[1],
    -b[1],
    r[2] / (aspect * tan),
    u[2] / tan,
    k * b[2],
    -b[2],
    -dot(r, e) / (aspect * tan),
    -dot(u, e) / tan,
    -k * dot(b, e) + h,
    dot(b, e),
  ]);
}
function ray(c: Camera, aspect: number, nx: number, ny: number) {
  const { right, up, back, eye } = cameraBasis(c),
    tan = lensSlope(c);
  return {
    origin: eye,
    dir: back.map(
      (v, i) => -v + right[i] * nx * tan * aspect + up[i] * ny * tan,
    ) as Vec,
  };
}
export function floorAt(
  c: Camera,
  aspect: number,
  nx: number,
  ny: number,
  level: Level,
): Placement | null {
  const { origin, dir } = ray(c, aspect, nx, ny);
  let nearest = Infinity,
    result: Placement | null = null;
  for (const id of roomIds) {
    if (level !== "dollhouse" && roomLevel(id) !== level) continue;
    const t = (roomSurfaceY(id) - origin[1]) / dir[1],
      r = rooms[id];
    if (!Number.isFinite(t) || t <= 0 || t >= nearest) continue;
    const x = ((origin[0] + dir[0] * t - r.x) / r.width) * 100,
      z = ((origin[2] + dir[2] * t - r.z) / r.depth) * 100;
    if (x >= 0 && x <= 100 && z >= 0 && z <= 100) {
      nearest = t;
      result = { room: id, x: Math.round(x), y: Math.round(z) };
    }
  }
  return result;
}
/** Möller–Trumbore hit distance, shared by picking and the camera's swept sightline. */
function triangleHit(o: Vec, d: Vec, a: Vec, b: Vec, c: Vec) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2],
    vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const px = d[1] * vz - d[2] * vy,
    py = d[2] * vx - d[0] * vz,
    pz = d[0] * vy - d[1] * vx;
  const det = ux * px + uy * py + uz * pz;
  if (Math.abs(det) < 1e-8) return Infinity;
  const sx = o[0] - a[0],
    sy = o[1] - a[1],
    sz = o[2] - a[2],
    u = (sx * px + sy * py + sz * pz) / det;
  if (u < 0 || u > 1) return Infinity;
  const qx = sy * uz - sz * uy,
    qy = sz * ux - sx * uz,
    qz = sx * uy - sy * ux,
    v = (d[0] * qx + d[1] * qy + d[2] * qz) / det;
  return v < 0 || u + v > 1 ? Infinity : (vx * qx + vy * qy + vz * qz) / det;
}
export function intersection(
  layers: Layer[],
  c: Camera,
  aspect: number,
  nx: number,
  ny: number,
) {
  const { origin, dir } = ray(c, aspect, nx, ny);
  let nearest = Infinity,
    owner = "";
  for (const layer of layers) {
    const local = sub(origin, layer.at ?? zero);
    if (layer.bounds) {
      const rel = sub(layer.bounds.center, local),
        t = Math.max(0, dot(rel, dir) / dot(dir, dir));
      const d = rel.map((v, i) => v - t * dir[i]) as Vec;
      if (dot(d, d) > layer.bounds.radius ** 2) continue;
    }
    for (const f of layer.mesh) {
      const a = f.points[0];
      for (let i = 1; i < f.points.length - 1; i++) {
        const t = triangleHit(local, dir, a, f.points[i], f.points[i + 1]);
        if (t > 0.075 && t < nearest) {
          nearest = t;
          owner = layer.owner ?? f.owner;
        }
      }
    }
  }
  return owner;
}
export function pickOwner(
  mesh: Mesh,
  c: Camera,
  aspect: number,
  nx: number,
  ny: number,
) {
  return intersection([{ mesh }], c, aspect, nx, ny);
}
export function geometryBounds(mesh: Mesh) {
  const low: Vec = [Infinity, Infinity, Infinity],
    high: Vec = [-Infinity, -Infinity, -Infinity];
  for (const f of mesh)
    for (const p of f.points)
      for (let i = 0; i < 3; i++) {
        low[i] = Math.min(low[i], p[i]);
        high[i] = Math.max(high[i], p[i]);
      }
  const center = low.map((v, i) => (v + high[i]) / 2) as Vec;
  const half = sub(high, center);
  return { center, half, radius: Math.hypot(...half) + 0.045 };
}
/** A short three-ray sweep also catches foliage and trim that walking colliders intentionally omit. */
export function clipLens(camera: Camera, layers: Layer[]) {
  const { back, right } = cameraBasis(camera),
    origin = camera.target;
  let max = camera.distance;
  const rays = [-0.16, 0, 0.16].map(
    (offset) => origin.map((v, i) => v + right[i] * offset) as Vec,
  );
  for (const layer of layers) {
    const bounds = layer.bounds;
    if (!bounds?.half) continue;
    let near = 0,
      far = max;
    for (let i = 0; i < 3; i++) {
      const ext = bounds.half[i] + 0.18,
        delta = bounds.center[i] - origin[i];
      if (Math.abs(back[i]) < 0.00001) {
        if (Math.abs(delta) > ext) {
          far = -1;
          break;
        }
      } else {
        const a = (delta - ext) / back[i],
          b = (delta + ext) / back[i];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (far < near) break;
      }
    }
    if (far < near) continue;
    for (const face of layer.mesh) {
      const verts = face.points;
      for (let i = 1; i < verts.length - 1; i++)
        for (const ray of rays) {
          const distance = triangleHit(
            ray,
            back,
            verts[0],
            verts[i],
            verts[i + 1],
          );
          if (distance > 0.06 && distance < max + 0.12)
            max = Math.min(max, Math.max(0.14, distance - 0.12));
        }
    }
  }
  return max;
}
function visible(
  layer: Layer,
  basis: ReturnType<typeof cameraBasis>,
  aspect: number,
  tan: number,
) {
  if (!layer.bounds) return true;
  const { center, radius } = layer.bounds,
    at = layer.at ?? zero;
  const d = center.map((v, i) => v + at[i] - basis.eye[i]) as Vec;
  const z = -dot(d, basis.back),
    hSlope = tan * aspect;
  return (
    z + radius > 0 &&
    Math.abs(dot(d, basis.up)) <= z * tan + radius * Math.hypot(1, tan) &&
    Math.abs(dot(d, basis.right)) <= z * hSlope + radius * Math.hypot(1, hSlope)
  );
}
function scaleAt(layer: Layer, clock: number) {
  if (layer.bornAt === undefined) return 1;
  const t = Math.max(0, Math.min(1, (clock - layer.bornAt) / 0.42));
  return 1 - 0.18 * (1 - t) ** 3;
}
export interface Painter {
  draw: (
    camera: Camera,
    layers: Layer[],
    quality: Quality,
    clock: number,
    motion: boolean,
  ) => number;
  dispose: () => void;
}
const lightProjection = `
  const vec3 lightDirection = vec3(-.473, .814, .337);
  vec3 sunlight(vec3 world) {
    vec3 d = world - vec3(5., 2.8, 4.25);
    vec3 right = normalize(cross(vec3(0.,1.,0.),lightDirection));
    vec3 up = cross(lightDirection,right);
    return vec3(dot(right,d)/20.,dot(up,d)/20.,-dot(lightDirection,d)/24.);
  }`;
const vertexSource = `
  attribute vec3 point, albedo, normal;
  attribute vec2 surface;
  attribute vec4 instance;
  uniform mat4 camera;
  uniform float wind, clock;
  varying vec3 pigment, litNormal, world, shadowCoord;
  varying vec2 finish;
  ${lightProjection}
  void main() {
    vec3 p=point*instance.w;
    float blade=max(0.,point.y-.38);
    p.xz+=vec2(.018,.007)*wind*blade*blade*sin(clock*1.4+instance.x*.7+instance.z*.3+point.y*.6);
    world=p+instance.xyz;
    pigment=albedo; litNormal=normal; finish=surface;
    shadowCoord=sunlight(world)*.5+.5;
    gl_Position=camera*vec4(world,1.);
  }`;
const fragmentSource = `
  precision highp float;
  varying vec3 pigment, litNormal, world, shadowCoord;
  varying vec2 finish;
  uniform vec3 eye, gardenerFoot;
  uniform sampler2D shadowMap;
  uniform float texel, opacity;
  const vec3 L=vec3(-.473,.814,.337);
  float sampleLight(vec2 offset,float bias) {
    vec2 encoded=texture2D(shadowMap,shadowCoord.xy+offset*texel).rg;
    return step(shadowCoord.z-bias,encoded.r+encoded.g/255.);
  }
  void main() {
    vec3 N=normalize(litNormal), V=normalize(eye-world);
    if (!gl_FrontFacing) N=-N;
    vec3 H=normalize(L+V);
    float nl=max(0.,dot(N,L)), nv=max(.001,dot(N,V));
    float direct=1.;
    if(texel>0. && all(greaterThan(shadowCoord,vec3(.001))) && all(lessThan(shadowCoord,vec3(.999)))) {
      float bias=.00055+texel*.85*(1.-nl);
      direct=0.;
      for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++){
        vec2 o=vec2(float(x),float(y));
        float weight=(2.-abs(o.x))*(2.-abs(o.y));
        direct+=weight*sampleLight(o*1.14,bias)/16.;
      }
    }
    vec3 base=pow(max(pigment,vec3(0.)),vec3(2.2));
    vec3 F0=mix(vec3(.04),base,finish.y);
    float nh=max(0.,dot(N,H)),vh=max(0.,dot(V,H));
    float a2=pow(max(.12,finish.x),4.);
    float denom=nh*nh*(a2-1.)+1.;
    float D=a2/(3.14159*denom*denom+.0001),k=pow(finish.x+1.,2.)/8.;
    vec3 F=F0+(1.-F0)*pow(1.-vh,5.);
    float G=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));
    vec3 spec=D*G*F/max(.008,4.*nv*nl);
    vec3 ambient=mix(vec3(.36,.33,.27),vec3(.72,.79,.83),clamp(.5+.5*N.y,0.,1.));
    vec3 color=base*ambient+(base*(1.-F)*(1.-finish.y)*.61+min(spec,vec3(1.5))*.85)*vec3(1.04,.98,.88)*nl*direct;
    if(abs(world.y-gardenerFoot.y)<.11) {
      vec2 q=(world.xz-gardenerFoot.xz-vec2(.07,-.04))/vec2(.43,.30);
      float contact=max(0.,1.-dot(q,q));
      color*=1.-.32*contact*contact;
    }
    color=color/(1.+.09*color);
    float alpha=opacity+(1.-opacity)*.42*pow(1.-nv,3.);
    gl_FragColor=vec4(pow(color,vec3(1./2.2)),alpha);
  }`;
const depthVertex = `
  attribute vec3 point;
  attribute vec4 instance;
  ${lightProjection}
  void main(){gl_Position=vec4(sunlight(point*instance.w+instance.xyz),1.);}`;
const depthFragment = `
  precision highp float;
  void main(){float v=gl_FragCoord.z;vec2 rg=fract(v*vec2(1.,255.));rg.x-=rg.y/255.;gl_FragColor=vec4(rg,0.,1.);}`;

function gpu(canvas: HTMLCanvasElement, gl: WebGLRenderingContext): Painter {
  const shaders: WebGLShader[] = [],
    programs: WebGLProgram[] = [];
  function program(vertex: string, fragment: string) {
    const program = gl.createProgram()!;
    programs.push(program);
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error("Could not compile scene shader");
      gl.attachShader(program, shader);
    }
    for (const [i, name] of [
      "point",
      "albedo",
      "normal",
      "surface",
      "instance",
    ].entries())
      gl.bindAttribLocation(program, i, name);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("Could not link scene lighting");
    return program;
  }
  const colorProgram = program(vertexSource, fragmentSource),
    shadowProgram = program(depthVertex, depthFragment);
  const cameraUniform = gl.getUniformLocation(colorProgram, "camera"),
    footUniform = gl.getUniformLocation(colorProgram, "gardenerFoot"),
    eyeUniform = gl.getUniformLocation(colorProgram, "eye"),
    timeUniform = gl.getUniformLocation(colorProgram, "clock"),
    opacityUniform = gl.getUniformLocation(colorProgram, "opacity"),
    windUniform = gl.getUniformLocation(colorProgram, "wind"),
    texel = gl.getUniformLocation(colorProgram, "texel");
  const instances = gl.getExtension("ANGLE_instanced_arrays");
  const instanceBuffer = gl.createBuffer(),
    shadowTexture = gl.createTexture(),
    shadowTarget = gl.createFramebuffer(),
    shadowDepth = gl.createRenderbuffer();
  const stride = 11;
  type Buffer = { buffer: WebGLBuffer; count: number };
  const buffers = new Map<Mesh, Buffer>();
  const stream: Buffer = { buffer: gl.createBuffer()!, count: 0 };
  let streamVertices = new Float32Array(0),
    streamCapacity = 0;
  let shadowSize = 0,
    shadowAvailable = false,
    shadowLayers: Layer[] = [];
  gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  );
  gl.enable(gl.DEPTH_TEST);
  // Keep the actor in a streaming buffer; static architecture and shared species upload once.
  function upload(mesh: Mesh, dynamic: boolean): Buffer {
    const cached = buffers.get(mesh);
    if (cached && !dynamic) return cached;
    const count = mesh.reduce((n, f) => n + 3 * (f.points.length - 2), 0),
      length = count * stride;
    if (dynamic && streamVertices.length < length)
      streamVertices = new Float32Array(
        2 ** Math.ceil(Math.log2(Math.max(1, length))),
      );
    const vertices = dynamic ? streamVertices : new Float32Array(length);
    let j = 0;
    for (const f of mesh) {
      const a = f.points[0],
        n = faceNormal(f.points);
      const color = f.albedo ?? f.rgb;
      for (let i = 1; i < f.points.length - 1; i++)
        for (const p of [a, f.points[i], f.points[i + 1]]) {
          vertices[j++] = p[0];
          vertices[j++] = p[1];
          vertices[j++] = p[2];
          vertices[j++] = color[0] / 255;
          vertices[j++] = color[1] / 255;
          vertices[j++] = color[2] / 255;
          vertices[j++] = n[0];
          vertices[j++] = n[1];
          vertices[j++] = n[2];
          vertices[j++] = f.material?.roughness ?? 0.86;
          vertices[j++] = f.material?.metalness ?? 0;
        }
    }
    const entry = dynamic ? stream : { buffer: gl.createBuffer()!, count };
    entry.count = count;
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
    if (dynamic) {
      if (streamCapacity < vertices.byteLength) {
        gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
        streamCapacity = vertices.byteLength;
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices.subarray(0, length));
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      buffers.set(mesh, entry);
    }
    return entry;
  }
  function batch(
    layers: Layer[],
    clock: number,
    shadows: boolean,
    motion: boolean,
    glass = false,
  ) {
    const groups = new Map<Mesh, Layer[]>();
    for (const layer of layers) {
      const group = groups.get(layer.mesh);
      if (group) group.push(layer);
      else groups.set(layer.mesh, [layer]);
    }
    let faces = 0;
    for (const [mesh, layers] of groups) {
      if (glass) gl.uniform1f(opacityUniform, mesh[0].material?.opacity ?? 1);
      const record = upload(mesh, !!layers[0].dynamic);
      gl.bindBuffer(gl.ARRAY_BUFFER, record.buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * 4, 0);
      if (!shadows) {
        for (const [attribute, size, offset] of [
          [1, 3, 12],
          [2, 3, 24],
          [3, 2, 36],
        ]) {
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(
            attribute,
            size,
            gl.FLOAT,
            false,
            stride * 4,
            offset,
          );
        }
        gl.uniform1f(windUniform, motion && layers[0].wind ? 1 : 0);
      }
      if (instances && layers.length > 1) {
        const placements = new Float32Array(layers.length * 4);
        for (const [i, layer] of layers.entries()) {
          placements.set(layer.at ?? zero, i * 4);
          placements[i * 4 + 3] = shadows ? 1 : scaleAt(layer, clock);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, placements, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
        instances.vertexAttribDivisorANGLE(4, 1);
        instances.drawArraysInstancedANGLE(
          gl.TRIANGLES,
          0,
          record.count,
          layers.length,
        );
        instances.vertexAttribDivisorANGLE(4, 0);
        gl.disableVertexAttribArray(4);
      } else
        for (const layer of layers) {
          gl.disableVertexAttribArray(4);
          gl.vertexAttrib4f(
            4,
            ...(layer.at ?? zero),
            shadows ? 1 : scaleAt(layer, clock),
          );
          gl.drawArrays(gl.TRIANGLES, 0, record.count);
        }
      faces += (record.count * layers.length) / 3;
    }
    return faces;
  }
  function shadowMap(layers: Layer[], size: number) {
    if (!size) {
      shadowSize = 0;
      shadowLayers = [];
      return;
    }
    const actorsExcluded = layers.filter((l) => !l.dynamic);
    const resized = shadowSize !== size;
    if (
      !resized &&
      actorsExcluded.length === shadowLayers.length &&
      actorsExcluded.every((l, i) => l === shadowLayers[i])
    )
      return;
    shadowLayers = actorsExcluded;
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget);
    if (resized) {
      shadowSize = size;
      gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        size,
        size,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.bindRenderbuffer(gl.RENDERBUFFER, shadowDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        shadowTexture,
        0,
      );
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        shadowDepth,
      );
      shadowAvailable =
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }
    if (shadowAvailable) {
      gl.viewport(0, 0, size, size);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadowProgram);
      for (const i of [1, 2, 3]) gl.disableVertexAttribArray(i);
      batch(actorsExcluded, 0, true, false);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  return {
    draw(c, layers, quality, clock, motion) {
      const basis = cameraBasis(c),
        { solid, panes } = splitGlazing(layers, basis);
      const active = new Set([...solid, ...panes].map((v) => v.mesh));
      for (const [mesh, b] of buffers)
        if (!active.has(mesh)) {
          gl.deleteBuffer(b.buffer);
          buffers.delete(mesh);
        }
      const slope = lensSlope(c),
        aspect = canvas.width / canvas.height;
      shadowMap(
        solid,
        quality === "ultra" ? 1024 : quality === "balanced" ? 512 : 0,
      );
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(colorProgram);
      gl.uniformMatrix4fv(cameraUniform, false, matrix(c, aspect));
      gl.uniform3fv(eyeUniform, basis.eye);
      gl.uniform3fv(
        footUniform,
        layers.find((l) => l.foot)?.foot ?? [0, -100, 0],
      );
      gl.uniform1f(timeUniform, clock);
      gl.uniform1f(texel, shadowSize && shadowAvailable ? 1 / shadowSize : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
      gl.uniform1f(opacityUniform, 1);
      const inView = (l: Layer) => visible(l, basis, aspect, slope);
      let count = batch(solid.filter(inView), clock, false, motion);
      const visiblePanes = panes.filter(inView);
      if (visiblePanes.length) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(
          gl.SRC_ALPHA,
          gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA,
        );
        gl.depthMask(false);
        count += batch(visiblePanes, clock, false, false, true);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      return count;
    },
    dispose() {
      for (const b of buffers.values()) gl.deleteBuffer(b.buffer);
      buffers.clear();
      gl.deleteBuffer(stream.buffer);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteTexture(shadowTexture);
      gl.deleteRenderbuffer(shadowDepth);
      gl.deleteFramebuffer(shadowTarget);
      programs.forEach((p) => gl.deleteProgram(p));
      shaders.forEach((s) => gl.deleteShader(s));
    },
  };
}

// Windows render after opaque geometry. Cache the partition so moving the camera
// only sorts the small number of panes. Dynamic actors and plants contain no glazing.
type Glazing = { solid: Layer | null; panes: Layer[] };
const glazingCache = new WeakMap<Layer, Glazing>();
function splitGlazing(layers: Layer[], basis: ReturnType<typeof cameraBasis>) {
  const solid: Layer[] = [],
    panes: Layer[] = [];
  for (const layer of layers) {
    if (layer.dynamic || layer.wind) {
      solid.push(layer);
      continue;
    }
    let parts = glazingCache.get(layer);
    if (!parts) {
      if (!layer.mesh.some((f) => (f.material?.opacity ?? 1) < 1)) {
        parts = { solid: layer, panes: [] };
      } else {
        const opaque: Mesh = [],
          glass: Layer[] = [];
        for (const f of layer.mesh) {
          if ((f.material?.opacity ?? 1) >= 1) {
            opaque.push(f);
            continue;
          }
          const mesh = [f];
          glass.push({ ...layer, mesh, bounds: geometryBounds(mesh) });
        }
        parts = {
          solid: opaque.length ? { ...layer, mesh: opaque } : null,
          panes: glass,
        };
      }
      glazingCache.set(layer, parts);
    }
    if (parts.solid) solid.push(parts.solid);
    panes.push(...parts.panes);
  }
  const depth = (layer: Layer) =>
    dot(layer.mesh[0].center, basis.back) + dot(layer.at ?? zero, basis.back);
  panes.sort((a, b) => depth(a) - depth(b));
  return { solid, panes };
}

export function softwarePainter(canvas: HTMLCanvasElement): Painter {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  type Screen = {
    x: number;
    y: number;
    inv: number;
    cx: number;
    cy: number;
    z: number;
  };
  type ProjectedMesh = {
    points: Vec[];
    screen: Screen[];
    polygons: { indices: number[]; color: number }[];
  };
  const prepared = new WeakMap<Mesh, ProjectedMesh>();
  const emptyScreen = (): Screen => ({
    x: 0,
    y: 0,
    z: 0,
    inv: 0,
    cx: 0,
    cy: 0,
  });
  const tint = (rgb: Vec) =>
    (0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  function prepare(mesh: Mesh) {
    const points: Vec[] = [],
      ids = new Map<Vec, number>();
    const polygons = mesh.map((f) => ({
      color: tint(f.rgb),
      indices: f.points.map((point) => {
        const known = ids.get(point);
        if (known !== undefined) return known;
        ids.set(point, points.length);
        points.push(point);
        return points.length - 1;
      }),
    }));
    const data = { points, polygons, screen: points.map(emptyScreen) };
    prepared.set(mesh, data);
    return data;
  }
  let depth = new Float32Array(0),
    backgroundDepth = new Float32Array(0),
    background = new Uint32Array(0),
    image: ImageData | null = null;
  let cachedView = "",
    cachedLayers: Layer[] = [],
    staticFaces = 0;
  return {
    draw(camera, layers, _quality, clock, motion) {
      const w = canvas.width,
        h = canvas.height,
        slope = lensSlope(camera),
        focal = h / (2 * slope);
      if (!image || image.width !== w || image.height !== h) {
        image = ctx.createImageData(w, h);
        depth = new Float32Array(w * h);
        backgroundDepth = new Float32Array(w * h);
        background = new Uint32Array(w * h);
        cachedView = "";
      }
      const pixels = new Uint32Array(image.data.buffer),
        basis = cameraBasis(camera);
      function projected(cx: number, cy: number, z: number): Screen {
        return {
          x: w / 2 + (focal * cx) / z,
          y: h / 2 - (focal * cy) / z,
          inv: 1 / z,
          cx,
          cy,
          z,
        };
      }
      let opacity = 1;
      function triangle(a: Screen, b: Screen, c: Screen, color: number) {
        // Rasterize spans between edges. Thin railings and close-up walls otherwise
        // visit many thousands of uncovered pixels inside their bounding rectangles.
        if (a.y > b.y) [a, b] = [b, a];
        if (b.y > c.y) [b, c] = [c, b];
        if (a.y > b.y) [a, b] = [b, a];
        const height = c.y - a.y,
          first = Math.max(0, Math.ceil(a.y - 0.5)),
          end = Math.min(h, Math.ceil(c.y - 0.5));
        if (end <= first || height < 0.001) return;
        const acx = (c.x - a.x) / height,
          acz = (c.inv - a.inv) / height;
        const atB = a.x + (b.y - a.y) * acx,
          width = b.x - atB;
        if (Math.abs(width * height) < 0.01) return;
        const invStep = (b.inv - (a.inv + (b.y - a.y) * acz)) / width;
        const ab = (b.x - a.x) / (b.y - a.y || 1),
          bc = (c.x - b.x) / (c.y - b.y || 1);
        for (let row = first; row < end; row++) {
          const py = row + 0.5,
            longX = a.x + (py - a.y) * acx;
          const shortX =
            py < b.y ? a.x + (py - a.y) * ab : b.x + (py - b.y) * bc;
          const from = Math.max(0, Math.ceil(Math.min(longX, shortX) - 0.5)),
            to = Math.min(w, Math.ceil(Math.max(longX, shortX) - 0.5));
          let inv = a.inv + (py - a.y) * acz + (from + 0.5 - longX) * invStep;
          if (opacity < 1) {
            // ImageData stores straight alpha. Keep the garden and any actor visible through glass.
            for (
              let k = row * w + from, end = row * w + to;
              k < end;
              k++, inv += invStep
            ) {
              if (inv <= depth[k]) continue;
              const back = pixels[k],
                backgroundAlpha = ((back >>> 24) / 255) * (1 - opacity);
              const alpha = opacity + backgroundAlpha,
                mix = opacity / alpha;
              const channel = (shift: number) =>
                Math.round(
                  ((color >>> shift) & 255) * mix +
                    ((back >>> shift) & 255) * (1 - mix),
                );
              pixels[k] =
                (Math.round(alpha * 255) << 24) |
                (channel(16) << 16) |
                (channel(8) << 8) |
                channel(0);
            }
            continue;
          }
          for (
            let k = row * w + from, stop = row * w + to;
            k < stop;
            k++, inv += invStep
          ) {
            if (inv > depth[k]) {
              depth[k] = inv;
              pixels[k] = color;
            }
          }
        }
      }
      function render(group: Layer[], glass = false) {
        let count = 0;
        const verts: Screen[] = [];
        function polygon(vertices: Screen[], color: number) {
          let behind = 0,
            left = true,
            right = true,
            above = true,
            below = true;
          for (const p of vertices) {
            if (p.z < 0.075) behind++;
            left &&= p.x < 0;
            right &&= p.x >= w;
            above &&= p.y < 0;
            below &&= p.y >= h;
          }
          if (
            behind === vertices.length ||
            (!behind && (left || right || above || below))
          )
            return;
          if (behind) {
            const clipped: Screen[] = [];
            for (let i = 0; i < vertices.length; i++) {
              const a = vertices[(i + vertices.length - 1) % vertices.length],
                b = vertices[i];
              if (a.z >= 0.075 !== b.z >= 0.075) {
                const t = (0.075 - a.z) / (b.z - a.z);
                clipped.push(
                  projected(
                    a.cx + (b.cx - a.cx) * t,
                    a.cy + (b.cy - a.cy) * t,
                    0.075,
                  ),
                );
              }
              if (b.z >= 0.075) clipped.push(b);
            }
            vertices = clipped;
          }
          for (let i = 1; i < vertices.length - 1; i++) {
            triangle(vertices[0], vertices[i], vertices[i + 1], color);
            count++;
          }
        }
        for (const layer of group) {
          if (!visible(layer, basis, w / h, slope)) continue;
          opacity = glass ? (layer.mesh[0].material?.opacity ?? 1) : 1;
          const offset = sub(layer.at ?? zero, basis.eye),
            scale = motion ? scaleAt(layer, clock) : 1;
          function projectVertex(p: Vec, out: Screen) {
            const x = p[0] * scale + offset[0],
              y = p[1] * scale + offset[1],
              z = p[2] * scale + offset[2];
            out.cx =
              x * basis.right[0] + y * basis.right[1] + z * basis.right[2];
            out.cy = x * basis.up[0] + y * basis.up[1] + z * basis.up[2];
            out.z = -(
              x * basis.back[0] +
              y * basis.back[1] +
              z * basis.back[2]
            );
            out.inv = 1 / out.z;
            out.x = w * 0.5 + focal * out.cx * out.inv;
            out.y = h * 0.5 - focal * out.cy * out.inv;
            return out;
          }
          if (!layer.dynamic) {
            const indexed = prepared.get(layer.mesh) ?? prepare(layer.mesh);
            for (let i = 0; i < indexed.points.length; i++)
              projectVertex(indexed.points[i], indexed.screen[i]);
            for (const f of indexed.polygons) {
              verts.length = f.indices.length;
              for (let i = 0; i < f.indices.length; i++)
                verts[i] = indexed.screen[f.indices[i]];
              polygon(verts, f.color);
            }
          } else {
            // Rigged pieces already share their transformed joint vertices within a frame.
            const vertices = new Map<Vec, Screen>();
            for (const f of layer.mesh) {
              verts.length = f.points.length;
              for (let i = 0; i < f.points.length; i++) {
                const p = f.points[i];
                let v = vertices.get(p);
                if (!v) {
                  v = projectVertex(p, emptyScreen());
                  vertices.set(p, v);
                }
                verts[i] = v;
              }
              polygon(verts, tint(f.rgb));
            }
          }
        }
        return count;
      }
      const { solid, panes } = splitGlazing(layers, basis);
      const staticLayers = solid.filter(
          (l) => !l.dynamic && (!motion || scaleAt(l, clock) === 1),
        ),
        animated = solid.filter(
          (l) => l.dynamic || (motion && scaleAt(l, clock) < 1),
        );
      const view = [
        w,
        h,
        camera.yaw,
        camera.pitch,
        camera.distance,
        slope,
        ...camera.target,
      ].join(",");
      if (
        view !== cachedView ||
        staticLayers.length !== cachedLayers.length ||
        !staticLayers.every((l, i) => l === cachedLayers[i])
      ) {
        depth.fill(0);
        pixels.fill(0);
        staticFaces = render(staticLayers);
        backgroundDepth.set(depth);
        background.set(pixels);
        cachedView = view;
        cachedLayers = staticLayers;
      } else {
        depth.set(backgroundDepth);
        pixels.set(background);
      }
      const faces = staticFaces + render(animated);
      // A depth-tested contact shadow grounds the feet on the actual surface colour,
      // including the transition from a paver to grass. Only the projected footprint is touched.
      const foot = animated.find((l) => l.foot)?.foot;
      if (foot) {
        const cx = foot[0] + 0.07,
          cz = foot[2] - 0.04,
          { eye, right, up, back } = basis;
        const corners: Screen[] = [];
        for (const dx of [-0.43, 0.43])
          for (const dz of [-0.3, 0.3]) {
            const v: Vec = [
              cx + dx - eye[0],
              foot[1] - eye[1],
              cz + dz - eye[2],
            ];
            const z = -dot(v, back);
            if (z > 0.12) corners.push(projected(dot(v, right), dot(v, up), z));
          }
        if (corners.length === 4) {
          const x0 = Math.max(
              0,
              Math.floor(Math.min(...corners.map((p) => p.x))) - 2,
            ),
            x1 = Math.min(
              w - 1,
              Math.ceil(Math.max(...corners.map((p) => p.x))) + 2,
            );
          const y0 = Math.max(
              0,
              Math.floor(Math.min(...corners.map((p) => p.y))) - 2,
            ),
            y1 = Math.min(
              h - 1,
              Math.ceil(Math.max(...corners.map((p) => p.y))) + 2,
            );
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const i = y * w + x;
              if (!depth[i]) continue;
              const z = 1 / depth[i],
                sx = (x + 0.5 - w * 0.5) / focal,
                sy = (h * 0.5 - y - 0.5) / focal;
              const wy = eye[1] + (right[1] * sx + up[1] * sy - back[1]) * z;
              if (Math.abs(wy - foot[1]) > 0.11) continue;
              const dx =
                (eye[0] + (right[0] * sx + up[0] * sy - back[0]) * z - cx) /
                0.43;
              const dz =
                (eye[2] + (right[2] * sx + up[2] * sy - back[2]) * z - cz) /
                0.3;
              const contact = 1 - dx * dx - dz * dz;
              if (contact <= 0) continue;
              const factor = 1 - 0.19 * contact * contact,
                color = pixels[i];
              pixels[i] =
                0xff000000 |
                ((((color >>> 16) & 255) * factor) << 16) |
                ((((color >>> 8) & 255) * factor) << 8) |
                (((color & 255) * factor) | 0);
            }
        }
      }
      const glassFaces = render(panes, true);
      ctx.putImageData(image, 0, 0);
      return faces + glassFaces;
    },
    dispose() {
      cachedLayers = [];
      image = null;
      depth = new Float32Array(0);
      backgroundDepth = new Float32Array(0);
      background = new Uint32Array(0);
    },
  };
}
export function createPainter(
  host: HTMLElement,
  onLoss: () => void,
  forceSoftware = false,
) {
  let canvas = document.createElement("canvas");
  host.replaceChildren(canvas);
  let painter: Painter,
    accelerated = true;
  try {
    const gl =
      !forceSoftware &&
      canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
      });
    if (!gl) throw Error("WebGL unavailable");
    painter = gpu(canvas, gl);
  } catch {
    canvas = document.createElement("canvas");
    host.replaceChildren(canvas);
    accelerated = false;
    painter = softwarePainter(canvas);
  }
  canvas.dataset.renderer = accelerated ? "webgl" : "software";
  const lost = (e: Event) => {
    e.preventDefault();
    onLoss();
  };
  canvas.addEventListener("webglcontextlost", lost);
  return {
    canvas,
    painter,
    accelerated,
    dispose() {
      canvas.removeEventListener("webglcontextlost", lost);
      painter.dispose();
      canvas.remove();
    },
  };
}
