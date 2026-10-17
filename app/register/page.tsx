import { AuthForm } from "@/components/auth-form";
import { isConfigured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default function RegisterPage() {
  return <AuthForm mode="register" configured={isConfigured()} />;
}
