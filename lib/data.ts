import "server-only";
import type { WorkspaceData } from "./types";
import { redirect } from "next/navigation";
import { isConfigured } from "./supabase/server";
import { withUser } from "./server/prisma";
import { rows } from "./server/repository";
export async function loadWorkspace(): Promise<WorkspaceData> {
  if (!isConfigured()) redirect("/login");
  try {
    return (await withUser(async (tx, id) => ({
      profile: (await rows(tx, "profiles", [id]))[0],
      plants: [],
      schedules: [],
      history: [],
      categories: [],
      users: [],
      growth: [],
      photos: [],
    }))) as unknown as import("./types").WorkspaceData;
} catch (error) {
  console.error("Garden load failed:", error);

  return redirect(
    "/login?error=Unable%20to%20open%20garden.%20Check%20your%20session%20and%20database%20setup.",
  );
}
}
