import { savedPlacement, type Placement } from "../home";
import { type History, type Schedule, type WorkspaceData } from "../types";
import { homeCareActivity as scheduledAction } from "../home-care";
export { scheduledAction };
import type { CareAction } from "./gardener";

export type CareVisit = { key: string; plantId: string; action: CareAction };
export type VisitResult = "completed" | "failed" | "unreachable" | "cancelled";
export type TaskHandoff = {
  plantId: string;
  scheduleId: string;
  due: string;
  notes: string;
  userId: string;
};
export type CareRequest = CareVisit & {
  onFoot?: boolean;
  placement: Placement;
  scheduleId?: string;
  due?: string;
  day: string;
  notes: string;
};

export function dueRoutine(
  schedules: Schedule[],
  plantId: string,
  action: CareAction,
  today: string,
) {
  return schedules
    .filter(
      (s) =>
        s.plant_id === plantId &&
        s.active &&
        !s.archived_at &&
        s.next_due_date <= today &&
        scheduledAction(s) === action,
    )
    .sort(
      (a, b) =>
        a.next_due_date.localeCompare(b.next_due_date) ||
        a.id.localeCompare(b.id),
    )[0];
}

export function caredToday(
  history: History[],
  plantId: string,
  action: CareAction,
  today: string,
) {
  return history.some(
    (h) =>
      h.plant_id === plantId &&
      h.action_date === today &&
      h.status === "Completed" &&
      (h.activity.toLowerCase() === action.toLowerCase() ||
        (action === "Mist" &&
          /^(mist|misting)( plant| leaves)?$/i.test(h.activity))),
  );
}

export function validateVisit(
  data: WorkspaceData,
  request: CareRequest,
  today: string,
): string | null {
  const plant = data.plants.find(
    (p) => p.id === request.plantId && !p.archived_at,
  );
  if (!plant) return "This plant is no longer in your collection.";
  const place = savedPlacement(plant);
  if (
    !place ||
    place.room !== request.placement.room ||
    place.x !== request.placement.x ||
    place.y !== request.placement.y
  )
    return "The plant has moved. Select it at its new location to start care.";
  if (request.action === "Inspect") return null;
  if (request.day !== today)
    return "The date has changed. Start a new visit for today.";
  if (request.scheduleId) {
    const schedule = data.schedules.find(
      (s) => s.id === request.scheduleId && s.plant_id === plant.id,
    );
    if (
      !schedule ||
      !schedule.active ||
      schedule.archived_at ||
      scheduledAction(schedule) !== request.action ||
      schedule.next_due_date !== request.due ||
      schedule.next_due_date > today
    )
      return "This care task has changed. Check its latest date before starting another visit.";
  }
  return null;
}

// The user's task confirmation is consumed once. A visit URL never replays a care action.
const handoffKey = "sproutly-gardener-handoff";
export function prepareHandoff(task: TaskHandoff): string {
  const token = crypto.randomUUID();
  try {
    sessionStorage.setItem(
      handoffKey,
      JSON.stringify({ ...task, token, time: Date.now() }),
    );
  } catch {
    return "";
  }
  return token;
}
export function takeHandoff(
  token: string,
  plantId: string,
  userId: string,
): TaskHandoff | null {
  if (!token) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(handoffKey) ?? "null");
    if (
      !value ||
      value.token !== token ||
      value.plantId !== plantId ||
      value.userId !== userId
    )
      return null;
    sessionStorage.removeItem(handoffKey);
    return Date.now() - value.time < 120_000 ? value : null;
  } catch {
    return null;
  }
}
