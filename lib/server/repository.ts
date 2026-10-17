import "server-only";
import { Prisma } from "@prisma/client";
import { withUser, type Tx } from "./prisma";
import type { WorkspaceData } from "@/lib/types";
const entities = {
  plants: "plants",
  schedules: "care_schedules",
  history: "care_history",
  categories: "categories",
  users: "profiles",
  growth: "growth_records",
  photos: "plant_photos",
} as const;
export type Entity = keyof typeof entities;
export type Delta = {
  cursor: string;
  rows: Partial<Record<Entity, unknown[]>>;
  deleted: Partial<Record<Entity, string[]>>;
  profile: WorkspaceData["profile"];
};
export async function rows(tx: Tx, table: string, ids?: string[]) {
  if (!Object.values(entities).includes(table as (typeof entities)[Entity]))
    throw Error("Unknown entity");
  const where = ids ? Prisma.sql`WHERE id = ANY(${ids}::uuid[])` : Prisma.empty;
  const result = await tx.$queryRaw<{ row: Record<string, unknown> }[]>(
    Prisma.sql`SELECT to_jsonb(t) AS row FROM public.${Prisma.raw(table)} t ${where} ORDER BY id`,
  );
  return result.map(({ row }) => {
    if (row.image_path)
      row.display_image = `/api/image?path=${encodeURIComponent(String(row.image_path))}`;
    else if ("image_url" in row) row.display_image = row.image_url;
    return row;
  });
}
export async function snapshot(): Promise<WorkspaceData> {
  return withUser(async (tx, id) => {
    const [profile] = await rows(tx, "profiles", [id]);
    const pairs = await Promise.all(
      Object.entries(entities).map(async ([k, t]) => [
        k,
        k === "users" && profile.role !== "admin" ? [] : await rows(tx, t),
      ]),
    );
    const [rev] = await tx.$queryRaw<
      { cursor: string }[]
    >`SELECT coalesce(max(revision),0)::text AS cursor FROM public.sync_events`;
    return {
      ...Object.fromEntries(pairs),
      profile,
      cursor: rev.cursor,
    } as unknown as WorkspaceData;
  });
}
export async function changes(cursor: string): Promise<Delta> {
  if (!/^\d{1,19}$/.test(cursor)) throw Error("Invalid sync cursor");
  return withUser(async (tx, id) => {
    const [profile] = await rows(tx, "profiles", [id]);
    const events = await tx.$queryRaw<
      { entity: string; row_id: string; deleted: boolean; revision: string }[]
    >`SELECT entity,row_id,deleted,revision::text FROM public.sync_events WHERE revision > ${BigInt(cursor)} ORDER BY revision LIMIT 2000`;
    const result: Delta = {
      cursor: events.at(-1)?.revision ?? cursor,
      rows: {},
      deleted: {},
      profile: profile as unknown as WorkspaceData["profile"],
    };
    for (const [key, table] of Object.entries(entities)) {
      if (key === "users" && profile.role !== "admin") continue;
      const last = new Map(
        events.filter((e) => e.entity === table).map((e) => [e.row_id, e]),
      );
      const ids = [...last.values()]
        .filter((e) => !e.deleted)
        .map((e) => e.row_id);
      if (ids.length) result.rows[key as Entity] = await rows(tx, table, ids);
      const gone = [...last.values()]
        .filter((e) => e.deleted)
        .map((e) => e.row_id);
      if (gone.length) result.deleted[key as Entity] = gone;
    }
    return result;
  });
}
/** Schema-validated keys only; all table/column identifiers use a fixed allowlist. */
export async function saveRow(
  tx: Tx,
  table: string,
  v: Record<string, unknown>,
  owner?: string,
) {
  const allowed = [...Object.values(entities)];
  if (!allowed.includes(table as (typeof allowed)[number]))
    throw Error("Invalid entity");
  const id = v.id;
  const values = { ...v, ...(owner ? { user_id: owner } : {}) };
  const cols = Object.keys(values).filter((k) => k !== "id");
  if (cols.some((c) => !/^[a-z_]+$/.test(c))) throw Error("Invalid column");
  const t = Prisma.raw(`public.${table}`);
  const source = Prisma.sql`jsonb_populate_record(NULL::${t},${JSON.stringify(values)}::jsonb) AS v`;
  const selected = Prisma.join(cols.map((c) => Prisma.raw(`v.${c}`)));
  let changed: unknown[];
  if (id)
    changed = await tx.$queryRaw(
      Prisma.sql`UPDATE ${t} AS target SET ${Prisma.join(cols.map((c) => Prisma.sql`${Prisma.raw(c)}=v.${Prisma.raw(c)}`))} FROM ${source} WHERE target.id=${String(id)}::uuid ${owner ? Prisma.sql`AND target.user_id=${owner}::uuid` : Prisma.empty} RETURNING target.id`,
    );
  else
    changed = await tx.$queryRaw(
      Prisma.sql`INSERT INTO ${t} (${Prisma.join(cols.map((c) => Prisma.raw(c)))}) SELECT ${selected} FROM ${source} RETURNING id`,
    );
  if (!changed.length)
    throw Error("This item is unavailable or you do not have access.");
  return String((changed[0] as { id: string }).id);
}
