import { plantCreateSchema, scheduleSchema } from "./validation";

/** Runs inside the caller's authenticated transaction (or isolated demo draft). */
export async function createPlantWithRoutines(
  payload: unknown,
  save: (
    table: "plants" | "care_schedules",
    row: Record<string, unknown>,
  ) => Promise<string>,
) {
  const { plant, routines } = plantCreateSchema.parse(payload);
  const id = await save("plants", plant);
  for (const routine of routines) {
    const schedule = scheduleSchema.parse({
      plant_id: id,
      activity: routine.activity,
      custom_name: "",
      interval_count: routine.interval_count,
      interval_unit: "days",
      start_date: routine.first_due_date,
      next_due_date: routine.first_due_date,
      end_date: null,
      notes: "",
    });
    await save("care_schedules", { ...schedule, active: true });
  }
  return id;
}
