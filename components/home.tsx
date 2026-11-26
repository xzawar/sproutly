"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Armchair,
  Box,
  Check,
  ChevronDown,
  Compass,
  Droplets,
  Expand,
  Flower2,
  Footprints,
  Map as MapIcon,
  House,
  Layers2,
  Leaf,
  MapPin,
  Minimize,
  Move,
  Plus,
  ScanEye,
  Scissors,
  SlidersHorizontal,
  Trees,
  X,
} from "lucide-react";
import { useGarden } from "./garden-provider";
import { useEstateCare } from "./use-estate-care";
import {
  rooms,
  roomIds,
  roomFloor,
  spotName,
  findPlacement,
  type Placement,
  type RoomId,
} from "@/lib/home";
import { gardenPlants, type Level } from "@/lib/estate/garden";
import {
  caredToday,
  dueRoutine,
  scheduledAction,
  takeHandoff,
} from "@/lib/estate/care";
import type { WalkView } from "@/lib/estate/first-person";
import type { WalkContext } from "@/lib/estate/player";
import type { CareAction } from "@/lib/estate/gardener";
import { formatDate } from "@/lib/dates";
import "./home.css";

const Viewer = dynamic(() => import("./estate-viewer"), {
  ssr: false,
  loading: () => (
    <div className="estate-loading" role="status">
      <span className="loading-leaf">
        <Leaf size={22} />
      </span>{" "}
      Opening your home…
    </div>
  ),
});
const floors = [
  { id: "garden", label: "Exterior", icon: Trees },
  { id: "dollhouse", label: "Dollhouse", icon: Box },
  { id: "ground", label: "Ground floor", icon: House },
  { id: "upper", label: "First floor", icon: Layers2 },
] as const;
type Mode = "overview" | "room" | "plant" | "free" | "walk";
type Quality = "auto" | "low" | "balanced" | "ultra";
type Stats = {
  quality: Exclude<Quality, "auto">;
  accelerated: boolean;
  fps: number | null;
  triangles: number;
};
const actions = {
  Water: Droplets,
  Fertilize: Flower2,
  Prune: Scissors,
  Mist: Droplets,
  Inspect: ScanEye,
};
const dateLabel = (
  d: string | null | undefined,
  today: string,
  empty: string,
) =>
  !d
    ? empty
    : d === today
      ? "Today"
      : formatDate(d, { month: "short", day: "numeric", year: "numeric" });
const samePlace = (
  a: Placement | null | undefined,
  b: Placement | null | undefined,
) => !!a && !!b && a.room === b.room && a.x === b.x && a.y === b.y;

