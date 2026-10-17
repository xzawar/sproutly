import { snapshot, changes } from "@/lib/server/repository";
export async function GET(request: Request) {
  try {
    return Response.json(
      new URL(request.url).searchParams.has("cursor")
        ? await changes(new URL(request.url).searchParams.get("cursor")!)
        : await snapshot(),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Session or connection unavailable" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
