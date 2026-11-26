import {
  buildEnvironment,
  buildPlant,
  walkLandscape,
  walkStructure,
  walkRoof,
} from "./buildings";
import {
  gardenerFrame,
  walkingGardener,
  planVisit,
  type CareAction,
  type VisitPlan,
} from "./gardener";
import { roomLevel, type Level, type Specimen } from "./garden";
import {
  rooms,
  roomFloorY,
  surfacePoint,
  specimenScale,
  visibleOnLevel,
  type Placement,
  type RoomId,
  roomFloor,
} from "../home";
import {
  cameraBasis,
  clipLens,
  createPainter,
  fitCamera,
  floorAt,
  geometryBounds,
  initialCamera,
  interpolateCamera,
  intersection,
  type Camera,
  type Layer,
  type Quality,
} from "./renderer";
import {
  advancePlayer,
  clearFollowDistance,
  followCamera,
  makePlayer,
  nearbyPlants,
  smoothCamera,
  walkArea,
  walkPlants,
  type Player,
  type WalkContext,
  type WalkPlant,
} from "./player";
import {
  advanceFlight,
  eyeCamera,
  standingEye,
  landFromFlight,
  FlightCollision,
  type Flight,
  type WalkView,
} from "./first-person";
import { SITE } from "./plan";
import type { Mesh, Vec } from "./mesh";

export type VisitRequest = { key: string; plantId: string; action: CareAction };
export type VisitResult = "completed" | "failed" | "unreachable" | "cancelled";
export type ExplorerStats = {
  quality: Quality;
  accelerated: boolean;
  fps: number | null;
  triangles: number;
};
export type ExplorerProps = {
  level: Level;
  plants: Specimen[];
  selected: string;
  draft: Placement | null;
  moving: boolean;
  mode?: "overview" | "room" | "plant" | "free" | "walk";
  walkView?: WalkView;
  onToggleView?: () => void;
  room?: RoomId | null;
  quality?: Quality | "auto";
  visit?: VisitRequest | null;
  onPick: (id: string) => void;
  onPlace: (p: Placement) => void;
  onWorkComplete?: (key: string) => Promise<boolean>;
  onVisitEnd?: (key: string, result: VisitResult) => void;
  onWalkContext?: (context: WalkContext) => void;
  onStats?: (s: ExplorerStats) => void;
};
type ActiveVisit = {
  request: VisitRequest;
  plan: VisitPlan;
  time: number;
  save: "waiting" | "saving" | "success" | "failure";
};
const defaultCareOffset = (): Camera => ({
  yaw: 0,
  pitch: 0,
  distance: 1,
  target: [0, 0, 0],
});
const eqPlacement = (
  a: Placement | null | undefined,
  b: Placement | null | undefined,
) => a?.room === b?.room && a?.x === b?.x && a?.y === b?.y;
type Model = { mesh: Mesh; bounds: ReturnType<typeof geometryBounds> };
const clamp = (v: number, low: number, high: number) =>
  Math.min(high, Math.max(low, v));
const preferredMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)");
export function automaticQuality(
  accelerated: boolean,
  cores: number,
  memory: number,
  touch: boolean,
): Quality {
  if (!accelerated || cores <= 4 || memory <= 3 || (touch && memory <= 4))
    return "low";
  return "balanced";
}
export function plantCamera(p: Placement, aspect: number): Camera {
  const { x, y, z } = surfacePoint(p),
    s = specimenScale(p.room);
  const r = Math.max(0.85, 1.5 * s);
  const azimuth =
    p.room === "shelf"
      ? 1.08
      : p.room === "window"
        ? -1.22
        : p.room === "backyard"
          ? Math.PI - 0.38
          : 0.42;
  const camera = fitCamera(
    [x - r, y - 0.12, z - r],
    [x + r, y + 1.92 * s, z + r],
    aspect,
    azimuth,
    0.57,
  );
  camera.distance = Math.max(3.1, camera.distance);
  return camera;
}
function roomCamera(room: RoomId, aspect: number) {
  const r = rooms[room],
    y = roomFloorY(room);
  return fitCamera(
    [r.x - 0.16, y, r.z - 0.15],
    [r.x + r.width + 0.16, y + 1.75, r.z + r.depth + 0.16],
    aspect,
    room === "backyard" ? Math.PI - 0.4 : 0.46,
    0.74,
  );
}
export function careCamera(
  plan: VisitPlan,
  actor: Vec,
  aspect: number,
): Camera {
  const target = plan.target,
    r = 0.47;
  const yaw =
    Math.atan2(target[0] - plan.stance[0], target[2] - plan.stance[2]) +
    Math.PI * 0.48;
  return fitCamera(
    [
      Math.min(actor[0], target[0]) - r,
      Math.min(actor[1], target[1]) - 0.12,
      Math.min(actor[2], target[2]) - r,
    ],
    [
      Math.max(actor[0], target[0]) + r,
      Math.max(actor[1] + 1.86, target[1] + 0.9),
      Math.max(actor[2], target[2]) + r,
    ],
    aspect,
    yaw,
    roomLevel(plan.placement.room) === "garden" ? 0.36 : 0.54,
    1.13,
  );
}
// Cull bounded patches of architecture and planting independently at eye level.
export function spatialLayers(mesh: Mesh): Layer[] {
  const patches = new Map<string, Mesh>();
  for (const face of mesh) {
    const [x, y, z] = face.center;
    const key =
      Math.floor(x / 3) + "," + Math.floor(y / 3) + "," + Math.floor(z / 3);
    const group = patches.get(key);
    if (group) group.push(face);
    else patches.set(key, [face]);
  }
  return Array.from(patches.values(), (group) => ({
    mesh: group,
    bounds: geometryBounds(group),
  }));
}
export class Explorer {
  private engine: ReturnType<typeof createPainter>;
  private props: ExplorerProps;
  private camera: Camera;
  private tween: { from: Camera; to: Camera; start: number } | null = null;
  private layers: Layer[] = [];
  private assetCache = new Map<string, Model>();
  private architecture: Layer[] = [];
  private walkingWorld = new Map<string, Layer[]>();
  private manualGoal: Camera | null = null;
  private player: Player | null = null;
  private inputTime = 0;
  private poseStride = -1;
  private poseGait = 0;
  private walkKeys = new Set<string>();
  private stick = { right: 0, forward: 0 };
  private nearby: string[] = [];
  private walkContextKey = "";
  private careYawDelta = 0;
  private walkObstacles: WalkPlant[] = [];
  private walkYaw = 0;
  private walkPitch = 0.22;
  private walkDistance = 3.65;
  private flight: Flight | null = null;
  private flightWorld: FlightCollision | null = null;
  private mapCamera: Camera | null = null;
  private flyLift = 0;
  private get walkView(): WalkView {
    return this.props.walkView ?? "gardener";
  }
  private get firstPerson() {
    return this.onFoot && this.walkView !== "gardener";
  }
  private followSettling = false;
  private lastViewport = "";
  private get onFoot() {
    return this.props.mode === "walk" && !!this.player;
  }
  private get visibleLevel(): Level {
    if (!this.onFoot) return this.actorLevel ?? this.props.level;
    if (this.walkView === "fly") return "garden";
    return this.player!.floor === "stairs"
      ? "dollhouse"
      : (this.player!.floor as Level);
  }
  private levelKey = "";
  private plantLayers = new Map<string, { key: string; layer: Layer }>();
  private active: ActiveVisit | null = null;
  private seenVisit = "";
  private careOffset = defaultCareOffset();
  private actor: Layer | null = null;
  private actorLevel: Level | null = null;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastFrame = 0;
  private lastBusyFrame = 0;
  private movingUntil = 0;
  private freeCamera = false;
  private inViewport = true;
  private stopped = false;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver | null = null;
  private motion = preferredMotion();
  private quality: Quality;
  private lastStats = 0;
  private frameTime = 0;
  private frameCount = 0;
  private measuredFps: number | null = null;
  private statsSignature = "";
  private lodEye: Vec = [0, 0, 0];
  private lastLodDistance = 0;
  private enterUntil = 0;
  private softwareCap = 320_000;
  constructor(
    private host: HTMLElement,
    props: ExplorerProps,
    private onFailure: () => void,
  ) {
    this.props = props;
    this.engine = createPainter(host, this.onContextLoss);
    this.quality = this.resolveQuality();
    this.camera = this.viewCamera();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.inViewport = entry?.isIntersecting ?? true;
        if (this.inViewport) this.wake();
        else {
          this.stopWalkInput();
          this.pauseFrames();
        }
      });
      this.intersectionObserver.observe(host);
    }
    document.addEventListener("visibilitychange", this.visibility);
    this.motion.addEventListener("change", this.motionChanged);
    this.walkObstacles = walkPlants(props.plants);
    if (props.mode === "walk") this.enterWalk();
    this.resize();
    this.syncLayers(this.visibleLevel);
    this.startRequest(props.visit);
    this.wake();
  }
  private resolveQuality() {
    if (this.props.quality && this.props.quality !== "auto")
      return this.props.quality;
    const memory =
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 6;
    return automaticQuality(
      this.engine.accelerated,
      navigator.hardwareConcurrency || 4,
      memory,
      matchMedia("(pointer: coarse)").matches,
    );
  }
  private viewCamera() {
    const p = this.props;
    if (p.mode === "plant") {
      const place =
        p.draft ?? p.plants.find((v) => v.id === p.selected)?.placement;
      if (place) return plantCamera(place, this.aspect);
    }
    if (p.mode === "room" && p.room) return roomCamera(p.room, this.aspect);
    return initialCamera(p.level, p.plants.length, this.aspect);
  }
  private get aspect() {
    return this.host.clientWidth / Math.max(1, this.host.clientHeight);
  }
  private tweenTo(camera: Camera) {
    this.manualGoal = null;
    if (this.motion.matches) {
      this.camera = camera;
      this.tween = null;
    } else
      this.tween = { from: this.camera, to: camera, start: performance.now() };
    this.wake();
  }
  private resize = () => {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    const maxDpr =
      this.quality === "ultra" ? 2 : this.quality === "balanced" ? 1.45 : 1;
    const pixelBudget = this.engine.accelerated
      ? this.quality === "ultra"
        ? 4800000
        : this.quality === "balanced"
          ? 2600000
          : 1250000
      : this.props.quality === "ultra"
        ? 960_000
        : this.props.quality === "balanced"
          ? 500_000
          : this.onFoot
            ? Math.min(this.softwareCap, 210000)
            : this.softwareCap;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      maxDpr,
      Math.sqrt(pixelBudget / (w * h)),
    );
    const canvas = this.engine.canvas;
    const width = Math.max(1, Math.round(w * dpr)),
      height = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const size = w + "/" + h;
    if (
      this.lastViewport !== size &&
      !this.onFoot &&
      !this.active &&
      !this.freeCamera
    ) {
      if (this.lastViewport) this.tweenTo(this.viewCamera());
      else this.camera = this.viewCamera();
    }
    this.lastViewport = size;
    this.wake();
  };
  private visibility = () => {
    if (document.hidden) {
      this.stopWalkInput();
      this.pauseFrames();
    } else this.wake();
  };
  private motionChanged = () => {
    if (this.motion.matches && this.tween) {
      this.camera = this.tween.to;
      this.tween = null;
    }
    this.wake();
  };
  private onContextLoss = () => {
    this.engine.dispose();
    try {
      this.engine = createPainter(this.host, this.onContextLoss, true);
      this.quality = this.resolveQuality();
      this.levelKey = "";
      this.resize();
      this.syncLayers(this.visibleLevel);
      this.wake();
    } catch {
      this.endVisit("failed");
      this.pauseFrames();
      this.onFailure();
    }
  };
  private pauseFrames() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.timer);
    this.lastFrame = 0;
    this.lastBusyFrame = 0;
  }
  private wake() {
    if (this.stopped || !this.inViewport || document.hidden) return;
    clearTimeout(this.timer);
    if (!this.raf) {
      if (!this.lastFrame) this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.render);
    }
  }
  configure(next: ExplorerProps) {
    const old = this.props;
    const viewChanged =
      next.mode !== old.mode ||
      next.level !== old.level ||
      next.room !== old.room ||
      (next.mode === "plant" &&
        (next.selected !== old.selected ||
          !eqPlacement(
            next.draft ??
              next.plants.find((p) => p.id === next.selected)?.placement,
            old.draft ??
              old.plants.find((p) => p.id === old.selected)?.placement,
          )));
    if (next.mode === "walk" && old.mode !== "walk")
      this.mapCamera =
        old.level === "garden" &&
        (old.mode === "overview" || old.mode === "free")
          ? (this.manualGoal ?? this.camera)
          : null;
    this.props = next;
    if (next.plants !== old.plants)
      this.walkObstacles = walkPlants(next.plants);
    if (next.mode !== old.mode) {
      if (next.mode === "walk") {
        this.enterWalk();
        this.resize();
      } else if (old.mode === "walk") {
        this.stopWalkInput();
        this.actor = null;
        this.actorLevel = null;
        this.flight = null;
        delete this.engine.canvas.dataset.cameraEye;
        delete this.engine.canvas.dataset.cameraForward;
        delete this.engine.canvas.dataset.walkView;
        delete this.engine.canvas.dataset.walkArea;
        delete this.engine.canvas.dataset.walkPosition;
        this.resize();
      }
    }
    const viewpointChanged =
      next.mode === "walk" &&
      old.mode === "walk" &&
      next.walkView !== old.walkView;
    if (viewpointChanged) this.changeWalkView(old.walkView ?? "gardener");
    if (this.active?.save === "waiting") {
      const current = next.plants.find(
        (p) => p.id === this.active!.request.plantId,
      )?.placement;
      if (
        !eqPlacement(current, this.active.plan.placement) ||
        next.visit?.key !== this.active.request.key
      )
        this.endVisit("cancelled");
    }
    if (old.quality !== next.quality) {
      this.quality = this.resolveQuality();
      this.levelKey = "";
      this.resize();
    }
    if (viewChanged && !this.active && !this.onFoot) {
      this.freeCamera = next.mode === "free";
      if (old.mode === "walk") {
        // One short UI dissolve avoids a camera path through the walls between eye and aerial views.
        this.camera =
          (next.level === "garden" && this.mapCamera) || this.viewCamera();
        this.tween = null;
        this.manualGoal = null;
        this.wake();
      } else this.tweenTo(this.viewCamera());
    }
    if (
      viewpointChanged ||
      viewChanged ||
      next.plants !== old.plants ||
      next.selected !== old.selected ||
      next.draft !== old.draft ||
      next.quality !== old.quality
    )
      this.syncLayers(this.visibleLevel);
    this.startRequest(next.visit);
  }
  private enterWalk() {
    const resume = !!this.player;
    const selected = this.props.plants.find(
      (p) => p.id === this.props.selected,
    );
    if (selected?.placement) {
      const others = this.walkObstacles
        .filter((p) => p.id !== selected.id)
        .map((p) => p.placement);
      const visit = planVisit(selected.placement, "Inspect", others);
      if (visit)
        this.player = makePlayer({
          position: visit.stance,
          floor: roomFloor(selected.placement.room),
          yaw: Math.atan2(
            visit.target[0] - visit.stance[0],
            visit.target[2] - visit.stance[2],
          ),
        });
    }
    this.player ??= makePlayer();
    this.stopWalkInput();
    if (!resume || selected?.placement) {
      this.walkYaw = this.player.yaw + Math.PI;
      if (selected?.placement && !this.firstPerson) this.walkYaw += 0.77;
      this.walkPitch = this.firstPerson ? 0.035 : 0.22;
      this.walkDistance = 3.65;
    }
    this.actor = null;
    this.walkContextKey = "";
    this.freeCamera = true;
    this.manualGoal = null;
    this.tween = null;
    this.lastFrame = 0;
    this.followSettling = true;
    if (this.firstPerson) this.setEye();
    this.wake();
  }
  private setEye() {
    const eye = standingEye(this.player!);
    this.flight = this.walkView === "fly" ? { eye, velocity: [0, 0, 0] } : null;
    this.camera = eyeCamera(eye, this.walkYaw, this.walkPitch);
  }
  private changeWalkView(previous: WalkView) {
    this.stopWalkInput();
    if (previous === "fly" && this.flight) {
      this.player =
        landFromFlight(
          this.flight.eye,
          this.walkYaw,
          this.walkObstacles,
          this.canFly,
        ) ?? this.player;
      this.flight = null;
    }
    const p = this.player!;
    this.walkPitch = clamp(
      this.walkPitch,
      this.firstPerson ? -1.43 : -0.1,
      this.firstPerson ? 1.43 : 0.98,
    );
    if (this.firstPerson) this.setEye();
    else this.walkDistance = 3.65;
    this.actor = null;
    this.walkContextKey = "";
    this.followSettling = true;
    this.engine.canvas.dataset.walkPosition = p.position
      .map((v) => v.toFixed(3))
      .join(",");
    this.wake();
  }
  setLift(value: number) {
    if (!this.onFoot || this.walkView !== "fly") return;
    this.integrateWalk(performance.now());
    this.flyLift = clamp(value, -1, 1);
    this.wake();
  }
  private canFly = (point: Vec) =>
    !!this.flightWorld?.allows(point) &&
    this.walkObstacles.every(
      (o) =>
        point[1] < o.minY ||
        point[1] > o.maxY ||
        Math.hypot(point[0] - o.x, point[2] - o.z) > o.radius,
    );
  nudgeLift(direction: number) {
    if (!this.flight) return;
    advanceFlight(
      this.flight,
      { right: 0, forward: 0, lift: direction, brisk: false },
      this.walkYaw,
      this.walkPitch,
      0.18,
      this.canFly,
    );
    this.flight.velocity = [0, 0, 0];
    this.wake();
  }
  setWalkKey(key: string, down: boolean) {
    if (
      !this.onFoot ||
      (!(this.walkView === "fly" && ["q", "e", " "].includes(key)) &&
        ![
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "shift",
          "j",
          "l",
        ].includes(key))
    )
      return false;
    if (this.active || this.walkKeys.has(key) === down) return true;
    // Account for a key release between display frames, including quick direction changes.
    this.integrateWalk(performance.now());
    if (down) this.walkKeys.add(key);
    else this.walkKeys.delete(key);
    this.wake();
    return true;
  }
  setWalkStick(right: number, forward: number) {
    if (!this.onFoot || this.active) return;
    this.integrateWalk(performance.now());
    this.stick = { right, forward };
    this.wake();
  }
  stopWalkInput() {
    this.inputTime = performance.now();
    this.walkKeys.clear();
    this.flyLift = 0;
    if (this.flight) this.flight.velocity = [0, 0, 0];
    this.stick = { right: 0, forward: 0 };
    if (this.player) {
      this.player.vx = 0;
      this.player.vz = 0;
    }
  }
  tendNearest() {
    if (!this.onFoot || this.active || this.walkView === "fly") return;
    const id = this.nearby.includes(this.props.selected)
      ? this.props.selected
      : this.nearby[0];
    if (id) this.props.onPick(id);
  }
  private constrainLens(c: Camera, floor: Player["floor"]) {
    c.distance = clearFollowDistance(c, floor);
    if (c.distance < 7 && this.architecture.length)
      c.distance = clipLens(c, this.architecture);
  }
  private updateFollow(dt: number) {
    const player = this.player!;
    if (this.firstPerson && !this.active) {
      const eye = this.flight?.eye ?? standingEye(player);
      const goal = eyeCamera(eye, this.walkYaw, this.walkPitch);
      // Never smooth a position through a jamb. Only the viewing angles have inertia.
      const from = { ...goal, yaw: this.camera.yaw, pitch: this.camera.pitch };
      this.camera = this.motion.matches
        ? goal
        : smoothCamera(from, goal, dt, 26);
      this.followSettling = this.camera !== goal;
      return;
    }
    let goal: Camera;
    if (this.active) {
      // A three-quarter angle separates the gardener and soil in the image during the action.
      goal = careCamera(this.active.plan, player.position, this.aspect);
      goal.yaw = this.walkYaw + this.careYawDelta;
      goal.pitch = clamp(
        goal.pitch + (this.firstPerson ? 0 : this.walkPitch - 0.22),
        0.04,
        1.1,
      );
      goal.distance *= this.walkDistance / 3.65;
    } else
      goal = followCamera(
        player,
        this.walkYaw,
        this.walkPitch,
        this.walkDistance,
      );
    this.constrainLens(goal, player.floor);
    const next = this.motion.matches
      ? goal
      : smoothCamera(this.camera, goal, dt, this.active ? 5.8 : 11);
    // Retract immediately when a wall enters the boom. Extending back into open space eases normally.
    if (next !== goal) this.constrainLens(next, player.floor);
    this.camera = next;
    this.followSettling = next !== goal;
  }
  private integrateWalk(now: number) {
    const player = this.player!;
    const dt = clamp((now - this.inputTime) / 1000, 0, 0.45);
    this.inputTime = Math.max(this.inputTime, now);
    if (!dt) return;
    const down = (...keys: string[]) =>
      Number(keys.some((k) => this.walkKeys.has(k)));
    this.walkYaw += (down("j") - down("l")) * dt * 1.85;
    const level = this.visibleLevel;
    const input = {
      right:
        this.stick.right + down("d", "arrowright") - down("a", "arrowleft"),
      forward:
        this.stick.forward + down("w", "arrowup") - down("s", "arrowdown"),
      brisk: this.walkKeys.has("shift"),
    };
    if (this.flight && this.flightWorld) {
      advanceFlight(
        this.flight,
        { ...input, lift: this.flyLift + down("e", " ") - down("q") },
        this.camera.yaw,
        this.camera.pitch,
        dt,
        this.canFly,
      );
    } else
      advancePlayer(player, input, this.camera.yaw, dt, this.walkObstacles);
    if (level !== this.visibleLevel) this.syncLayers(this.visibleLevel);
  }
  private updateWalk(dt: number, clock: number) {
    const player = this.player!;
    this.integrateWalk(clock * 1000);
    this.updateFollow(dt);
    if (
      !this.firstPerson &&
      (!this.actor ||
        this.poseStride !== player.stride ||
        Math.abs(this.poseGait - player.gait) > 0.0001)
    ) {
      this.poseStride = player.stride;
      this.poseGait = player.gait;
      this.actor = {
        foot: player.position,
        mesh: walkingGardener(
          player.position,
          player.yaw,
          player.stride,
          player.gait,
          clock,
          player.floor === "garden",
        ),
        dynamic: true,
      };
    }
    const area = this.flight ? "Fly view" : walkArea(player);
    this.nearby = this.flight ? [] : nearbyPlants(player, this.walkObstacles);
    const basis = cameraBasis(this.camera);
    this.engine.canvas.dataset.cameraEye = basis.eye
      .map((v) => v.toFixed(3))
      .join(",");
    this.engine.canvas.dataset.cameraForward = basis.back
      .map((v) => (-v).toFixed(3))
      .join(",");
    this.engine.canvas.dataset.walkView = this.walkView;
    const signature = JSON.stringify([area, ...this.nearby]);
    if (signature !== this.walkContextKey) {
      this.walkContextKey = signature;
      this.props.onWalkContext?.({ area, ids: this.nearby });
    }
    this.engine.canvas.dataset.walkArea = area;
    this.engine.canvas.dataset.walkPosition = player.position
      .map((v) => v.toFixed(3))
      .join(",");
  }
  private startRequest(request: VisitRequest | undefined | null) {
    if (
      !request ||
      this.stopped ||
      this.seenVisit === request.key ||
      this.active
    )
      return;
    this.seenVisit = request.key;
    const p = this.props.plants.find((p) => p.id === request.plantId);
    const obstacles = this.props.plants.flatMap((other) =>
      other.id !== request.plantId && other.placement ? [other.placement] : [],
    );
    const plan =
      p?.placement &&
      !(this.onFoot && this.walkView === "fly") &&
      planVisit(
        p.placement,
        request.action,
        obstacles,
        this.onFoot ? this.player! : undefined,
      );
    if (!plan || !this.props.onWorkComplete || !this.props.onVisitEnd) {
      this.props.onVisitEnd?.(request.key, "unreachable");
      return;
    }
    this.stopWalkInput();
    this.manualGoal = null;
    if (this.onFoot) {
      const camera = careCamera(plan, plan.stance, this.aspect);
      const angles = [camera.yaw, camera.yaw + Math.PI].map((yaw) => {
        const turn = Math.atan2(
          Math.sin(yaw - this.walkYaw),
          Math.cos(yaw - this.walkYaw),
        );
        const clearance = clearFollowDistance(
          { ...camera, yaw },
          this.player!.floor,
        );
        return {
          turn,
          score: clearance / camera.distance - 0.13 * Math.abs(turn),
        };
      });
      this.careYawDelta =
        angles[0].score >= angles[1].score ? angles[0].turn : angles[1].turn;
    }
    this.active = { request, plan, time: 0, save: "waiting" };
    this.careOffset = defaultCareOffset();
    this.tween = null;
    this.lastFrame = 0;
    this.lastBusyFrame = 0;
    this.wake();
  }
  private persist(visit: ActiveVisit) {
    visit.save = "saving";
    const key = visit.request.key;
    Promise.resolve()
      .then(() =>
        this.active === visit && !this.stopped
          ? this.props.onWorkComplete?.(key)
          : false,
      )
      .then(
        (ok) => {
          if (this.active === visit) {
            visit.save = ok ? "success" : "failure";
            this.lastFrame = 0;
            this.wake();
          }
        },
        () => {
          if (this.active === visit) {
            visit.save = "failure";
            this.lastFrame = 0;
            this.wake();
          }
        },
      );
  }
  private endVisit(outcome: VisitResult) {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.actor = null;
    this.actorLevel = null;
    delete this.engine.canvas.dataset.carePhase;
    if (!this.stopped) {
      if (this.onFoot) {
        if (outcome === "completed")
          this.player!.yaw = Math.atan2(
            active.plan.target[0] - active.plan.stance[0],
            active.plan.target[2] - active.plan.stance[2],
          );
        if (this.firstPerson) this.setEye();
        this.wake();
      } else {
        this.freeCamera = false;
        this.tweenTo(this.viewCamera());
      }
      this.syncLayers(this.visibleLevel);
      this.props.onVisitEnd?.(active.request.key, outcome);
    }
  }
  private levelOfVisit(plan: VisitPlan, pos: Vec): Level {
    const floor = roomLevel(plan.placement.room);
    if (floor !== "upper") return floor;
    return pos[1] > 0.18 && pos[1] < 3.17
      ? "dollhouse"
      : pos[1] >= 3.17
        ? "upper"
        : "ground";
  }
  private updateVisit(dt: number) {
    const visit = this.active;
    if (!visit) return;
    if (visit.save !== "saving")
      visit.time = Math.min(visit.plan.duration, visit.time + dt);
    if (visit.time >= visit.plan.workCompleteAt && visit.save === "waiting") {
      visit.time = visit.plan.workCompleteAt;
      this.persist(visit);
    }
    const pose = gardenerFrame(visit.plan, visit.time);
    this.engine.canvas.dataset.carePhase =
      visit.save === "saving" ? "saving" : pose.phase;
    this.actor = { mesh: pose.mesh, dynamic: true, foot: pose.position };
    if (this.onFoot) {
      this.updateFollow(dt);
      if (visit.time >= visit.plan.duration)
        this.endVisit(visit.save === "success" ? "completed" : "failed");
      return;
    }
    const level = this.levelOfVisit(visit.plan, pose.position);
    if (level !== this.actorLevel) {
      this.actorLevel = level;
      this.syncLayers(level);
    }
    let destination: Camera;
    const fixedTravel =
      !this.engine.accelerated &&
      (pose.phase === "arriving" || pose.phase === "returning");
    if (this.motion.matches || fixedTravel) {
      const r = visit.plan.route;
      const low: Vec = [Infinity, Infinity, Infinity],
        high: Vec = [-Infinity, -Infinity, -Infinity];
      for (const p of [...r, visit.plan.target])
        for (let i = 0; i < 3; i++) {
          low[i] = Math.min(low[i], p[i] - 0.55);
          high[i] = Math.max(high[i], p[i] + (i === 1 ? 1.9 : 0.55));
        }
      destination = fitCamera(low, high, this.aspect, 0.42, 0.67);
    } else {
      destination = careCamera(
        visit.plan,
        this.engine.accelerated ? pose.position : visit.plan.stance,
        this.aspect,
      );
    }
    destination.yaw += this.careOffset.yaw;
    destination.pitch = clamp(
      destination.pitch + this.careOffset.pitch,
      0.12,
      1.49,
    );
    destination.distance = clamp(
      destination.distance * this.careOffset.distance,
      1.3,
      170,
    );
    destination.target = destination.target.map(
      (n, i) => n + this.careOffset.target[i],
    ) as Vec;
    const amount = this.motion.matches
      ? 1
      : 1 - Math.exp(-Math.max(0.016, dt) * 3.7);
    const settled =
      Math.abs(this.camera.distance - destination.distance) < 0.08 &&
      Math.abs(this.camera.yaw - destination.yaw) < 0.01 &&
      Math.abs(this.camera.pitch - destination.pitch) < 0.01 &&
      this.camera.target.every(
        (v, i) => Math.abs(v - destination.target[i]) < 0.04,
      );
    // A fixed view lets the software painter reuse its architecture colour and depth buffers throughout the pour.
    this.camera = settled
      ? destination
      : interpolateCamera(this.camera, destination, amount);
    if (visit.time >= visit.plan.duration)
      this.endVisit(visit.save === "success" ? "completed" : "failed");
  }
  private syncLayers(level: Level) {
    const roofVisible = level === "garden" || this.firstPerson;
    const key =
        (this.onFoot ? "walk/" + roofVisible + "/" : "") +
        level +
        "|" +
        this.quality,
      now = performance.now() / 1000;
    const first = !this.architecture.length;
    if (this.levelKey !== key) {
      if (this.onFoot) {
        const cached = (name: string, build: () => Mesh) => {
          let result = this.walkingWorld.get(name);
          if (!result) {
            result = spatialLayers(build());
            this.walkingWorld.set(name, result);
          }
          return result;
        };
        // Keep just this quality in memory; the building stays furnished across thresholds.
        for (const k of this.walkingWorld.keys())
          if (!k.startsWith(this.quality + "/")) this.walkingWorld.delete(k);

        this.architecture = [
          ...cached(this.quality + "/terrain", () =>
            walkLandscape(this.quality),
          ),
          ...cached(this.quality + "/house", () => walkStructure(this.quality)),
          ...(roofVisible
            ? cached(this.quality + "/roof", () => walkRoof(this.quality))
            : []),
        ];
      } else
        this.architecture = [{ mesh: buildEnvironment(level, this.quality) }];
      this.flightWorld = null;
      this.levelKey = key;
    }
    if (this.flight && !this.flightWorld)
      this.flightWorld = new FlightCollision(
        this.architecture.map((a) => a.mesh),
      );
    const old = this.plantLayers,
      newLayers = new Map<string, { key: string; layer: Layer }>(),
      assetCache = new Map<string, Model>();
    const layers: Layer[] = [...this.architecture];
    for (const plant of this.props.plants) {
      const place =
        plant.id === this.props.selected && this.props.draft
          ? this.props.draft
          : plant.placement;
      if (!place || (!this.onFoot && !visibleOnLevel(level, place.room)))
        continue;
      const selected = plant.id === this.props.selected;
      const pt = surfacePoint(place),
        at: Vec = [pt.x, pt.y, pt.z];
      const detail = this.plantQuality(selected, at);
      const assetKey = [
        detail,
        place.room,
        plant.model,
        selected,
        plant.health.stress.toFixed(3),
        plant.health.dryness.toFixed(3),
      ].join("|");
      const layerKey = assetKey + "|" + at.join(",");
      let model = assetCache.get(assetKey) ?? this.assetCache.get(assetKey);
      if (!model) {
        const mesh = buildPlant(
          this.onFoot ? roomFloor(place.room) : level,
          plant,
          place,
          selected,
          detail,
        );
        if (!mesh.length) continue;
        for (const face of mesh) {
          face.points = face.points.map(
            (v) => v.map((n, i) => n - at[i]) as Vec,
          );
          face.center = face.center.map((n, i) => n - at[i]) as Vec;
        }
        model = { mesh, bounds: geometryBounds(mesh) };
      }
      assetCache.set(assetKey, model);
      const previous = old.get(plant.id);
      let layer = previous?.layer;
      if (!layer || previous?.key !== layerKey) {
        const isNew =
          !previous && !first && !this.motion.matches && !this.active;
        layer = {
          mesh: model.mesh,
          bounds: model.bounds,
          at,
          owner: plant.id,
          wind: true,
          bornAt: isNew ? now : undefined,
        };
        if (isNew) this.enterUntil = now + 0.45;
      }
      newLayers.set(plant.id, { key: layerKey, layer });
      layers.push(layer);
    }
    this.layers = layers;
    this.plantLayers = newLayers;
    this.assetCache = assetCache;
    this.lodEye = cameraBasis(this.camera).eye;
    this.lastLodDistance = this.camera.distance;
    this.wake();
  }
  private plantQuality(selected: boolean, at: Vec): Quality {
    if (this.quality === "low") return "low";
    const eye = cameraBasis(this.camera).eye,
      d = Math.hypot(eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]);
    const projected = this.host.clientHeight / (Math.max(1, d) * 0.73);
    if (!selected && projected < 24) return "low";
    return this.quality;
  }
  private render = (now: number) => {
    this.raf = 0;
    if (this.stopped || document.hidden || !this.inViewport) return;
    const dt = this.lastFrame
      ? clamp((now - this.lastFrame) / 1000, 0, this.onFoot ? 0.45 : 0.25)
      : 0;
    this.lastFrame = now;
    if (this.active) this.updateVisit(dt);
    else if (this.onFoot) this.updateWalk(dt, now / 1000);
    else if (this.manualGoal) {
      this.camera = this.motion.matches
        ? this.manualGoal
        : smoothCamera(this.camera, this.manualGoal, dt);
      if (this.camera === this.manualGoal) this.manualGoal = null;
    } else if (this.tween) {
      const progress = clamp((now - this.tween.start) / 580, 0, 1);
      this.camera = interpolateCamera(
        this.tween.from,
        this.tween.to,
        progress * progress * (3 - 2 * progress),
      );
      if (progress === 1) this.tween = null;
    }
    const clock = now / 1000;
    const motion = !this.motion.matches;
    const closeCamera =
      this.onFoot && !this.active && this.camera.distance < 0.52;
    const layers =
      this.actor && !closeCamera ? [...this.layers, this.actor] : this.layers;
    const triangles = this.engine.painter.draw(
      this.camera,
      layers,
      this.quality,
      clock,
      motion,
    );
    this.engine.canvas.dataset.triangles = String(triangles);
    this.engine.canvas.dataset.quality = this.quality;
    const busy =
      !!this.active ||
      !!this.manualGoal ||
      (this.onFoot &&
        (this.followSettling ||
          this.walkKeys.size > 0 ||
          !!this.stick.right ||
          !!this.stick.forward ||
          !!this.flyLift ||
          this.flight?.velocity.some((v) => Math.abs(v) > 0.001) ||
          (!this.flight && this.player!.gait > 0.002))) ||
      !!this.tween ||
      now < this.movingUntil ||
      clock < this.enterUntil;
    this.report(triangles, now, busy);
    if (!this.active && this.quality !== "low" && this.plantLayers.size) {
      const eye = cameraBasis(this.camera).eye;
      const travelled = Math.hypot(
        eye[0] - this.lodEye[0],
        eye[1] - this.lodEye[1],
        eye[2] - this.lodEye[2],
      );
      const zoomRatio = this.lastLodDistance
        ? this.camera.distance / this.lastLodDistance
        : 1;
      if (travelled > 2.5 || zoomRatio > 1.45 || zoomRatio < 0.69)
        this.syncLayers(this.visibleLevel);
    }
    if (busy && this.active?.save !== "saving") {
      this.wake();
      return;
    }
    // A new drag after reading the inspector starts its own clock. Idle time must
    // never count as easing time or as the cost of a rendered frame.
    this.lastFrame = 0;
    this.lastBusyFrame = 0;
    if (
      !busy &&
      this.engine.accelerated &&
      this.quality !== "low" &&
      motion &&
      this.plantLayers.size
    ) {
      this.timer = setTimeout(() => this.wake(), 110);
    }
  };
  private report(triangles: number, now: number, busy: boolean) {
    if (busy && this.lastBusyFrame) {
      this.frameTime += now - this.lastBusyFrame;
      this.frameCount++;
    }
    this.lastBusyFrame = busy ? now : 0;
    if (now - this.lastStats > 1300 && this.frameCount >= 8) {
      this.measuredFps = Math.min(
        240,
        Math.round((1000 * this.frameCount) / this.frameTime),
      );
      const auto = !this.props.quality || this.props.quality === "auto";
      if (auto && this.measuredFps < 35 && this.quality !== "low") {
        this.quality = "low";
        this.levelKey = "";
        this.resize();
        this.syncLayers(this.visibleLevel);
      } else if (
        auto &&
        !this.engine.accelerated &&
        this.measuredFps < 18 &&
        this.softwareCap > 82000
      ) {
        this.softwareCap = Math.max(82000, Math.round(this.softwareCap * 0.72));
        this.resize();
      }
      this.frameCount = 0;
      this.frameTime = 0;
      this.lastStats = now;
    }
    this.engine.canvas.dataset.fps = this.measuredFps?.toString() ?? "";
    const signature = [
      this.quality,
      this.engine.accelerated,
      this.measuredFps,
      this.levelKey,
      this.plantLayers.size,
    ].join(",");
    if (this.statsSignature !== signature) {
      this.statsSignature = signature;
      this.props.onStats?.({
        quality: this.quality,
        accelerated: this.engine.accelerated,
        fps: this.measuredFps,
        triangles,
      });
    }
  }
  private manual() {
    this.freeCamera = true;
    this.tween = null;
    this.movingUntil = performance.now() + 120;
    this.wake();
    return this.manualGoal ?? this.camera;
  }
  rotate(dx: number, dy: number) {
    const c = this.manual();
    if (this.onFoot) {
      this.walkYaw -= dx;
      this.walkPitch = clamp(
        this.walkPitch + dy,
        this.firstPerson ? -1.43 : -0.1,
        this.firstPerson ? 1.43 : 0.98,
      );
    } else if (this.active) {
      this.careOffset.yaw -= dx;
      this.careOffset.pitch = clamp(this.careOffset.pitch + dy, -1, 1);
    } else
      this.manualGoal = {
        ...c,
        yaw: c.yaw - dx,
        pitch: clamp(c.pitch + dy, 0.12, 1.49),
      };
  }
  zoom(factor: number) {
    if (this.firstPerson && !this.active) return;
    const c = this.manual();
    if (this.onFoot)
      this.walkDistance = clamp(this.walkDistance * factor, 1.05, 6);
    else if (this.active)
      this.careOffset.distance = clamp(
        this.careOffset.distance * factor,
        0.4,
        3,
      );
    else
      this.manualGoal = {
        ...c,
        distance: clamp(c.distance * factor, 1.3, 170),
      };
  }
  pan(dx: number, dy: number, vertical = 0) {
    if (this.onFoot) return;
    const c = this.manual(),
      { right } = cameraBasis(c);
    const target: Vec = [
      clamp(
        c.target[0] + (right[0] * dx - Math.sin(c.yaw) * dy) * c.distance,
        SITE.x - 1,
        SITE.x + SITE.width + 1,
      ),
      clamp(c.target[1] + vertical, 0.18, 8),
      clamp(
        c.target[2] + (right[2] * dx - Math.cos(c.yaw) * dy) * c.distance,
        SITE.z - 1,
        SITE.z + SITE.depth + 1,
      ),
    ];
    if (this.active)
      this.careOffset.target = this.careOffset.target.map((n, i) =>
        clamp(n + target[i] - c.target[i], -4, 4),
      ) as Vec;
    else this.manualGoal = { ...c, target };
  }
  reset() {
    if (this.onFoot) {
      if (!this.flight) this.walkYaw = this.player!.yaw + Math.PI;
      this.walkPitch = this.firstPerson ? 0 : 0.22;
      this.walkDistance = 3.65;
      this.wake();
      return;
    }
    if (this.active) {
      this.careOffset = defaultCareOffset();
      this.wake();
      return;
    }
    this.freeCamera = false;
    this.tweenTo(this.viewCamera());
  }
  pick(nx: number, ny: number) {
    if (this.active) return;
    if (this.props.moving) {
      const p = floorAt(this.camera, this.aspect, nx, ny, this.props.level);
      if (p) this.props.onPlace(p);
    } else {
      const id = intersection(this.layers, this.camera, this.aspect, nx, ny);
      if (id && (!this.onFoot || this.nearby.includes(id)))
        this.props.onPick(id);
    }
  }
  dispose() {
    this.stopped = true;
    this.pauseFrames();
    this.active = null;
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.motion.removeEventListener("change", this.motionChanged);
    this.engine.dispose();
    this.layers = [];
    this.actor = null;
    this.architecture = [];
    this.walkingWorld.clear();
    this.stopWalkInput();
    this.plantLayers.clear();
    this.assetCache.clear();
  }
}
