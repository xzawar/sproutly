import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
import { supabaseServer } from "@/lib/supabase/server";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.prisma = prisma;
export type Tx = Prisma.TransactionClient;
/** Never query app data outside this transaction: impersonate the verified Auth UID.
 * SET LOCAL and transaction-local claims are reset automatically on pool release. */
export async function withUser<T>(
  work: (tx: Tx, userId: string) => Promise<T>,
): Promise<T> {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) throw Error("Please sign in again.");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");
      await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${user.id}, true), set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
      const profile = await tx.profile.findUnique({ where: { id: user.id } });
      if (!profile || profile.status !== "active")
        throw Error("Account unavailable.");
      return work(tx, user.id);
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