export function HomeView({
  initialPlant,
  handoff = null,
}: {
  initialPlant: string | null;
  handoff?: string | null;
}) {
  const { data, demo, busy, today, run } = useGarden();
  const base = demo ? "/demo" : "";
  const [clock, setClock] = useState(() => Date.now());
  const plants = useMemo(
    () =>
      gardenPlants(data.plants, data.categories, {
        schedules: data.schedules,
        history: data.history,
        today,
        now: clock,
      }),
    [data.plants, data.categories, data.schedules, data.history, today, clock],
  );
  const [id, setId] = useState(initialPlant ?? "");
  const selected = plants.find((p) => p.id === id);
  const record = data.plants.find((p) => p.id === id && !p.archived_at);
  const [level, setLevel] = useState<Level>(() =>
    selected?.placement ? roomFloor(selected.placement.room) : "garden",
  );
  const [mode, setMode] = useState<Mode>(initialPlant ? "plant" : "overview");
  const walking = mode === "walk";
  const [walkView, setWalkView] = useState<WalkView>("eyes");
  const [walkInfo, setWalkInfo] = useState<WalkContext>({
    area: "Front garden",
    ids: [],
  });
  const updateWalk = useCallback((context: WalkContext) => {
    setWalkInfo(context);
    setId((current) => (context.ids.includes(current) ? current : ""));
  }, []);
  const [room, setRoom] = useState<RoomId | null>(null);
  const [draft, setDraft] = useState<Placement | null>(null),
    [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false),
    [quality, setQuality] = useState<Quality>("auto");
  const [qualityOpen, setQualityOpen] = useState(false);
  const [moreCare, setMoreCare] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const stage = useRef<HTMLElement>(null),
    fullButton = useRef<HTMLButtonElement>(null),
    qualityPanel = useRef<HTMLDivElement>(null);
  const morePanel = useRef<HTMLDivElement>(null);
  const hydratedPlant = useRef<string | null>(null),
    consumedHandoff = useRef<string | null>(null);
  const {
    visit,
    start,
    finish,
    workComplete,
    cancel,
    committing,
    status,
    setStatus,
  } = useEstateCare();
  const locked = busy || !!visit;
  const occupied = useMemo(
    () =>
      plants.flatMap((p) => (p.id !== id && p.placement ? [p.placement] : [])),
    [plants, id],
  );

  useEffect(() => {
    const tick = setInterval(() => {
      if (!document.hidden) setClock(Date.now());
    }, 60000);
    const initialize = requestAnimationFrame(() => {
      try {
        const q = localStorage.getItem("sproutly-home-quality");
        if (q === "low" || q === "balanced" || q === "ultra") setQuality(q);
      } catch {
        /* The renderer still uses the current in-memory quality. */
      }
    });
    return () => {
      clearInterval(tick);
      cancelAnimationFrame(initialize);
    };
  }, []);

  // The workspace may first render a cached or empty plant list before its authoritative sync completes.
  useEffect(() => {
    if (
      !initialPlant ||
      selected?.id !== initialPlant ||
      hydratedPlant.current === initialPlant ||
      !selected.placement
    )
      return;
    const floor = roomFloor(selected.placement.room);
    const frame = requestAnimationFrame(() => {
      hydratedPlant.current = initialPlant;
      setLevel(floor);
      setMode("plant");
    });
    return () => cancelAnimationFrame(frame);
  }, [initialPlant, selected]);

  useEffect(() => {
    if (
      !handoff ||
      consumedHandoff.current === handoff ||
      !selected ||
      busy ||
      !selected.placement
    )
      return;
    const frame = requestAnimationFrame(() => {
      const task = takeHandoff(handoff, selected.id, data.profile.id);
      consumedHandoff.current = handoff;
      if (!task) return;
      const schedule = data.schedules.find((s) => s.id === task.scheduleId);
      const action = schedule && scheduledAction(schedule);
      if (!action) {
        setStatus("This care task is no longer available.");
        return;
      }
      start(selected.id, action, task);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    handoff,
    selected,
    busy,
    data.profile.id,
    data.schedules,
    start,
    setStatus,
  ]);

  useEffect(() => {
    const sync = () => {
      setExpanded(!!document.fullscreenElement);
      if (!document.fullscreenElement) fullButton.current?.focus();
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !document.fullscreenElement &&
        !document.pointerLockElement
      ) {
        setExpanded(false);
        fullButton.current?.focus();
      }
      if (e.key !== "Tab") return;
      const list = Array.from(
        stage.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],select:not(:disabled),[tabindex='0']",
        ) ?? [],
      ).filter((el) => el.getClientRects().length);
      if (e.shiftKey && document.activeElement === list[0]) {
        list.at(-1)?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
        list[0]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", key);
    };
  }, [expanded]);
  useEffect(() => {
    if (!qualityOpen && !moreCare) return;
    const outside = (e: PointerEvent) => {
      if (!qualityPanel.current?.contains(e.target as Node))
        setQualityOpen(false);
      if (!morePanel.current?.contains(e.target as Node)) setMoreCare(false);
    };
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQualityOpen(false);
        setMoreCare(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", close);
    };
  }, [qualityOpen, moreCare]);

  async function fullscreen() {
    if (expanded) {
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => setExpanded(false));
      else {
        setExpanded(false);
        fullButton.current?.focus();
      }
    } else if (stage.current) {
      try {
        await stage.current.requestFullscreen();
      } catch {
        setExpanded(true);
      }
      if (walking)
        stage.current
          ?.querySelector<HTMLElement>(".estate-canvas")
          ?.focus({ preventScroll: true });
    }
  }
  const updateStats = useCallback((s: Stats) => setStats(s), []);
  function clearInteraction() {
    setDraft(null);
    setEditing(false);
    setMoreCare(false);
    setQualityOpen(false);
    setStatus("");
  }
  function select(value: string) {
    if (locked) return;
    if (walking && value && !walkInfo.ids.includes(value)) return;
    clearInteraction();
    if (walking && value && document.pointerLockElement)
      document.exitPointerLock();
    setId(value);
    if (walking) {
      if (value)
        requestAnimationFrame(() =>
          stage.current
            ?.querySelector<HTMLButtonElement>(
              ".estate-actions button:not(:disabled)",
            )
            ?.focus({ preventScroll: true }),
        );
      return;
    }
    setRoom(null);
    const p = plants.find((p) => p.id === value)?.placement;
    if (p) {
      setLevel(roomFloor(p.room));
      setMode("plant");
    } else setMode("overview");
  }
  function overview(next: Level) {
    if (locked) return;
    clearInteraction();
    setId("");
    setMode("overview");
    setRoom(null);
    setLevel(next);
  }
  function toggleWalk() {
    if (locked) return;
    if (walking) {
      overview("garden");
      return;
    }
    clearInteraction();
    setRoom(null);
    if (walkView === "fly") setWalkView("eyes");
    setMode("walk");
  }
  function explore(value: string) {
    if (locked) return;
    if (value === "overview") {
      overview(level);
      return;
    }
    clearInteraction();
    setId("");
    if (value === "free") {
      setRoom(null);
      setMode("free");
      return;
    }
    const r = roomIds.find((r) => r === value);
    if (!r) return;
    setRoom(r);
    setLevel(roomFloor(r));
    setMode("room");
  }
  function offerPlace(p: Placement) {
    const safe = findPlacement(rooms[p.room].name, occupied, p);
    if (!safe || safe.room !== p.room) {
      setStatus("This space is full. Choose another room or bed.");
      return;
    }
    setDraft(safe);
    setRoom(safe.room);
    setLevel(roomFloor(safe.room));
    setMode("room");
    setStatus("");
  }
  async function save() {
    if (!draft || !selected || locked) return;
    if (
      await run({
        kind: "plant.place",
        payload: { id: selected.id, placement: draft },
      })
    ) {
      setEditing(false);
      setDraft(null);
      setMode("plant");
      setStatus(`${selected.name} saved in ${rooms[draft.room].name}.`);
    } else
      setStatus(
        "Could not save this spot. Check that it is still free and try again.",
      );
  }
  function careAction(action: CareAction) {
    if (!selected || locked || (walking && !walkInfo.ids.includes(selected.id)))
      return;
    clearInteraction();
    if (selected.placement && !walking) {
      setLevel(roomFloor(selected.placement.room));
      setMode("plant");
    }
    start(selected.id, action, undefined, walking);
  }
  function careButton(action: CareAction, primary = false) {
    if (!selected) return null;
    const already =
      action !== "Inspect" &&
      !dueRoutine(data.schedules, id, action, today) &&
      caredToday(data.history, id, action, today);
    const Icon = already ? Check : actions[action];
    return (
      <button
        type="button"
        key={action}
        className={primary ? "estate-primary" : "estate-button"}
        disabled={locked || !selected.placement || already}
        onClick={() => careAction(action)}
        title={already ? "Recorded today" : undefined}
      >
        <Icon size={16} />
        {action}
        {already && <span className="sr-only"> recorded today</span>}
      </button>
    );
  }
  const spaceCount = new Set(
    plants.flatMap((p) => (p.placement ? [p.placement.room] : [])),
  ).size;
  const availablePlants = walking
    ? walkInfo.ids.flatMap((id) => plants.filter((p) => p.id === id))
    : plants;
  const nearest = availablePlants[0];
  const current = draft ?? selected?.placement;
  const title = walking
    ? walkInfo.area
    : visit
      ? selected?.name
      : mode === "room" && room
        ? rooms[room].name
        : mode === "plant" && selected
          ? selected.name
          : level === "garden"
            ? "Garden & exterior"
            : level === "dollhouse"
              ? "Entire house"
              : level === "upper"
                ? "First floor"
                : "Ground floor";
  return (
    <div className="estate-page">
      <header className="estate-heading">
        <div>
          <h1>Home</h1>
          <p>
            {plants.length} {plants.length === 1 ? "plant" : "plants"} in{" "}
            {spaceCount} {spaceCount === 1 ? "space" : "spaces"}
          </p>
        </div>
        <Link href={`${base}/plants/new?from=home`} className="estate-add">
          <Plus size={17} /> Add plant
        </Link>
      </header>
      <section
        ref={stage}
        className={`estate-stage${expanded ? " is-expanded" : ""}`}
        aria-label="Home explorer"
      >
        <div className="estate-bar">
          {walking ? (
            <label className="estate-on-foot estate-location">
              <Compass size={17} aria-hidden="true" />
              <select
                aria-label="Explore camera"
                disabled={locked}
                value={walkView}
                onChange={(e) => setWalkView(e.target.value as WalkView)}
              >
                <option value="eyes">First person</option>
                <option value="fly">Fly</option>
                <option value="gardener">Follow gardener</option>
              </select>
            </label>
          ) : (
            <div
              className="estate-segment"
              role="group"
              aria-label="House views"
            >
              {floors.map(({ id: floor, label, icon: Icon }) => (
                <button
                  type="button"
                  key={floor}
                  disabled={locked}
                  aria-pressed={level === floor}
                  onClick={() => overview(floor)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="estate-bar-end">
            <button
              className="estate-walk-toggle"
              type="button"
              aria-pressed={walking}
              title={
                walking
                  ? "Return to Orbit Model View (C)"
                  : "Enter Walk / Explore View (C)"
              }
              aria-keyshortcuts="C"
              onClick={toggleWalk}
              disabled={locked}
            >
              {walking ? <MapIcon size={16} /> : <Footprints size={16} />}{" "}
              {walking ? "Back to map" : "Walk as gardener"}
            </button>
            {!walking && (
              <label className="estate-location">
                <Compass size={16} />
                <select
                  aria-label="Explore a location"
                  value={
                    mode === "room" && room
                      ? room
                      : mode === "free"
                        ? "free"
                        : "overview"
                  }
                  onChange={(e) => explore(e.target.value)}
                  disabled={locked}
                >
                  <option value="overview">Explore spaces</option>
                  <option value="free">Free orbit</option>
                  {(["garden", "ground", "upper"] as const).map((floor) => (
                    <optgroup
                      key={floor}
                      label={
                        floor === "garden"
                          ? "Outdoors"
                          : floor === "ground"
                            ? "Ground floor"
                            : "First floor"
                      }
                    >
                      {roomIds
                        .filter((r) => roomFloor(r) === floor)
                        .map((r) => (
                          <option key={r} value={r}>
                            {rooms[r].name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
            )}
            <div className="estate-settings" ref={qualityPanel}>
              <button
                type="button"
                className="estate-full"
                aria-label="Rendering quality"
                title="Rendering quality"
                aria-expanded={qualityOpen}
                onClick={() => setQualityOpen(!qualityOpen)}
              >
                <SlidersHorizontal size={17} />
              </button>
              {qualityOpen && (
                <div className="estate-quality-popup">
                  <label>
                    Rendering quality
                    <select
                      value={quality}
                      onChange={(e) => {
                        const q = e.target.value as Quality;
                        setQuality(q);
                        try {
                          localStorage.setItem("sproutly-home-quality", q);
                        } catch {
                          /* The renderer still uses the current in-memory quality. */
                        }
                      }}
                    >
                      {["auto", "low", "balanced", "ultra"].map((q) => (
                        <option value={q} key={q}>
                          {q === "auto"
                            ? "Automatic"
                            : q[0].toUpperCase() + q.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {stats && (
                    <small>
                      {stats.accelerated ? "WebGL" : "Software renderer"} ·{" "}
                      {stats.quality}
                      {stats.fps !== null
                        ? ` · ${Math.round(stats.fps)} fps`
                        : ""}
                    </small>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              ref={fullButton}
              onClick={fullscreen}
              className="estate-full"
              aria-label={expanded ? "Exit fullscreen" : "Enter fullscreen"}
              title={expanded ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {expanded ? <Minimize size={18} /> : <Expand size={18} />}
            </button>
          </div>
        </div>
        <div className={walking ? "estate-world walking" : "estate-world"}>
          <Viewer
            level={level}
            plants={plants}
            selected={selected?.id ?? ""}
            draft={draft}
            moving={editing && !locked}
            onPick={select}
            onPlace={offerPlace}
            room={room}
            mode={mode}
            walkView={walkView}
            onToggleView={toggleWalk}
            quality={quality}
            visit={visit}
            onWorkComplete={workComplete}
            onVisitEnd={finish}
            onStats={updateStats}
            onWalkContext={updateWalk}
          />
          {walking && !visit && nearest && !selected && (
            <button
              type="button"
              className="estate-tend"
              onClick={() => select(nearest.id)}
            >
              <Leaf size={16} /> Tend {nearest.name}
              <kbd>E</kbd>
            </button>
          )}
          <div className="estate-caption">
            <span>{title}</span>
            {walking && !visit && (
              <small className="walk-guide">
                <span>
                  {walkView === "fly"
                    ? "WASD to fly · Q down · E up · C for orbit"
                    : walkView === "eyes"
                      ? "WASD to walk · Click for mouse look · Esc releases · C for orbit"
                      : "WASD or pad to walk · Drag to look"}
                </span>
                <span>
                  {walkView === "fly"
                    ? "Move with the pad · Arrows change height"
                    : "Move with the pad · Drag to look"}
                </span>
              </small>
            )}
            {mode === "free" && <small>Free orbit</small>}
          </div>
        </div>
        <div className="estate-inspector">
          <label className="estate-select">
            <span>
              <Leaf size={14} /> {walking ? "Within reach" : "Plant"}
            </span>
            <select
              aria-label="Plant"
              value={selected?.id ?? ""}
              disabled={locked || !availablePlants.length}
              onChange={(e) => select(e.target.value)}
            >
              <option value="">
                {walking && !availablePlants.length
                  ? walkView === "fly"
                    ? "Switch to walking to tend plants"
                    : "No plant nearby"
                  : plants.length
                    ? "Choose a plant"
                    : "No plants yet"}
              </option>
              {availablePlants.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          {selected ? (
            <>
              <div className="estate-selected">
                <strong>
                  {record?.scientific_name ||
                    record?.common_name ||
                    selected.modelLabel}
                </strong>
                <span>
                  {selected.placement
                    ? `${rooms[selected.placement.room].name} · ${spotName(selected.placement)}`
                    : "Choose a home location"}
                </span>
              </div>
              <div className="estate-actions">
                {!editing && !visit && (
                  <>
                    {careButton("Water", true)}
                    {careButton("Inspect")}
                    <div className="estate-more" ref={morePanel}>
                      <button
                        className="estate-button"
                        type="button"
                        disabled={locked}
                        aria-expanded={moreCare}
                        onClick={() => setMoreCare(!moreCare)}
                      >
                        More care <ChevronDown size={14} />
                      </button>
                      {moreCare && (
                        <div className="estate-extra-actions">
                          {(["Fertilize", "Prune", "Mist"] as const).map((a) =>
                            careButton(a),
                          )}
                        </div>
                      )}
                    </div>
                    {!walking && (
                      <button
                        className="estate-button"
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          clearInteraction();
                          setEditing(true);
                        }}
                      >
                        <MapPin size={16} /> Move plant
                      </button>
                    )}
                  </>
                )}
                {visit && !committing && (
                  <button
                    className="estate-button"
                    type="button"
                    onClick={cancel}
                  >
                    <X size={15} /> Cancel visit
                  </button>
                )}
                {editing && (
                  <button
                    className="estate-button"
                    type="button"
                    disabled={locked}
                    onClick={() => select(id)}
                  >
                    Cancel move
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="estate-help">
              <Move size={16} />
              {walking
                ? availablePlants.length
                  ? "Choose a nearby plant to care for it."
                  : "Walk up to a plant to care for it."
                : plants.length
                  ? "Drag to orbit. Pinch or scroll to zoom."
                  : "Add a plant to place it in your home."}
            </p>
          )}
        </div>
        {selected && !editing && (
          <div className="estate-facts">
            <div>
              <span>Care-based estimate</span>
              <strong>{selected.health.label}</strong>
            </div>
            <div>
              <span>Last watered</span>
              <strong>
                {dateLabel(selected.health.lastWatered, today, "No record")}
              </strong>
            </div>
            <div>
              <span>Next watering</span>
              <strong>
                {dateLabel(selected.health.nextWatering, today, "No routine")}
              </strong>
            </div>
            <div>
              <span>3D model</span>
              <strong>
                {selected.modelLabel}
                {selected.modelFallback ? " · approximation" : ""}
              </strong>
            </div>
            <Link href={`${base}/plants/${selected.id}`}>Plant details</Link>
          </div>
        )}
        {editing && selected && (
          <div className="estate-placement">
            <p>Choose a room or garden bed, then select a free spot.</p>
            <div className="estate-place-fields">
              <label>
                Room
                <select
                  value={current?.room ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    const r = e.target.value as RoomId;
                    offerPlace({ room: r, ...rooms[r].spots[0] });
                  }}
                >
                  <option disabled value="">
                    Choose a room
                  </option>
                  {roomIds.map((r) => (
                    <option value={r} key={r}>
                      {rooms[r].name}
                    </option>
                  ))}
                </select>
              </label>
              {current && (
                <label>
                  Spot
                  <select
                    value={`${current.x},${current.y}`}
                    disabled={locked}
                    onChange={(e) => {
                      const [x, y] = e.target.value.split(",").map(Number);
                      offerPlace({ room: current.room, x, y });
                    }}
                  >
                    {!rooms[current.room].spots.some(
                      (s) => s.x === current.x && s.y === current.y,
                    ) && (
                      <option value={`${current.x},${current.y}`}>
                        {spotName(current)}
                      </option>
                    )}
                    {rooms[current.room].spots.map((s, i) => (
                      <option key={i} value={`${s.x},${s.y}`}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="estate-save"
                disabled={
                  locked || !draft || samePlace(draft, selected.placement)
                }
                onClick={save}
              >
                Save placement
              </button>
            </div>
          </div>
        )}
        <p
          aria-live="polite"
          role="status"
          className={status ? "estate-feedback" : "sr-only"}
        >
          {status}
        </p>
      </section>
      {!walking && (
        <section className="estate-directory" aria-label="Plant collection">
          <h2>
            Plant collection <small>{plants.length}</small>
          </h2>
          {plants.length ? (
            <ul>
              {plants.map((p) => (
                <li key={p.id}>
                  <button
                    disabled={locked}
                    aria-pressed={selected?.id === p.id}
                    onClick={() => {
                      select(p.id);
                      stage.current?.scrollIntoView({
                        block: "start",
                        behavior: "instant",
                      });
                    }}
                  >
                    <span className="estate-dir-icon">
                      <Leaf size={18} />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.modelLabel}</small>
                    </span>
                    <span className="estate-room">
                      <Armchair size={14} />
                      {p.placement
                        ? rooms[p.placement.room].name
                        : "Choose a spot"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Your plants will appear here as you add them.</p>
          )}
        </section>
      )}
    </div>
  );
}
