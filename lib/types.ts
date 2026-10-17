export type Activity = "Water" | "Fertilize" | "Prune" | "Repot" | "Custom";
export type Unit = "days" | "weeks" | "months";
export type TaskStatus = "Upcoming" | "Due Today" | "Overdue";
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  timezone: string;
  created_at: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Plant {
  id: string;
  user_id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  category_id: string | null;
  location: string;
  sunlight: "Full" | "Partial" | "Indirect" | "Low light";
  watering: string;
  fertilizing: string;
  description: string;
  notes: string;
  image_url: string | null;
  image_path: string | null;
  display_image?: string | null;
  environment?: "indoor" | "outdoor";
  added_on: string;
  archived_at: string | null;
}
export interface Schedule {
  id: string;
  user_id: string;
  plant_id: string;
  activity: Activity;
  custom_name: string;
  interval_count: number;
  interval_unit: Unit;
  start_date: string;
  next_due_date: string;
  end_date: string | null;
  notes: string;
  active: boolean;
  archived_at: string | null;
}
export interface History {
  id: string;
  user_id: string;
  plant_id: string;
  schedule_id: string;
  activity: string;
  due_date: string;
  action_date: string;
  status: "Completed" | "Skipped";
  notes: string;
  created_at: string;
}
export interface WorkspaceData {
  profile: Profile;
  categories: Category[];
  plants: Plant[];
  schedules: Schedule[];
  history: History[];
  users: Profile[];
  growth: GrowthRecord[];
  photos: PlantPhoto[];
  cursor?: string;
}
export type Mutation = {
  kind:
    | "plant.create"
    | "plant.save"
    | "plant.archive"
    | "plant.restore"
    | "growth.save"
    | "growth.delete"
    | "photo.save"
    | "photo.delete"
    | "schedule.save"
    | "schedule.archive"
    | "task.resolve"
    | "profile.save"
    | "category.save"
    | "category.delete";
  payload: Record<string, unknown>;
};
export type ActionResult = { ok: true } | { ok: false; error: string };
export const activityLabel = (s: Schedule) =>
  s.activity === "Custom" ? s.custom_name : s.activity;

export interface GrowthRecord {
  id: string;
  user_id: string;
  plant_id: string;
  recorded_on: string;
  height_cm: number;
  leaf_count: number | null;
  notes: string;
}
export interface PlantPhoto {
  id: string;
  user_id: string;
  plant_id: string;
  taken_on: string;
  caption: string;
  image_url: string | null;
  image_path: string | null;
  display_image?: string | null;
}
export const activityEmoji = (a: string) =>
  ({ Water: "💧", Fertilize: "🌻", Prune: "✂️", Repot: "🪴", Custom: "✨" })[
    a
  ] ?? "✨";
export const categoryEmoji = (name: string) =>
  ({
    Indoor: "🏡",
    Outdoor: "🌳",
    Flowering: "🌸",
    Succulents: "🌵",
    Herbs: "🌿",
    Vegetables: "🥕",
    Decorative: "🍃",
    Other: "🪴",
  })[name] ?? "🌱";
