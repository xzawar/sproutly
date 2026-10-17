"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, SkipForward } from "lucide-react";
import { useWeather } from "./weather";
import { rainExpected } from "@/lib/weather";
import { useGarden } from "./garden-provider";
import { ActivityIcon, Badge, Empty, Modal } from "./ui";
import { activityLabel, type Schedule } from "@/lib/types";
import { formatDate, frequency, taskStatus } from "@/lib/dates";
export function TaskList({
  schedules,
  compact = false,
}: {
  schedules: Schedule[];
  compact?: boolean;
}) {
  const { data, demo, today, busy, run } = useGarden();
  const { weather } = useWeather();
  const base = demo ? "/demo" : "";
  const [resolve, setResolve] = useState<{
    s: Schedule;
    status: "Completed" | "Skipped";
  } | null>(null);
  const [notes, setNotes] = useState("");
  if (!schedules.length)
    return (
      <Empty title="A little room to grow">
        <p>No tasks here. Add a care schedule to a plant to get started.</p>
        <Link className="text-link" href={`${base}/plants`}>
          Go to your plants <ChevronRight size={16} />
        </Link>
      </Empty>
    );
  return (
    <>
      <div className="task-list">
        {schedules.map((s) => {
          const p = data.plants.find((p) => p.id === s.plant_id);
          const status = taskStatus(s.next_due_date, today);
          return (
            <div className="task-row" key={s.id}>
              <ActivityIcon activity={s.activity} />
              <div className="task-primary">
                <Link
                  href={`${base}/plants/${s.plant_id}`}
                  className="task-name"
                >
                  {p?.name ?? "Archived plant"}
                </Link>
                <span className="muted">
                  {activityLabel(s)} · {compact ? p?.location : frequency(s)}
                </span>
              </div>
              <div className="task-date">
                <span>
                  {s.next_due_date === today
                    ? "Today"
                    : formatDate(s.next_due_date)}
                </span>
                <Badge status={status} />
              </div>
              {s.activity === "Water" &&
                p?.environment === "outdoor" &&
                s.next_due_date <= today &&
                rainExpected(weather, today) && (
                  <button
                    className="rain-suggestion"
                    onClick={() => {
                      setNotes("Skipped — rain");
                      setResolve({ s, status: "Skipped" });
                    }}
                  >
                    🌧️ Rain expected today · Skip for rain
                  </button>
                )}
              <div className="task-actions">
                <button
                  className="icon-button complete-button"
                  disabled={busy || s.next_due_date > today}
                  title={
                    s.next_due_date > today
                      ? "Available when due"
                      : "Complete task"
                  }
                  aria-label={`Complete ${activityLabel(s)} for ${p?.name}`}
                  onClick={() => {
                    setNotes("");
                    setResolve({ s, status: "Completed" });
                  }}
                >
                  <Check size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Skip ${activityLabel(s)} for ${p?.name}`}
                  title="Skip task"
                  disabled={busy || s.next_due_date > today}
                  onClick={() => {
                    setNotes("");
                    setResolve({ s, status: "Skipped" });
                  }}
                >
                  <SkipForward size={19} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {resolve && (
        <Modal
          title={
            resolve.status === "Completed"
              ? "Record plant care"
              : notes === "Skipped — rain"
                ? "Use rain instead? 🌧️"
                : "Skip this occurrence"
          }
          onClose={() => !busy && setResolve(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run({
                  kind: "task.resolve",
                  payload: {
                    id: resolve.s.id,
                    expected_due: resolve.s.next_due_date,
                    status: resolve.status,
                    notes,
                  },
                })
              )
                setResolve(null);
            }}
          >
            <p className="muted modal-copy">
              {activityLabel(resolve.s)} ·{" "}
              {data.plants.find((p) => p.id === resolve.s.plant_id)?.name}
              <br />
              The next date counts from today, {formatDate(today)}.
            </p>
            {notes === "Skipped — rain" && (
              <p className="info-note">
                Check that rain reaches this outdoor plant and the soil is
                moist. This records “Skipped — rain”, not completed watering.
              </p>
            )}
            <label className="field">
              <span>
                Care notes <span className="optional">optional</span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="Anything you’d like to remember?"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setResolve(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : resolve.status === "Completed"
                    ? "Mark completed"
                    : "Skip & reschedule"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
