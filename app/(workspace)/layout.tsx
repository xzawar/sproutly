import { Suspense } from "react";
import { Workspace } from "@/components/workspace";
import { loadWorkspace } from "@/lib/data";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout() {
  const data = await loadWorkspace();
  return (
    <Suspense fallback={<p className="loading-screen">Opening your garden…</p>}>
      <Workspace initialData={data} />
    </Suspense>
  );
}
