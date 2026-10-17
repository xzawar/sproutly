"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { useGarden } from "./garden-provider";
import { PageHeading, Empty } from "./ui";
import { scheduleSchema } from "@/lib/validation";
import type { Schedule } from "@/lib/types";
export function ScheduleForm({
  schedule,
  plantId,
  initialActivity = "Water",
}: {
  schedule?: Schedule;
  plantId?: string;
  initialActivity?: string;
}) {
  const { data, demo, today, run, busy } = useGarden();
  const base = demo ? "/demo" : "";
  const router = useRouter();
  const [activity, setActivity] = useState(
    schedule?.activity ??
      (["Water", "Fertilize", "Prune", "Repot", "Custom"].includes(
        initialActivity,
      )
        ? (initialActivity as Schedule["activity"])
        : "Water"),
  );
  const [days, setDays] = useState(
    schedule
      ? schedule.interval_count *
          (schedule.interval_unit === "weeks"
            ? 7
            : schedule.interval_unit === "months"
              ? 30
              : 1)
      : 7,
  );
  const [error, setError] = useState("");
  const plants = data.plants.filter((p) => !p.archived_at);
  const back = `${base}/plants/${schedule?.plant_id ?? plantId ?? ""}`;
  if (!plants.length)
    return (
      <Empty title="Start with a plant">
        <Link className="button primary" href={`${base}/plants/new`}>
          Add your first plant
        </Link>
      </Empty>
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const v = {
      ...(schedule ? { id: schedule.id } : {}),
      plant_id: get("plant_id"),
      activity: get("activity"),
      custom_name: get("custom_name"),
      interval_count: days,
      interval_unit: "days",
      start_date: get("start_date"),
      next_due_date: get("next_due_date"),
      end_date: get("end_date") || null,
      notes: get("notes"),
    };
    const p = scheduleSchema.safeParse(v);
    if (!p.success) {
      setError(p.error.issues[0].message);
      return;
    }
    if (await run({ kind: "schedule.save", payload: p.data }))
      router.push(`${base}/plants/${p.data.plant_id}`);
  }
  return (
    <>
      <Link className="back-link" href={back}>
        <ArrowLeft size={16} /> Back to plant
      </Link>
      <PageHeading title={schedule ? "Edit care schedule" : "Add routine"} />
      <form className="editor-form" onSubmit={submit}>
        <section className="panel form-section">
          <h2>Build your routine</h2>
          <div className="form-grid">
            <label className="field">
              Plant
              <select
                required
                name="plant_id"
                defaultValue={schedule?.plant_id ?? plantId ?? plants[0].id}
              >
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Care activity
              <select
                name="activity"
                value={activity}
                onChange={(e) =>
                  setActivity(e.target.value as Schedule["activity"])
                }
              >
                {["Water", "Fertilize", "Prune", "Repot", "Custom"].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            {activity === "Custom" && (
              <label className="field full">
                Custom task name
                <input
                  name="custom_name"
                  required
                  maxLength={100}
                  defaultValue={schedule?.custom_name}
                  placeholder="e.g. Rotate pot or check for pests"
                />
              </label>
            )}
            <label className="field full">
              Repeat every N days
              <input
                name="interval_count"
                type="number"
                min={1}
                max={3650}
                step={1}
                required
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <span className="hint">
                {activity} every{" "}
                {Number.isFinite(days) && days > 0 ? days : "…"} days. Notes
                below are optional—not your schedule.
              </span>
            </label>
            <label className="field">
              Start date
              <input
                type="date"
                name="start_date"
                required
                min="1900-01-01"
                max="9999-12-31"
                defaultValue={schedule?.start_date ?? today}
              />
            </label>
            <label className="field">
              Next due date
              <input
                type="date"
                name="next_due_date"
                required
                min="1900-01-01"
                max="9999-12-31"
                defaultValue={schedule?.next_due_date ?? today}
              />
            </label>
            <label className="field">
              <span>
                End date <span className="optional">optional</span>
              </span>
              <input
                type="date"
                name="end_date"
                min="1900-01-01"
                max="9999-12-31"
                defaultValue={schedule?.end_date ?? ""}
              />
            </label>
            <label className="field full">
              Notes
              <textarea
                name="notes"
                maxLength={4000}
                rows={3}
                defaultValue={schedule?.notes}
              />
            </label>
          </div>
          <div className="info-note">
            <Info size={18} />
            <p>
              Completing or skipping a due task starts the next interval from
              that day. All new routines repeat every N days. Future calendar
              dates are estimates.
            </p>
          </div>
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link href={back} className="button secondary">
            Cancel
          </Link>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : schedule ? "Save schedule" : "Create schedule"}
          </button>
        </div>
      </form>
    </>
  );
}
