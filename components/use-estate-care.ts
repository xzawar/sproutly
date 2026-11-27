"use client";
import { useCallback, useRef, useState } from "react";
import { useGarden } from "./garden-provider";
import type { CareAction } from "@/lib/estate/gardener";
import { savedPlacement } from "@/lib/home";
import {
  caredToday,
  dueRoutine,
  scheduledAction,
  validateVisit,
  type CareRequest,
  type TaskHandoff,
  type VisitResult,
} from "@/lib/estate/care";

export function useEstateCare() {
  const { data, today, busy, demo, run } = useGarden();
  const [visit, setVisit] = useState<CareRequest | null>(null);
  const [status, setStatus] = useState("");
  const [committing, setCommitting] = useState(false);
  const active = useRef<CareRequest | null>(null);
  const committed = useRef<Promise<boolean> | null>(null);
  const start = useCallback(
    (id: string, action: CareAction, task?: TaskHandoff, onFoot = false) => {
      if (active.current || busy) return false;
      const plant = data.plants.find((p) => p.id === id && !p.archived_at);
      if (!plant) return false;
      const placement = savedPlacement(plant);
      if (!placement) {
        setStatus("Choose a home location before starting care.");
        return false;
      }
      if (!demo && !navigator.onLine && action !== "Inspect") {
        setStatus("Reconnect to record care for this plant.");
        return false;
      }
      const routine = task
        ? data.schedules.find((s) => s.id === task.scheduleId)
        : dueRoutine(data.schedules, id, action, today);
      if (task && (!routine || scheduledAction(routine) !== action)) {
        setStatus("This task is no longer available.");
        return false;
      }
      if (
        !routine &&
        action !== "Inspect" &&
        caredToday(data.history, id, action, today)
      ) {
        setStatus(`${action} is already in today’s history.`);
        return false;
      }
      const request: CareRequest = {
        key: crypto.randomUUID(),
        plantId: id,
        onFoot,
        placement,
        action,
        day: today,
        scheduleId: routine?.id,
        due: task?.due ?? routine?.next_due_date,
        notes: task?.notes ?? "",
      };
      const error = validateVisit(data, request, today);
      if (error) {
        setStatus(error);
        return false;
      }
      active.current = request;
      committed.current = null;
      setCommitting(false);
      setVisit(request);
      setStatus(
        onFoot ? `Tending ${plant.name}.` : `Gardener visiting ${plant.name}.`,
      );
      return true;
    },
    [busy, data, demo, today],
  );

  const workComplete = useCallback(
    (key: string): Promise<boolean> => {
      const request = active.current;
      if (!request || request.key !== key) return Promise.resolve(false);
      if (committed.current) return committed.current;
      const error = validateVisit(data, request, today);
      if (error) {
        setStatus(error);
        return (committed.current = Promise.resolve(false));
      }
      setCommitting(true);
      if (request.action === "Inspect") {
        setStatus("Inspection complete.");
        return (committed.current = Promise.resolve(true));
      }
      setStatus("Saving care to your history…");
      committed.current = run(
        request.scheduleId
          ? {
              kind: "task.resolve",
              payload: {
                id: request.scheduleId,
                request_id: request.key,
                activity: request.action,
                plant_id: request.plantId,
                expected_due: request.due,
                expected_location: request.placement,
                status: "Completed",
                notes: request.notes,
              },
            }
          : {
              kind: "care.record",
              payload: {
                id: request.key,
                plant_id: request.plantId,
                activity: request.action,
                expected_location: request.placement,
              },
            },
      ).then((ok) => {
        if (active.current?.key === key)
          setStatus(
            ok
              ? request.onFoot
                ? "Care recorded."
                : "Care recorded. The gardener is heading back."
              : "Care could not be confirmed. Check your history before retrying.",
          );
        return ok;
      });
      return committed.current;
    },
    [data, run, today],
  );

  const finish = useCallback((key: string, outcome: VisitResult) => {
    if (active.current?.key !== key) return;
    const { action, onFoot } = active.current;
    active.current = null;
    committed.current = null;
    setVisit(null);
    setCommitting(false);
    if (outcome === "completed")
      setStatus(
        action === "Inspect"
          ? "Inspection complete. See the care estimate below."
          : `${action} recorded in care history.`,
      );
    if (outcome === "unreachable")
      setStatus(
        onFoot
          ? "Walk closer to the plant and try again."
          : "The gardener cannot reach this spot. Move the plant to a free spot and try again.",
      );
    if (outcome === "cancelled")
      setStatus("Visit cancelled before the care was recorded.");
  }, []);
  const cancel = useCallback(() => {
    if (active.current && !committed.current)
      finish(active.current.key, "cancelled");
  }, [finish]);
  return {
    visit,
    start,
    workComplete,
    finish,
    status,
    setStatus,
    committing,
    cancel,
  };
}
