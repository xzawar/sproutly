import { Suspense } from "react";
import { Workspace } from "@/components/workspace";
import { createDemo } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default function DemoLayout() {
  return (
    <Suspense fallback={<p className="loading-screen">Opening demo garden…</p>}>
      <Workspace initialData={createDemo()} demo />
    </Suspense>
  );
}
