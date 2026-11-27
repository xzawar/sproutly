import type { Schedule } from "./types";

export const homeActivities = ["Water", "Fertilize", "Prune", "Mist"] as const;
export type HomeActivity = (typeof homeActivities)[number];

export function homeCareActivity(
  schedule: Pick<Schedule, "activity" | "custom_name">,
): HomeActivity | null {
  if (schedule.activity === "Custom")
    return /^(mist|misting)$/i.test(schedule.custom_name.trim())
      ? "Mist"
      : null;
  return schedule.activity === "Repot" ? null : schedule.activity;
}
