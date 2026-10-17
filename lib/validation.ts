import { z } from "zod";
import { validDate } from "./dates";
const text = (n = 2000) => z.string().trim().max(n);
const uuid = z.uuid();
const date = z.string().refine(validDate, "Enter a valid date");
const nullableDate = date.nullable();
const imageUrl = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Use a valid HTTPS image URL")
  .nullable();
export const plantSchema = z
  .object({
    id: uuid.optional(),
    name: text(100).min(1),
    common_name: text(100),
    scientific_name: text(150),
    category_id: uuid.nullable(),
    location: text(100),
    sunlight: z.enum(["Full", "Partial", "Indirect", "Low light"]),
    watering: text(),
    fertilizing: text(),
    description: text(4000),
    notes: text(4000),
    image_url: imageUrl,
    image_path: text(300).nullable(),
    added_on: date,
    environment: z.enum(["indoor", "outdoor"]).default("indoor"),
  })
  .refine((p) => !(p.image_url && p.image_path), {
    message: "Choose an upload or an image URL, not both",
  });
// A single create request validates every routine before any rows are written.
export const plantCreateSchema = z.object({
  plant: plantSchema.refine(
    (p) => !p.id,
    "Use edit to update an existing plant",
  ),
  routines: z
    .array(
      z.object({
        activity: z.enum(["Water", "Fertilize"]),
        interval_count: z.number().int().min(1).max(3650),
        first_due_date: date,
      }),
    )
    .max(2)
    .refine(
      (r) => new Set(r.map((x) => x.activity)).size === r.length,
      "Choose each routine once",
    ),
});
export const scheduleSchema = z
  .object({
    id: uuid.optional(),
    plant_id: uuid,
    activity: z.enum(["Water", "Fertilize", "Prune", "Repot", "Custom"]),
    custom_name: text(100),
    interval_count: z.number().int().min(1).max(3650),
    interval_unit: z.enum(["days", "weeks", "months"]),
    start_date: date,
    next_due_date: date,
    end_date: nullableDate,
    notes: text(4000),
  })
  .superRefine((s, ctx) => {
    if (s.activity === "Custom" && !s.custom_name)
      ctx.addIssue({
        code: "custom",
        message: "Name your custom activity",
        path: ["custom_name"],
      });
    if (s.next_due_date < s.start_date)
      ctx.addIssue({
        code: "custom",
        message: "Next due date cannot precede start date",
        path: ["next_due_date"],
      });
    if (
      s.end_date &&
      (s.end_date < s.start_date || s.next_due_date > s.end_date)
    )
      ctx.addIssue({
        code: "custom",
        message: "End date must include the next due date",
        path: ["end_date"],
      });
  });
export const profileSchema = z.object({
  name: text(100).min(1),
  timezone: text(100).refine((t) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: t });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone"),
});
export const resolveSchema = z.object({
  id: uuid,
  expected_due: date,
  status: z.enum(["Completed", "Skipped"]),
  notes: text(4000),
});
export const categorySchema = z.object({
  id: uuid.optional(),
  name: text(80).min(1),
});
export const idSchema = z.object({ id: uuid });
export const authSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(6, "Use at least 6 characters").max(128),
  name: text(100).min(1).optional(),
});

export const growthSchema = z.object({
  id: uuid.optional(),
  plant_id: uuid,
  recorded_on: date,
  height_cm: z.number().min(0).max(100000),
  leaf_count: z.number().int().min(0).max(1000000).nullable(),
  notes: text(4000),
});
export const photoSchema = z
  .object({
    id: uuid.optional(),
    plant_id: uuid,
    taken_on: date,
    caption: text(500),
    image_url: imageUrl,
    image_path: text(300).nullable(),
  })
  .refine(
    (v) => Boolean(v.image_url) !== Boolean(v.image_path),
    "Choose an image URL or upload",
  );

export const restoreSchema = z.object({
  id: uuid,
  schedule_ids: z.array(uuid).max(100).default([]),
});
