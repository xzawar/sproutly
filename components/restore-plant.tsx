"use client";
import { useState } from "react";
import { useGarden } from "./garden-provider";
import { Modal } from "./ui";
import type { Plant } from "@/lib/types";
import { activityLabel } from "@/lib/types";
import { frequency, addInterval } from "@/lib/dates";
export function RestorePlant({ plant }: { plant: Plant }) {
  const { data, today, run, busy } = useGarden();
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const routines = data.schedules.filter(
    (s) => s.plant_id === plant.id && s.archived_at,
  );
  return (
    <>
      <button className="button primary" onClick={() => setOpen(true)}>
        ↩ Restore plant
      </button>
      {open && (
        <Modal
          title={`Welcome back, ${plant.name}.`}
          onClose={() => setOpen(false)}
        >
          <p className="muted">
            Restore this plant and choose routines to resume. Unselected
            routines stay stopped. History is preserved.
          </p>
          {routines.map((s) => {
            const n = addInterval(today, s.interval_count, s.interval_unit);
            return (
              <label className="restore-choice" key={s.id}>
                <input
                  aria-label={`Resume ${activityLabel(s)}`}
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  disabled={Boolean(s.end_date && n > s.end_date)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, s.id]
                        : selected.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>
                  <strong>
                    {activityLabel(s)} · {frequency(s)}
                  </strong>
                  <small>
                    {s.end_date && n > s.end_date
                      ? "End date passed; create a new routine."
                      : `Resume with next due ${n}`}
                  </small>
                </span>
              </label>
            );
          })}
          <div className="form-actions">
            <button className="button secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({
                    kind: "plant.restore",
                    payload: { id: plant.id, schedule_ids: selected },
                  })
                )
                  setOpen(false);
              }}
            >
              Restore plant & selected routines
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
