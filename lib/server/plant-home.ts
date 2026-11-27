import "server-only";
import type { Tx } from "./prisma";
import { backfillHome, HOME_LAYOUT_VERSION } from "../home-records";

const positionFields = {
  id: true,
  location: true,
  environment: true,
  archived_at: true,
  home_room: true,
  home_x: true,
  home_y: true,
  home_layout_version: true,
} as const;

export async function lockHomeOwner(tx: Tx, uid: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${uid}::text,991973))`;
}

export async function ownerPlants(
  tx: Tx,
  uid: string,
  includeArchivedId?: string,
) {
  // This call runs under Read Committed. A waiting allocator sees the previous allocator's writes.
  await lockHomeOwner(tx, uid);
  return tx.plant.findMany({
    where: {
      user_id: uid,
      OR: [
        { archived_at: null },
        ...(includeArchivedId ? [{ id: includeArchivedId }] : []),
      ],
    },
    select: positionFields,
  });
}

export async function prepareHome(tx: Tx, uid: string) {
  const pending = await tx.plant.findFirst({
    where: {
      user_id: uid,
      archived_at: null,
      home_layout_version: { lt: HOME_LAYOUT_VERSION },
    },
    select: { id: true },
  });
  if (!pending) return;
  const plants = await ownerPlants(tx, uid);
  const changes = backfillHome(plants);
  if (!changes.length) return;
  // Clear the old pins within the transaction before reseating, in case two records exchange slots.
  await tx.plant.updateMany({
    where: {
      user_id: uid,
      archived_at: null,
      home_room: { not: null },
      home_layout_version: { lt: HOME_LAYOUT_VERSION },
    },
    data: { home_room: null, home_x: null, home_y: null },
  });
  await tx.$executeRaw`UPDATE public.plants p SET home_room=v.home_room,home_x=v.home_x,home_y=v.home_y,home_layout_version=v.home_layout_version
    FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS v(id uuid,home_room text,home_x smallint,home_y smallint,home_layout_version smallint)
    WHERE p.id=v.id AND p.user_id=${uid}::uuid AND p.archived_at IS NULL`;
}
