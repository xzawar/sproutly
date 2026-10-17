"use server";
import { createPlantWithRoutines } from "@/lib/plant-create";
import { withUser } from "@/lib/server/prisma";
import { saveRow } from "@/lib/server/repository";
import { redirect } from "next/navigation";
import { supabaseServer, isConfigured } from "@/lib/supabase/server";
import {
  authSchema,
  growthSchema,
  photoSchema,
  restoreSchema,
  categorySchema,
  idSchema,
  plantSchema,
  plantCreateSchema,
  profileSchema,
  resolveSchema,
  scheduleSchema,
} from "@/lib/validation";
import type { ActionResult, Mutation } from "@/lib/types";

export async function mutate(input: Mutation): Promise<ActionResult> {
  try {
    await withUser(async (tx, uid) => {
      const p = input.payload;
      const checkPath = (path: unknown) => {
        if (path && (typeof path !== "string" || !path.startsWith(uid + "/")))
          throw Error("Invalid image owner");
      };
      switch (input.kind) {
        case "plant.create": {
          const v = plantCreateSchema.parse(p);
          checkPath(v.plant.image_path);
          await createPlantWithRoutines(v, (table, row) =>
            saveRow(tx, table, row, uid),
          );
          break;
        }
        case "plant.save": {
          const v = plantSchema.parse(p);
          checkPath(v.image_path);
          if (v.id) {
            const existing = await tx.plant.findFirst({
              where: { id: v.id, user_id: uid, archived_at: null },
            });
            if (!existing) throw Error("Plant unavailable");
          }
          await saveRow(tx, "plants", v, uid);
          break;
        }
        case "plant.archive": {
          const { id } = idSchema.parse(p);
          if (
            !(
              await tx.plant.updateMany({
                where: { id, user_id: uid, archived_at: null },
                data: { archived_at: new Date() },
              })
            ).count
          )
            throw Error("Plant unavailable");
          break;
        }
        case "plant.restore": {
          const { id, schedule_ids } = restoreSchema.parse(p);
          await tx.$queryRaw`SELECT public.restore_plant(${id}::uuid,${schedule_ids}::uuid[])`;
          break;
        }
        case "schedule.save": {
          const v = scheduleSchema.parse(p);
          if (v.interval_unit !== "days")
            throw Error("Use an interval in days");
          if (
            v.id &&
            !(await tx.careSchedule.findFirst({
              where: { id: v.id, user_id: uid, archived_at: null },
            }))
          )
            throw Error("Routine unavailable");
          await saveRow(tx, "care_schedules", { ...v, active: true }, uid);
          break;
        }
        case "schedule.archive": {
          const { id } = idSchema.parse(p);
          if (
            !(
              await tx.careSchedule.updateMany({
                where: { id, user_id: uid },
                data: { active: false, archived_at: new Date() },
              })
            ).count
          )
            throw Error("Routine unavailable");
          break;
        }
        case "task.resolve": {
          const v = resolveSchema.parse(p);
          await tx.$queryRaw`SELECT public.resolve_care_task(${v.id}::uuid,${v.expected_due}::date,${v.status}::text,${v.notes}::text)`;
          break;
        }
        case "profile.save": {
          const v = profileSchema.parse(p);
          await tx.profile.update({ where: { id: uid }, data: v });
          break;
        }
        case "category.save": {
          const v = categorySchema.parse(p);
          await saveRow(tx, "categories", v);
          break;
        }
        case "category.delete": {
          const { id } = idSchema.parse(p);
          await tx.category.delete({ where: { id } });
          break;
        }
        case "growth.save": {
          const v = growthSchema.parse(p);
          await saveRow(tx, "growth_records", v, uid);
          break;
        }
        case "growth.delete": {
          const { id } = idSchema.parse(p);
          await tx.growthRecord.deleteMany({ where: { id, user_id: uid } });
          break;
        }
        case "photo.save": {
          const v = photoSchema.parse(p);
          checkPath(v.image_path);
          await saveRow(tx, "plant_photos", v, uid);
          break;
        }
        case "photo.delete": {
          const { id } = idSchema.parse(p);
          await tx.plantPhoto.deleteMany({ where: { id, user_id: uid } });
          break;
        }
        default:
          throw Error("Unknown operation");
      }
    });
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "issues" in e)
      return {
        ok: false,
        error:
          (e as { issues: { message: string }[] }).issues[0]?.message ??
          "Check your input",
      };
    const msg = e instanceof Error ? e.message : "";
    if (/23503|foreign key/i.test(msg))
      return {
        ok: false,
        error:
          "This item is in use. Reassign plants before deleting a category.",
      };
    if (/23505|unique constraint/i.test(msg))
      return {
        ok: false,
        error: "This category or occurrence already exists.",
      };
    if (
      !/prisma|Invalid |database|query|invocation/i.test(msg) &&
      msg.length < 180
    )
      return { ok: false, error: msg || "Unable to save" };
    return {
      ok: false,
      error:
        "Unable to save. Check your session, permissions and database setup.",
    };
  }
}
export async function authenticate(
  mode: "login" | "register",
  payload: { email: string; password: string; name?: string },
): Promise<ActionResult> {
  if (!isConfigured())
    return {
      ok: false,
      error: "Connect Supabase first, or explore the local demo below.",
    };
  const parsed = authSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (mode === "register" && !parsed.data.name)
    return { ok: false, error: "Please enter your name." };
  const db = await supabaseServer();
  if (mode === "register") {
    const { error } = await db.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { name: parsed.data.name } },
    });
    if (error)
      return {
        ok: false,
        error: "Unable to register. Try another email or check your password.",
      };
    return { ok: true };
  }
  const { error } = await db.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: "Email or password is incorrect." };
  redirect("/dashboard");
}
export async function logout() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/login");
}
export async function uploadPlantImage(
  form: FormData,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const file = form.get("image");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    )
      return { ok: false, error: "Choose an image smaller than 5 MiB." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png =
      bytes[0] === 0x89 &&
      String.fromCharCode(...bytes.slice(1, 4)) === "PNG" &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10;
    const webp =
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const type = jpeg
      ? "image/jpeg"
      : png
        ? "image/png"
        : webp
          ? "image/webp"
          : null;
    if (!type || type !== file.type)
      return { ok: false, error: "Use a valid JPEG, PNG or WebP image." };
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Please log in again." };
    const path = `${user.id}/${crypto.randomUUID()}.${jpeg ? "jpg" : png ? "png" : "webp"}`;
    const { error } = await db.storage
      .from("plant-images")
      .upload(path, bytes, { contentType: type, upsert: false });
    return error
      ? {
          ok: false,
          error: "Upload failed. Check Storage setup and try again.",
        }
      : { ok: true, path };
  } catch {
    return {
      ok: false,
      error: "Unable to upload the image. Please try again.",
    };
  }
}
export async function removeUnusedImage(path: string): Promise<void> {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !path.startsWith(`${user.id}/`)) return;
  const { data, error } = await db
    .from("plants")
    .select("id")
    .eq("user_id", user.id)
    .eq("image_path", path)
    .limit(1);
  const photos = await db
    .from("plant_photos")
    .select("id")
    .eq("user_id", user.id)
    .eq("image_path", path)
    .limit(1);
  if (
    !error &&
    data?.length === 0 &&
    !photos.error &&
    photos.data?.length === 0
  )
    await db.storage.from("plant-images").remove([path]);
}
export async function requestPasswordReset(
  email: string,
): Promise<ActionResult> {
  if (!isConfigured())
    return { ok: false, error: "Connect Supabase to send recovery emails." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return { ok: false, error: "Enter a valid email address." };
  const db = await supabaseServer();
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error)
    return {
      ok: false,
      error: "Recovery is temporarily unavailable. Try again later.",
    };
  return { ok: true };
}
export async function updatePassword(password: string): Promise<ActionResult> {
  const valid = authSchema.shape.password.safeParse(password);
  if (!valid.success)
    return { ok: false, error: valid.error.issues[0].message };
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return {
      ok: false,
      error: "Open a valid recovery link from your email first.",
    };
  const { error } = await db.auth.updateUser({ password });
  return error
    ? {
        ok: false,
        error: "Could not update your password. Request a new recovery link.",
      }
    : { ok: true };
}
