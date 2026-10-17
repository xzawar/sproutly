import { addDays, addInterval, nextOccurrence, todayIn } from "./dates";
import {
  activityLabel,
  type Mutation,
  type WorkspaceData,
  type Plant,
  type Schedule,
  type History,
} from "./types";
import {
  categorySchema,
  growthSchema,
  photoSchema,
  plantSchema,
  plantCreateSchema,
  profileSchema,
  resolveSchema,
  scheduleSchema,
} from "./validation";
export const DEMO_KEY = "sproutly-demo-v1";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function createDemo(): WorkspaceData {
  const today = todayIn("Asia/Karachi");
  const user = id(1);
  const categories = [
    "Indoor",
    "Outdoor",
    "Flowering",
    "Succulents",
    "Herbs",
    "Vegetables",
    "Decorative",
    "Other",
  ].map((name, i) => ({ id: id(10 + i), name }));
  const plants: Plant[] = [
    {
      name: "Monstera",
      common_name: "Swiss cheese plant",
      scientific_name: "Monstera deliciosa",
      location: "Living room",
      sunlight: "Indirect",
      watering: "Let the top 5 cm of soil dry before watering.",
      fertilizing: "Feed monthly in the growing season.",
      category_id: categories[0].id,
      image_url: null,
      display_image: "/monstera.webp",
    },
    {
      name: "Snake plant",
      common_name: "Mother-in-law’s tongue",
      scientific_name: "Dracaena trifasciata",
      location: "Bedroom",
      sunlight: "Low light",
      watering: "Let soil dry fully between waterings.",
      fertilizing: "Feed lightly during spring.",
      category_id: categories[0].id,
      image_url: null,
    },
    {
      name: "Peace lily",
      common_name: "Peace lily",
      scientific_name: "Spathiphyllum",
      location: "Home office",
      sunlight: "Indirect",
      watering: "Check soil moisture before watering.",
      fertilizing: "Use diluted fertilizer in the growing season.",
      category_id: categories[2].id,
      image_url: null,
    },
    {
      name: "Aloe vera",
      common_name: "Aloe",
      scientific_name: "Aloe vera",
      location: "Kitchen",
      sunlight: "Partial",
      watering: "Allow the soil to dry thoroughly.",
      fertilizing: "Feed sparingly.",
      category_id: categories[3].id,
      image_url: null,
    },
    {
      name: "Basil",
      common_name: "Sweet basil",
      scientific_name: "Ocimum basilicum",
      location: "Balcony",
      sunlight: "Full",
      watering: "Check the soil daily in warm weather.",
      fertilizing: "Feed according to the product label.",
      category_id: categories[4].id,
      image_url: null,
    },
  ].map(
    (p, i) =>
      ({
        ...p,
        id: id(30 + i),
        user_id: user,
        image_path: null,
        description: "",
        notes:
          "Demo care notes are examples, not professional plant-care advice.",
        environment: i === 4 ? "outdoor" : "indoor",
        added_on: addDays(today, -30 - i * 3),
        archived_at: null,
      }) as Plant,
  );
  const specs = [
    { p: 0, a: "Water", d: 0, c: 7, u: "days" },
    { p: 2, a: "Water", d: 0, c: 5, u: "days" },
    { p: 4, a: "Water", d: -2, c: 2, u: "days" },
    { p: 1, a: "Water", d: 3, c: 10, u: "days" },
    { p: 3, a: "Water", d: 5, c: 14, u: "days" },
    { p: 0, a: "Fertilize", d: 2, c: 30, u: "days" },
    { p: 4, a: "Prune", d: 6, c: 14, u: "days" },
  ] as const;
  const schedules: Schedule[] = specs.map((x, i) => ({
    id: id(50 + i),
    user_id: user,
    plant_id: plants[x.p].id,
    activity: x.a,
    custom_name: "",
    interval_count: x.c,
    interval_unit: x.u,
    start_date: addDays(today, -30),
    next_due_date: addDays(today, x.d),
    end_date: null,
    notes: "",
    active: true,
    archived_at: null,
  }));
  const history: History[] = [0, 1, 2].map((n) => ({
    id: id(80 + n),
    user_id: user,
    plant_id: schedules[n].plant_id,
    schedule_id: schedules[n].id,
    activity: schedules[n].activity,
    due_date: addDays(today, -7 - n),
    action_date: addDays(today, -7 - n),
    status: "Completed",
    notes: "",
    created_at: new Date(`${addDays(today, -7 - n)}T10:00:00Z`).toISOString(),
  }));
  const profile = {
    id: user,
    name: "Alex Morgan",
    email: "alex@example.test",
    role: "admin" as const,
    status: "active" as const,
    timezone: "Asia/Karachi",
    created_at: new Date().toISOString(),
  };
  return {
    profile,
    categories,
    plants,
    schedules,
    history,
    growth: [0, 1, 2, 3].map((i) => ({
      id: id(100 + i),
      user_id: user,
      plant_id: plants[0].id,
      recorded_on: addDays(today, -42 + i * 14),
      height_cm: 42 + i * 4,
      leaf_count: 8 + i,
      notes: "Illustrative demo measurement",
    })),
    photos: [
      {
        id: id(110),
        user_id: user,
        plant_id: plants[0].id,
        taken_on: today,
        caption: "A new leaf, a little more life.",
        image_url: null,
        image_path: null,
        display_image: "/monstera.webp",
      },
    ],
    users: [
      profile,
      {
        ...profile,
        id: id(2),
        name: "Sam Rivera",
        email: "sam@example.test",
        role: "user",
      },
    ],
  };
}
// Isolated browser-only sample. Never used for production authorization or persisted to Supabase.
export function demoMutation(data: WorkspaceData, m: Mutation): WorkspaceData {
  const d = structuredClone(data);
  const p = m.payload;
  const today = todayIn(d.profile.timezone);
  switch (m.kind) {
    case "plant.restore": {
      const plant = d.plants.find((x) => x.id === p.id);
      if (!plant) throw Error("Plant unavailable");
      plant.archived_at = null;
      const ids = Array.isArray(p.schedule_ids) ? p.schedule_ids : [];
      for (const s of d.schedules.filter(
        (s) => s.plant_id === plant.id && ids.includes(s.id),
      )) {
        const next = addInterval(today, s.interval_count, s.interval_unit);
        if (s.end_date && next > s.end_date)
          throw Error("An ended routine cannot be resumed. Edit it first.");
        s.archived_at = null;
        s.active = true;
        s.next_due_date = next;
      }
      break;
    }
    case "growth.save": {
      const v = growthSchema.parse(p);
      if (!d.plants.some((x) => x.id === v.plant_id && !x.archived_at))
        throw Error("Choose an active plant");
      const row = {
        ...v,
        id: v.id ?? crypto.randomUUID(),
        user_id: d.profile.id,
      };
      d.growth = [...d.growth.filter((x) => x.id !== row.id), row];
      break;
    }
    case "growth.delete":
      d.growth = d.growth.filter((x) => x.id !== p.id);
      break;
    case "photo.save": {
      const v = photoSchema.parse(p);
      if (!d.plants.some((x) => x.id === v.plant_id && !x.archived_at))
        throw Error("Choose an active plant");
      d.photos.push({
        ...v,
        id: crypto.randomUUID(),
        user_id: d.profile.id,
        display_image: v.image_url,
      });
      break;
    }
    case "photo.delete":
      d.photos = d.photos.filter((x) => x.id !== p.id);
      break;
    case "plant.create": {
      const { plant, routines } = plantCreateSchema.parse(p);
      const id = crypto.randomUUID();
      d.plants.push({
        ...plant,
        id,
        user_id: d.profile.id,
        archived_at: null,
        display_image: plant.image_url,
      });
      d.schedules.push(
        ...routines.map((r) => ({
          id: crypto.randomUUID(),
          user_id: d.profile.id,
          plant_id: id,
          activity: r.activity,
          custom_name: "",
          interval_count: r.interval_count,
          interval_unit: "days" as const,
          start_date: r.first_due_date,
          next_due_date: r.first_due_date,
          end_date: null,
          notes: "",
          active: true,
          archived_at: null,
        })),
      );
      break;
    }
    case "plant.save": {
      const v = plantSchema.parse(p);
      if (v.id) {
        const i = d.plants.findIndex((x) => x.id === v.id);
        if (i < 0) throw Error("Plant unavailable");
        d.plants[i] = {
          ...d.plants[i],
          ...v,
          display_image:
            v.image_url ?? (v.image_path ? d.plants[i].display_image : null),
        };
      } else
        d.plants.push({
          ...v,
          id: crypto.randomUUID(),
          user_id: d.profile.id,
          archived_at: null,
          display_image: v.image_url,
        });
      break;
    }
    case "plant.archive": {
      const plant = d.plants.find((x) => x.id === p.id);
      if (!plant) throw Error("Plant unavailable");
      plant.archived_at = new Date().toISOString();
      d.schedules
        .filter((s) => s.plant_id === p.id)
        .forEach((s) => {
          s.active = false;
          s.archived_at = new Date().toISOString();
        });
      break;
    }
    case "schedule.save": {
      const v = scheduleSchema.parse(p);
      if (v.id) {
        const i = d.schedules.findIndex((x) => x.id === v.id);
        if (i < 0) throw Error("Schedule unavailable");
        d.schedules[i] = { ...d.schedules[i], ...v, active: true };
      } else
        d.schedules.push({
          ...v,
          id: crypto.randomUUID(),
          user_id: d.profile.id,
          active: true,
          archived_at: null,
        });
      break;
    }
    case "schedule.archive": {
      const s = d.schedules.find((x) => x.id === p.id);
      if (!s) throw Error("Schedule unavailable");
      s.active = false;
      s.archived_at = new Date().toISOString();
      break;
    }
    case "task.resolve": {
      const v = resolveSchema.parse(p);
      const s = d.schedules.find((x) => x.id === v.id);
      if (!s?.active || s.archived_at || s.next_due_date !== v.expected_due)
        throw Error("Task already changed. Refresh and try again.");
      if (s.next_due_date > today) throw Error("This task is not due yet");
      const next = nextOccurrence(
        today,
        s.interval_count,
        s.interval_unit,
        s.end_date,
      );
      d.history.unshift({
        id: crypto.randomUUID(),
        user_id: d.profile.id,
        plant_id: s.plant_id,
        schedule_id: s.id,
        activity: activityLabel(s),
        due_date: s.next_due_date,
        action_date: today,
        status: v.status,
        notes: v.notes,
        created_at: new Date().toISOString(),
      });
      s.next_due_date = next.date;
      s.active = next.active;
      break;
    }
    case "profile.save": {
      Object.assign(d.profile, profileSchema.parse(p));
      d.users = d.users.map((u) => (u.id === d.profile.id ? d.profile : u));
      break;
    }
    case "category.save": {
      const v = categorySchema.parse(p);
      if (
        d.categories.some(
          (c) => c.id !== v.id && c.name.toLowerCase() === v.name.toLowerCase(),
        )
      )
        throw Error("That category already exists");
      if (v.id)
        d.categories = d.categories.map((c) =>
          c.id === v.id ? { id: c.id, name: v.name } : c,
        );
      else d.categories.push({ id: crypto.randomUUID(), name: v.name });
      break;
    }
    case "category.delete": {
      if (d.plants.some((x) => x.category_id === p.id))
        throw Error(
          "This category is in use. Reassign plants first, including archived plants.",
        );
      d.categories = d.categories.filter((c) => c.id !== p.id);
      break;
    }
  }
  return d;
}
