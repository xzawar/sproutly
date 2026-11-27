import type { History, Schedule } from "../types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const daysBetween = (start: string, end: string) =>
  (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY;

/** Calendar dates come from the user's time zone. Recovery uses the recorded event instant. */
export const defaultHealthRules = {
  minimumDaysToSevere: 3,
  maximumDaysToSevere: 12,
  severeAfterIntervals: 0.85,
  recoveryHours: 36,
  severeThreshold: 0.76,
};
export type HealthRules = typeof defaultHealthRules;
export type HealthState =
  "unknown" | "on-track" | "due" | "dry" | "stressed" | "recovering" | "logged";
const labels: Record<HealthState, string> = {
  unknown: "No watering data",
  "on-track": "On schedule",
  due: "Water due today",
  dry: "Needs water",
  stressed: "High water stress",
  recovering: "Recovering",
  logged: "Watering logged",
};
export interface PlantHealth {
  state: HealthState;
  label: string;
  source: "Care-based estimate";
  /** Normalized model controls, never sensor measurements or probabilities. */
  stress: number;
  dryness: number;
  lastWatered: string | null;
  nextWatering: string | null;
}
export const unknownHealth: PlantHealth = {
  state: "unknown",
  label: labels.unknown,
  source: "Care-based estimate",
  stress: 0,
  dryness: 0.4,
  lastWatered: null,
  nextWatering: null,
};
export interface HealthContext {
  today: string;
  schedules: Schedule[];
  history: History[];
  now?: number;
  rules?: HealthRules;
}

function intervalDays(schedule?: Schedule) {
  if (!schedule) return 7;
  const multiplier =
    schedule.interval_unit === "months"
      ? 30.4375
      : schedule.interval_unit === "weeks"
        ? 7
        : 1;
  return Math.max(1, schedule.interval_count * multiplier);
}
function overdueStress(daysLate: number, interval: number, rules: HealthRules) {
  if (daysLate < 0) return 0;
  const severeAfter = Math.max(
    rules.minimumDaysToSevere,
    Math.min(rules.maximumDaysToSevere, interval * rules.severeAfterIntervals),
  );
  return clamp(0.14 + (0.86 * daysLate) / Math.max(1, severeAfter));
}

/** For one plant. A skipped watering carries the missed due date forward until actual watering. */
export function estimateHealth(
  schedules: Schedule[],
  history: History[],
  today: string,
  now = Date.now(),
  rules = defaultHealthRules,
): PlantHealth {
  const waterSchedules = schedules.filter((s) => s.activity === "Water");
  const next = waterSchedules
    .filter((s) => s.active && !s.archived_at)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0];
  const waterHistory = history
    .filter(
      (h) => h.activity.toLowerCase() === "water" && h.action_date <= today,
    )
    .sort(
      (a, b) =>
        a.action_date.localeCompare(b.action_date) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  const intervals = new Map(waterSchedules.map((s) => [s.id, intervalDays(s)]));
  const recoveryWindow = Math.max(1, rules.recoveryHours) * HOUR;
  let lastWater: History | undefined;
  let missed: string | undefined;
  let recovery = 0;
  for (const event of waterHistory) {
    if (event.status === "Skipped") {
      if (
        (!lastWater || lastWater.action_date < event.due_date) &&
        (!missed || event.due_date < missed)
      )
        missed = event.due_date;
      continue;
    }
    const elapsed = Math.max(0, now - Date.parse(event.created_at));
    const oldDue = missed && missed < event.due_date ? missed : event.due_date;
    if (elapsed < recoveryWindow && oldDue < event.action_date) {
      const period =
        (event.schedule_id && intervals.get(event.schedule_id)) ||
        intervalDays(next);
      const peak = overdueStress(
        daysBetween(oldDue, event.action_date),
        period,
        rules,
      );
      const remaining = 1 - elapsed / recoveryWindow;
      // Subsequent on-time care cannot clear the recovery from an earlier late watering.
      recovery = Math.max(
        recovery,
        peak * remaining * remaining * (3 - 2 * remaining),
      );
    }
    lastWater = event;
    missed = undefined;
  }
  if (!lastWater && !next && !missed) return unknownHealth;
  const dueDate =
    missed && (!next || missed < next.next_due_date)
      ? missed
      : next?.next_due_date;
  const interval = intervalDays(
    next ?? waterSchedules.find((s) => s.id === lastWater?.schedule_id),
  );
  const late = dueDate ? daysBetween(dueDate, today) : -Infinity;
  const outstanding = overdueStress(late, interval, rules);
  const stress = Math.max(outstanding, recovery);
  const state: HealthState =
    recovery > Math.max(outstanding, 0.04)
      ? "recovering"
      : outstanding >= rules.severeThreshold
        ? "stressed"
        : late > 0
          ? "dry"
          : late === 0
            ? "due"
            : next
              ? "on-track"
              : "logged";
  const age = lastWater
    ? Math.max(0, daysBetween(lastWater.action_date, today))
    : null;
  // The soil responds immediately to a saved watering. The foliage recovers over time.
  const dryness =
    late >= 0
      ? clamp(0.65 + outstanding * 0.35)
      : age !== null
        ? next
          ? clamp(0.16 + (0.5 * age) / interval)
          : 0.16 + 0.24 * clamp(age / 2)
        : clamp(0.22 + 0.42 * (1 + late / interval));
  return {
    state,
    label: labels[state],
    source: "Care-based estimate",
    stress,
    dryness,
    lastWatered: lastWater?.action_date ?? null,
    nextWatering: next?.next_due_date ?? null,
  };
}

export function healthByPlant(
  context: HealthContext,
): Map<string, PlantHealth> {
  const groups = new Map<
    string,
    { schedules: Schedule[]; history: History[] }
  >();
  const group = (id: string) => {
    let g = groups.get(id);
    if (!g) {
      g = { schedules: [], history: [] };
      groups.set(id, g);
    }
    return g;
  };
  for (const schedule of context.schedules)
    if (schedule.activity === "Water")
      group(schedule.plant_id).schedules.push(schedule);
  for (const event of context.history)
    if (event.activity.toLowerCase() === "water")
      group(event.plant_id).history.push(event);
  const clock = context.now ?? Date.now();
  return new Map(
    Array.from(groups, ([id, g]) => [
      id,
      estimateHealth(
        g.schedules,
        g.history,
        context.today,
        clock,
        context.rules,
      ),
    ]),
  );
}
