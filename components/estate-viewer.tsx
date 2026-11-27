"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Compass,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { Explorer, type ExplorerProps } from "@/lib/estate/explorer";

import { bindMouseLook } from "@/lib/estate/pointer-look";

function WalkPad({
  onMove,
  onFocus,
}: {
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
}) {
  const active = useRef<number | null>(null);
  function track(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerId !== active.current) return;
    const el = e.currentTarget,
      r = el.getBoundingClientRect(),
      reach = r.width * 0.36;
    const x = (e.clientX - r.left - r.width / 2) / reach,
      y = (e.clientY - r.top - r.height / 2) / reach;
    const scale = Math.max(1, Math.hypot(x, y)),
      right = x / scale,
      down = y / scale;
    el.style.setProperty("--stick-x", right * reach * 0.65 + "px");
    el.style.setProperty("--stick-y", down * reach * 0.65 + "px");
    onMove(right, -down);
  }
  function release(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerId !== active.current) return;
    active.current = null;
    e.currentTarget.style.removeProperty("--stick-x");
    e.currentTarget.style.removeProperty("--stick-y");
    onMove(0, 0);
  }
  return (
    <button
      type="button"
      className="estate-stick"
      aria-label="Movement pad. Drag to walk, or activate to use keyboard movement."
      onClick={onFocus}
      onPointerDown={(e) => {
        if (active.current !== null || e.button !== 0) return;
        e.preventDefault();
        onFocus();
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        track(e);
      }}
      onPointerMove={track}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {[0, 90, 180, 270].map((a) => (
        <ChevronUp
          aria-hidden="true"
          key={a}
          style={{ transform: "rotate(" + a + "deg) translateY(-30px)" }}
        />
      ))}
      <span aria-hidden="true" />
    </button>
  );
}

