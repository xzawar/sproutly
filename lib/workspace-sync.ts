import type { WorkspaceData } from "./types";

const collections = [
  "plants",
  "schedules",
  "history",
  "categories",
  "users",
  "growth",
  "photos",
] as const;
export type Collection = (typeof collections)[number];
export type WorkspaceDelta = {
  cursor: string;
  hasMore?: boolean;
  profile: WorkspaceData["profile"];
  rows: Partial<{ [K in Collection]: WorkspaceData[K] }>;
  deleted: Partial<Record<Collection, string[]>>;
};

/** Drain a paged revision log before publishing the next workspace to the UI. */
export async function refreshWorkspace(
  current: WorkspaceData,
  read: (cursor?: string) => Promise<WorkspaceDelta | WorkspaceData>,
) {
  let next = current;
  for (;;) {
    const page = await read(next.cursor);
    if (page.profile.id !== current.profile.id)
      throw Error("This garden session changed. Reload to open your account.");
    if (!("rows" in page)) return page;
    if (page.hasMore && page.cursor === next.cursor)
      throw Error("The garden could not refresh.");
    next = { ...next, profile: page.profile, cursor: page.cursor };
    for (const key of collections) {
      if (key === "users" && page.profile.role !== "admin") {
        next.users = [];
        continue;
      }
      const rows = page.rows[key];
      const gone = page.deleted[key];
      if (!rows?.length && !gone?.length) continue;
      const replaced = new Set(gone);
      for (const value of rows ?? []) replaced.add(value.id);
      Object.assign(next, {
        [key]: [
          ...next[key].filter((x) => !replaced.has(x.id)),
          ...(rows ?? []),
        ],
      });
    }
    if (!page.hasMore) return next;
  }
}
