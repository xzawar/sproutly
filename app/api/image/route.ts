import { supabaseServer } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  const path = new URL(request.url).searchParams.get("path");
  if (!user || !path?.startsWith(`${user.id}/`))
    return new Response(null, { status: 403 });
  const { data, error } = await db.storage.from("plant-images").download(path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
