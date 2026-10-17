import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (token_hash && (type === "signup" || type === "recovery")) {
    const db = await supabaseServer();
    const { error } = await db.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (!error)
      return NextResponse.redirect(
        new URL(
          type === "recovery" ? "/reset-password" : "/dashboard",
          request.url,
        ),
      );
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=Confirmation%20link%20is%20invalid%20or%20expired.",
      request.url,
    ),
  );
}
