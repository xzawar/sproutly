import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return new Response(null, { status: 403 });
  const db = await supabaseServer();
  await db.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.headers.set("Clear-Site-Data", '"cache", "storage"');
  res.headers.set("Cache-Control", "no-store");
  return res;
}
