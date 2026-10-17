import { RecoveryForm } from "@/components/recovery-form";
import { isConfigured } from "@/lib/supabase/server";
export default function Page() {
  return <RecoveryForm configured={isConfigured()} reset={true} />;
}
