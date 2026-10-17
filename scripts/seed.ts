/** Explicit, server-only setup utility. Run ONLY against a disposable/demo project. */
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { createDemo } from "../lib/demo";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
async function seed() {
  if (process.env.SEED_ALLOW_DEMO_ACCOUNTS !== "true")
    throw Error(
      "Set SEED_ALLOW_DEMO_ACCOUNTS=true only for a disposable demo project.",
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error("Missing Supabase URL or service role key.");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const create = async (role: "user" | "admin") => {
    const prefix = role === "admin" ? "DEMO_ADMIN" : "DEMO_USER";
    const email = process.env[`${prefix}_EMAIL`],
      password = process.env[`${prefix}_PASSWORD`];
    if (!email || !password || password.length < 12)
      throw Error(
        `Set ${prefix}_EMAIL and a unique ${prefix}_PASSWORD (12+ characters).`,
      );
    // Refuse existing addresses rather than silently elevating or resetting real accounts.
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: role === "admin" ? "Demo Admin" : "Demo Gardener",
      },
    });
    if (error || !data.user)
      throw Error(
        `Cannot create demo ${role}: ${error?.message}. Use unused demo email addresses.`,
      );
    const { error: profileError } = await db
      .from("profiles")
      .update({ role, timezone: "Asia/Karachi" })
      .eq("id", data.user.id);
    if (profileError) throw profileError;
    console.log(`Created demo ${role}: ${email}`);
    return data.user;
  };
  const user = await create("user");
  await create("admin");
  const { data: categories, error: categoryError } = await db
    .from("categories")
    .select("id,name");
  if (categoryError) throw categoryError;
  const sample = createDemo();
  const ids = new Map<string, string>();
  for (const p of sample.plants) {
    const { id: oldId, display_image: _display, user_id: _owner, ...row } = p;
    void _display;
    void _owner;
    const category = sample.categories.find(
      (c) => c.id === p.category_id,
    )?.name;
    const { data, error } = await db
      .from("plants")
      .insert({
        ...row,
        user_id: user.id,
        category_id: categories.find((c) => c.name === category)?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.set(oldId, data.id);
  }
  for (const s of sample.schedules) {
    const { id: _id, user_id: _owner, ...row } = s;
    void _id;
    void _owner;
    const { error } = await db
      .from("care_schedules")
      .insert({ ...row, user_id: user.id, plant_id: ids.get(s.plant_id) });
    if (error) throw error;
  }
  console.log(
    "Sample plants and schedules added. No passwords were logged. Remove the service role key from the app deployment environment.",
  );
}
seed().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  console.error(
    "The seed is not an all-or-nothing transaction: inspect/remove any partially created demo accounts before retrying.",
  );
  process.exitCode = 1;
});
