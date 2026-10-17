"use client";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useGarden } from "./garden-provider";
import { PageHeading, Modal, Empty } from "./ui";
import { growthSchema, photoSchema } from "@/lib/validation";
import { uploadPlantImage, removeUnusedImage } from "@/app/actions";
import { formatDate } from "@/lib/dates";
import type { GrowthRecord, PlantPhoto } from "@/lib/types";

export function GrowthView() {
  const { data, today, demo, run, busy } = useGarden();
  const [plant, setPlant] = useState(
      data.plants.find((p) => !p.archived_at)?.id ?? "",
    ),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [edit, setEdit] = useState<Partial<GrowthRecord> | null>(null),
    [photo, setPhoto] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [remove, setRemove] = useState<{
      kind: "growth.delete" | "photo.delete";
      id: string;
      path?: string | null;
    } | null>(null);
  const current = data.plants.find((p) => p.id === plant),
    canEdit = current && !current.archived_at;
  const entries = data.growth
    .filter(
      (g) =>
        g.plant_id === plant &&
        (!from || g.recorded_on >= from) &&
        (!to || g.recorded_on <= to),
    )
    .sort(
      (a, b) =>
        a.recorded_on.localeCompare(b.recorded_on) || a.id.localeCompare(b.id),
    );
  const photos = data.photos
    .filter(
      (g) =>
        g.plant_id === plant &&
        (!from || g.taken_on >= from) &&
        (!to || g.taken_on <= to),
    )
    .sort((a, b) => b.taken_on.localeCompare(a.taken_on));
  const latest = entries.at(-1),
    first = entries[0];
  async function saveMeasurement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const v = growthSchema.safeParse({
      ...(edit?.id ? { id: edit.id } : {}),
      plant_id: plant,
      recorded_on: f.get("recorded_on"),
      height_cm: Number(f.get("height_cm")),
      leaf_count:
        f.get("leaf_count") === "" ? null : Number(f.get("leaf_count")),
      notes: f.get("notes"),
    });
    if (!v.success) {
      setError(v.error.issues[0].message);
      return;
    }
    if (await run({ kind: "growth.save", payload: v.data })) setEdit(null);
  }
  async function savePhoto(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget),
      file = f.get("image") as File;
    let path: string | null = null;
    setUploading(true);
    try {
      if (file?.size) {
        if (demo) {
          setError(
            "Uploads need connected Supabase Storage. Use an HTTPS image URL in the local demo.",
          );
          return;
        }
        const r = await uploadPlantImage(f);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        path = r.path;
      }
      const v = photoSchema.safeParse({
        plant_id: plant,
        taken_on: f.get("taken_on"),
        caption: f.get("caption"),
        image_path: path,
        image_url: path
          ? null
          : String(f.get("image_url") ?? "").trim() || null,
      });
      if (!v.success) {
        if (path) void removeUnusedImage(path);
        setError(v.error.issues[0].message);
        return;
      }
      if (await run({ kind: "photo.save", payload: v.data })) setPhoto(false);
      else if (path) void removeUnusedImage(path);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Growth journal"

        action={
          canEdit ? (
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setError("");
                  setPhoto(true);
                }}
              >
                📷 Add photo
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setError("");
                  setEdit({});
                }}
              >
                🌱 Add measurement
              </button>
            </div>
          ) : undefined
        }
      />
      <div className="filter-bar growth-filters">
        <label className="field">
          Plant
          <select
            aria-label="Journal plant"
            value={plant}
            onChange={(e) => setPlant(e.target.value)}
          >
            <option value="" disabled>
              Choose a plant
            </option>
            {data.plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived_at ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="text-link"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Clear dates
        </button>
      </div>
      {!plant ? (
        <section className="panel growth-panel">
          <Empty title="Every plant starts somewhere.">
            <p>Add a plant, then record its first measurement.</p>
          </Empty>
        </section>
      ) : (
        <>
          <div className="growth-stats">
            <article className="panel">
              <span className="muted">Latest height</span>
              <h2>{latest ? `${latest.height_cm} cm` : "Not measured"}</h2>
              <small>
                {latest
                  ? formatDate(latest.recorded_on)
                  : "Your first measurement awaits"}
              </small>
            </article>
            <article className="panel">
              <span className="muted">Change in selected period</span>
              <h2>
                {entries.length > 1
                  ? `${Number((latest!.height_cm - first.height_cm).toFixed(2)) >= 0 ? "+" : ""}${Number((latest!.height_cm - first.height_cm).toFixed(2))} cm`
                  : "—"}
              </h2>
              <small>
                {entries.length} observations · {photos.length} photos
              </small>
            </article>
            <article className="panel">
              <span className="muted">Latest leaf count</span>
              <h2>{latest?.leaf_count ?? "Not counted"}</h2>
              <small>Use the same measuring method each time.</small>
            </article>
          </div>
          <section className="panel growth-chart">
            <h2>{current?.name} · Height over time</h2>
            <p className="muted">
              Recorded observations, in centimetres. Missing dates are not
              estimated.
            </p>
            {entries.length >= 4 ? (
              <HeightChart entries={entries} />
            ) : (
              <p className="info-note">
                Add at least four measurements to see a trend chart. Your exact
                measurements are listed below.
              </p>
            )}
            <details>
              <summary>View exact measurements ({entries.length})</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Height (cm)</th>
                      <th>Leaves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((g) => (
                      <tr key={g.id}>
                        <td>{g.recorded_on}</td>
                        <td>{g.height_cm}</td>
                        <td>{g.leaf_count ?? "Not recorded"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="panel growth-panel">
            <h2>🌿 Measurement timeline</h2>
            {entries.length ? (
              <div className="journal-list">
                {[...entries].reverse().map((g) => (
                  <article className="journal-row" key={g.id}>
                    <div>
                      <strong>
                        {formatDate(g.recorded_on, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </strong>
                      <p>
                        {g.height_cm} cm ·{" "}
                        {g.leaf_count === null
                          ? "Leaves not counted"
                          : `${g.leaf_count} leaves`}
                      </p>
                      {g.notes && (
                        <p className="muted preserve-lines">{g.notes}</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="row-actions">
                        <button
                          className="text-link"
                          aria-label={`Edit measurement ${g.recorded_on}`}
                          onClick={() => {
                            setError("");
                            setEdit(g);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-link danger-text"
                          aria-label={`Delete measurement ${g.recorded_on}`}
                          onClick={() =>
                            setRemove({ kind: "growth.delete", id: g.id })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="No measurements in this view">
                <p>Try another date range or add your first observation.</p>
              </Empty>
            )}
          </section>
          <section className="panel growth-panel">
            <h2>📷 Photo diary</h2>

            {photos.length ? (
              <div className="photo-grid">
                {photos.map((p: PlantPhoto) => (
                  <figure key={p.id}>
                    <a
                      href={p.display_image || p.image_url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open photo from ${p.taken_on}`}
                    >
                      <img
                        src={p.display_image || p.image_url || undefined}
                        alt={p.caption || `${current?.name} on ${p.taken_on}`}
                        loading="lazy"
                        width="600"
                        height="450"
                      />
                    </a>
                    <figcaption>
                      <strong>
                        {formatDate(p.taken_on, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </strong>
                      <p>{p.caption}</p>
                      {canEdit && (
                        <button
                          className="text-link danger-text"
                          onClick={() =>
                            setRemove({
                              kind: "photo.delete",
                              id: p.id,
                              path: p.image_path,
                            })
                          }
                        >
                          Delete photo
                        </button>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <Empty title="Make room for memories">
                <p>Add a dated photo to start your plant’s visual story.</p>
              </Empty>
            )}
          </section>
        </>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit measurement" : "Add measurement"}
          onClose={() => !busy && setEdit(null)}
        >
          <form className="journal-form" onSubmit={saveMeasurement}>
            <label className="field">
              Recorded on
              <input
                name="recorded_on"
                type="date"
                required
                defaultValue={edit.recorded_on ?? today}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Height (cm)
                <input
                  name="height_cm"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  required
                  defaultValue={edit.height_cm}
                />
              </label>
              <label className="field">
                Leaf count (optional)
                <input
                  name="leaf_count"
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  defaultValue={edit.leaf_count ?? ""}
                />
              </label>
            </div>
            <label className="field">
              Notes (optional)
              <textarea
                name="notes"
                rows={3}
                maxLength={4000}
                defaultValue={edit.notes}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                Save measurement
              </button>
            </div>
          </form>
        </Modal>
      )}
      {photo && (
        <Modal
          title="Add photo"
          onClose={() => !uploading && !busy && setPhoto(false)}
        >
          <form className="journal-form" onSubmit={savePhoto}>
            <label className="field">
              Taken on
              <input
                name="taken_on"
                type="date"
                required
                defaultValue={today}
              />
            </label>
            <label className="field">
              Photo upload
              <input
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
              <small>
                JPEG, PNG or WebP, up to 5 MiB. Uploading takes priority over
                the URL.
              </small>
            </label>
            <label className="field">
              Or HTTPS image URL
              <input name="image_url" type="url" placeholder="https://…" />
              <small>
                External image hosts can see image requests. Use uploads for
                private photos.
              </small>
            </label>
            <label className="field">
              Caption (optional)
              <textarea name="caption" maxLength={500} rows={2} />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={uploading || busy}
                onClick={() => setPhoto(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={uploading || busy}>
                {uploading ? "Uploading…" : "Save photo"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Delete this journal entry?"
          onClose={() => setRemove(null)}
        >
          <p>
            This permanently removes the selected entry, not your plant or its
            care history.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({ kind: remove.kind, payload: { id: remove.id } })
                ) {
                  if (remove.path && !demo) void removeUnusedImage(remove.path);
                  setRemove(null);
                }
              }}
            >
              Delete entry
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
// Application chart: actual elapsed days on x, zero-anchored height on y.
// Exact observations remain accessible in the adjacent HTML table.
function HeightChart({ entries }: { entries: GrowthRecord[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [w, setWidth] = useState(760);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.min(760, entry.contentRect.width))),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const h = 300,
    left = 56,
    right = 22,
    top = 25,
    bottom = 52;
  const times = entries.map((g) => Date.parse(g.recorded_on + "T12:00:00Z")),
    start = Math.min(...times),
    span = Math.max(86400000, Math.max(...times) - start),
    max = Math.max(1, ...entries.map((g) => g.height_cm)) * 1.15;
  const points = entries.map((g, i) => ({
    x: left + ((times[i] - start) / span) * (w - left - right),
    y: h - bottom - (g.height_cm / max) * (h - top - bottom),
    g,
  }));
  return (
    <div className="height-chart" ref={container}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Height observations, ${entries[0].recorded_on} to ${entries.at(-1)!.recorded_on}. Exact values in the table below.`}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const value = (max * i) / 4,
            y = h - bottom - (value / max) * (h - top - bottom);
          return (
            <g key={i}>
              <line x1={left} x2={w - right} y1={y} y2={y} stroke="#dce5d5" />
              <text
                x={left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#52634c"
              >
                {Number(value.toFixed(1))}
              </text>
            </g>
          );
        })}
        <text x="12" y="14" fill="#52634c" fontSize="12">
          cm
        </text>
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#034102"
          strokeWidth="3"
        />
        {points.map(({ x, y, g }) => (
          <g key={g.id}>
            <circle
              cx={x}
              cy={y}
              r="5"
              fill="#b6fe00"
              stroke="#034102"
              strokeWidth="2"
            >
              <title>{`${g.recorded_on}: ${g.height_cm} cm`}</title>
            </circle>
          </g>
        ))}
        {[points[0], points.at(-1)!].map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={h - 18}
            textAnchor={i ? "end" : "start"}
            fill="#52634c"
            fontSize="12"
          >
            {formatDate(p.g.recorded_on, {
              month: "short",
              day: "numeric",
              year: w < 500 ? undefined : "numeric",
            })}
          </text>
        ))}
      </svg>
    </div>
  );
}
