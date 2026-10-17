import { AuthForm } from "@/components/auth-form";
import { isConfigured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <AuthForm mode="login" configured={isConfigured()} error={error} />;
}