export default function EstateViewer(props: ExplorerProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Explorer | null>(null);
  const latest = useRef(props);
  const [failed, setFailed] = useState(false);
  const [mouse, setMouse] = useState<"free" | "locked" | "drag">("free");
  const look = useRef<ReturnType<typeof bindMouseLook> | null>(null);
  const eyes =
    props.mode === "walk" &&
    (props.walkView === "eyes" || props.walkView === "fly");
  const fly = eyes && props.walkView === "fly";
  const rejected = useRef("");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef({ x: 0, y: 0, dragged: false });
  useEffect(() => {
    latest.current = props;
    scene.current?.configure(props);
    if (!eyes || props.visit) look.current?.release();
    if (failed && props.visit && rejected.current !== props.visit.key) {
      rejected.current = props.visit.key;
      props.onVisitEnd?.(props.visit.key, "unreachable");
    }
  });
  useEffect(() => {
    if (props.mode === "walk" && !props.visit)
      host.current?.focus({ preventScroll: true });
  }, [props.mode, props.walkView, props.visit]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let mounted = true,
      failureFrame = 0;
    const fail = () => {
      failureFrame = requestAnimationFrame(() => {
        if (mounted) setFailed(true);
      });
    };
    try {
      scene.current = new Explorer(el, latest.current, fail);
    } catch {
      fail();
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.shiftKey) {
        scene.current?.pan(-e.deltaY * unit * 0.001, 0);
        return;
      }
      scene.current?.zoom(
        Math.exp(Math.max(-1, Math.min(1, e.deltaY * unit * 0.0013))),
      );
    };
    const canLock = () =>
      latest.current.mode === "walk" &&
      (latest.current.walkView === "eyes" ||
        latest.current.walkView === "fly") &&
      !latest.current.visit;
    const mouseLook = bindMouseLook(
      el,
      canLock,
      (x, y) => scene.current?.rotate(x, y),
      (locked, denied) => {
        pointers.current.clear();
        scene.current?.stopWalkInput();
        setMouse(locked ? "locked" : denied ? "drag" : "free");
      },
    );
    look.current = mouseLook;
    const clear = () => {
      scene.current?.stopWalkInput();
      mouseLook.release();
      pointers.current.clear();
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const shortcut = (e: globalThis.KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== "c" ||
        e.repeat ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        latest.current.visit
      )
        return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input,textarea,select,[role=dialog]") ||
          (target !== document.body &&
            !el.closest(".estate-stage")?.contains(target)))
      )
        return;
      if (!latest.current.onToggleView) return;
      e.preventDefault();
      mouseLook.release();
      latest.current.onToggleView();
      requestAnimationFrame(
        () => el.isConnected && el.focus({ preventScroll: true }),
      );
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", shortcut);
    window.addEventListener("blur", clear);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      mounted = false;
      cancelAnimationFrame(failureFrame);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", shortcut);
      mouseLook.dispose();
      look.current = null;
      el.removeEventListener("wheel", wheel);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  function down(e: PointerEvent<HTMLDivElement>) {
    if (look.current?.locked()) return;
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    const points = pointers.current;
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (points.size === 0)
      start.current = { x: e.clientX, y: e.clientY, dragged: false };
    else start.current.dragged = true;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (look.current?.locked()) return;
    const points = pointers.current,
      previous = points.get(e.pointerId);
    if (!previous) return;
    const x = e.clientX,
      y = e.clientY,
      dx = x - previous.x,
      dy = y - previous.y;
    if (Math.hypot(x - start.current.x, y - start.current.y) > 4)
      start.current.dragged = true;
    const other = [...points.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y),
        after = Math.hypot(x - other.x, y - other.y);
      if (after > 2 && before > 2) scene.current?.zoom(before / after);
      scene.current?.pan(-dx * 0.00055, dy * 0.00055);
    } else if (
      props.mode !== "walk" &&
      (e.buttons === 2 || e.buttons === 4 || e.shiftKey)
    )
      scene.current?.pan(-dx * 0.00125, dy * 0.00125);
    else if (start.current.dragged) {
      const gain = eyes ? 0.004 : 0.007;
      scene.current?.rotate(dx * gain, dy * gain);
    }
    points.set(e.pointerId, { x, y });
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (look.current?.locked()) {
      if (e.button === 0 && !fly) scene.current?.pick(0, 0);
      return;
    }
    const points = pointers.current;
    if (
      !points.delete(e.pointerId) ||
      points.size ||
      start.current.dragged ||
      e.button !== 0
    )
      return;
    if (eyes && !props.visit && e.pointerType === "mouse" && mouse !== "drag") {
      look.current?.capture();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    scene.current?.pick(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      1 - ((e.clientY - r.top) / r.height) * 2,
    );
  }
  function cameraButton(change: (viewer: Explorer) => void) {
    if (!scene.current) return;
    change(scene.current);
    if (props.mode === "walk") host.current?.focus({ preventScroll: true });
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const viewer = scene.current;
    if (!viewer) return;
    const key = e.key.toLowerCase();
    if (props.mode === "walk") {
      if (viewer.setWalkKey(key, true)) {
        e.preventDefault();
        return;
      }
      if (key === "tab" || key === "escape") {
        look.current?.release();
        return;
      }
      if ((key === "e" || key === "f") && !fly) {
        look.current?.release();
        if (!e.repeat) viewer.tendNearest();
        e.preventDefault();
        return;
      }
    }
    switch (key) {
      case "arrowleft":
        if (e.shiftKey) viewer.pan(-0.055, 0);
        else viewer.rotate(-0.14, 0);
        break;
      case "arrowright":
        if (e.shiftKey) viewer.pan(0.055, 0);
        else viewer.rotate(0.14, 0);
        break;
      case "arrowup":
        if (e.shiftKey) viewer.pan(0, 0.055);
        else viewer.rotate(0, 0.09);
        break;
      case "arrowdown":
        if (e.shiftKey) viewer.pan(0, -0.055);
        else viewer.rotate(0, -0.09);
        break;
      case "w":
        viewer.pan(0, 0.048);
        break;
      case "s":
        viewer.pan(0, -0.048);
        break;
      case "a":
        viewer.pan(-0.048, 0);
        break;
      case "d":
        viewer.pan(0.048, 0);
        break;
      case "q":
        viewer.pan(0, 0, -0.25);
        break;
      case "e":
        viewer.pan(0, 0, 0.25);
        break;
      case "+":
      case "=":
        viewer.zoom(0.82);
        break;
      case "-":
        viewer.zoom(1.22);
        break;
      case "home":
        viewer.reset();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
  return (
    <>
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- This canvas is a keyboard-operable 3D application with native orbit, zoom and reset buttons. */}
      <div
        ref={host}
        className="estate-canvas"
        tabIndex={0}
        role="application"
        aria-label={
          props.mode === "walk"
            ? eyes
              ? "First-person explorer. W A S D or arrows to move, Shift to sprint. Click for mouse look or drag, Escape releases the mouse. C switches to orbit. In flight, Q descends and E or Space rises. On foot, E tends a plant."
              : "Walk as gardener. W A S D or the arrow keys move. Hold Shift to walk faster. Drag or use J and L to look. E tends a nearby plant. Home centers the camera."
            : "Interactive 3D home. Drag or use arrow keys to orbit. Right-drag, use two fingers or W A S D to pan. Pinch, scroll, or press plus and minus to zoom. Q and E change height. Home fits the view. C switches to walking."
        }
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onLostPointerCapture={(e) => pointers.current.delete(e.pointerId)}
        onKeyDown={keys}
        onKeyUp={(e) => {
          if (scene.current?.setWalkKey(e.key.toLowerCase(), false))
            e.preventDefault();
        }}
        onBlur={() => {
          scene.current?.stopWalkInput();
          look.current?.release();
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        aria-hidden="true"
        className="estate-view-change"
        key={props.mode === "walk" ? props.walkView : "model"}
      />
      {mouse === "locked" && eyes && !props.visit && (
        <span className="estate-reticle" aria-hidden="true" />
      )}
      {mouse === "drag" && eyes && !props.visit && (
        <small className="estate-look-status" role="status">
          Drag to look around
        </small>
      )}
      {failed ? (
        <p className="estate-note" role="status">
          3D rendering is unavailable on this device. You can manage your plants
          and locations below.
        </p>
      ) : (
        <>
          {props.mode === "walk" && !props.visit && (
            <WalkPad
              onMove={(x, y) => scene.current?.setWalkStick(x, y)}
              onFocus={() => host.current?.focus({ preventScroll: true })}
            />
          )}
          <div
            className="estate-tools"
            role="group"
            aria-label="Camera controls"
          >
            <button
              type="button"
              aria-label="Rotate left"
              title="Rotate left"
              onClick={() => cameraButton((viewer) => viewer.rotate(-0.32, 0))}
            >
              <RotateCcw />
            </button>
            <button
              type="button"
              aria-label="Rotate right"
              title="Rotate right"
              onClick={() => cameraButton((viewer) => viewer.rotate(0.32, 0))}
            >
              <RotateCw />
            </button>
            {!eyes && (
              <>
                <span />
                <button
                  type="button"
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => cameraButton((viewer) => viewer.zoom(1.25))}
                >
                  <Minus />
                </button>
                <button
                  type="button"
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => cameraButton((viewer) => viewer.zoom(0.8))}
                >
                  <Plus />
                </button>
              </>
            )}
            {fly && (
              <>
                <span />
                {([-1, 1] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    aria-label={direction === 1 ? "Fly up" : "Fly down"}
                    title={
                      direction === 1 ? "Fly up (E or Space)" : "Fly down (Q)"
                    }
                    onPointerDown={(e) => {
                      e.preventDefault();
                      host.current?.focus({ preventScroll: true });
                      e.currentTarget.setPointerCapture(e.pointerId);
                      scene.current?.setLift(direction);
                    }}
                    onPointerUp={() => scene.current?.setLift(0)}
                    onLostPointerCapture={() => scene.current?.setLift(0)}
                    onPointerCancel={() => scene.current?.setLift(0)}
                    onClick={(e) => {
                      if (e.detail === 0)
                        cameraButton((viewer) => viewer.nudgeLift(direction));
                    }}
                  >
                    {direction === 1 ? <ArrowUp /> : <ArrowDown />}
                  </button>
                ))}
              </>
            )}
            <span />
            <button
              type="button"
              aria-label={
                eyes
                  ? "Level view"
                  : props.mode === "walk"
                    ? "Center behind gardener"
                    : "Fit scene"
              }
              title={
                eyes
                  ? "Level view"
                  : props.mode === "walk"
                    ? "Center behind gardener"
                    : "Fit scene"
              }
              onClick={() => cameraButton((viewer) => viewer.reset())}
            >
              <Compass />
            </button>
          </div>
        </>
      )}
    </>
  );
}
