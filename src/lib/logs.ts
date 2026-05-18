import { supabase } from "@/integrations/supabase/clientRuntime";

export type LogCategory = "auth" | "ai" | "order" | "cart" | "scrape" | "admin" | "whatsapp";

export interface LogEntry {
  category: LogCategory;
  operation: string;
  status: "success" | "failed" | "info";
  userId?: string | null;
  userEmail?: string | null;
  metadata?: Record<string, unknown>;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export function logOperation(entry: LogEntry): void {
  (async () => {
    let uid = entry.userId;
    let email = entry.userEmail;
    if (uid === undefined) {
      const { data: { session } } = await supabase.auth.getSession();
      uid = session?.user?.id ?? null;
      email = session?.user?.email ?? null;
    }
    await supabase.from("app_logs").insert({
      category: entry.category,
      operation: entry.operation,
      status: entry.status,
      user_id: uid ?? null,
      user_email: email ?? null,
      metadata: (entry.metadata ?? {}) as never,
      error_message: entry.errorMessage ?? null,
      duration_ms: entry.durationMs ?? null,
    } as never);
  })().catch(() => {});
}
