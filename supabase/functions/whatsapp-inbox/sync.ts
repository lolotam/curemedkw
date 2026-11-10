import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type EvolutionInboxClient, inboxIdentity, inboxMessage, InboxError } from "../_shared/evolution-inbox.ts";
import { isPlainObject } from "../_shared/evolution-pairing.ts";
import { inboxRpc } from "./storage.ts";
import { repairUnsupportedInboxContent } from "../_shared/whatsapp-inbox-content.ts";

export async function syncInbox(admin: SupabaseClient, provider: EvolutionInboxClient, actorId: string) {
  const run = await inboxRpc(admin, "wa_claim_inbox_sync", { p_actor_id: actorId });
  if (!isPlainObject(run) || !isPlainObject(run.cursor_json)) throw new InboxError("sync_unavailable", 503);
  const stage = run.cursor_json.stage;
  const page = Number(run.cursor_json.page ?? 1);
  let records: unknown[];
  let complete = false;
  let next = { stage, page };
  if (stage === "messages") {
    const response = await provider("messages", { page, offset: 100 });
    if (!isPlainObject(response) || !isPlainObject(response.messages) || !Array.isArray(response.messages.records)) {
      throw new InboxError("invalid_sync_response", 502);
    }
    records = response.messages.records;
    complete = records.length === 0 || page >= Number(response.messages.pages);
    next = { stage, page: page + 1 };
  } else {
    const response = await provider(stage === "contacts" ? "contacts" : "chats");
    if (!Array.isArray(response)) throw new InboxError("invalid_sync_response", 502);
    records = response;
    next = { stage: stage === "contacts" ? "chats" : "messages", page: 1 };
  }
  const rows = records.map(record => {
    if (stage === "messages") return inboxMessage(record, false);
    const identity = inboxIdentity(record);
    return identity ? { ...identity, contact_only: stage === "contacts" } : null;
  }).filter(Boolean);
  let skipped = 0;
  for (let offset = 0; offset < rows.length; offset += 200) {
    const stored = await inboxRpc(admin, "wa_ingest_messages", { p_rows: rows.slice(offset, offset + 200) });
    if (!isPlainObject(stored)) throw new InboxError("sync_unavailable", 503);
    skipped += Number(stored.skipped ?? 0);
    if (stage === "messages") await repairUnsupportedInboxContent(admin, rows.slice(offset, offset + 200));
  }
  const processed = Number(run.processed_count) + rows.length - skipped;
  const { data: saved, error } = await admin.from("whatsapp_sync_runs").update({ state: complete ? "complete" : "partial",
    cursor_json: next, processed_count: processed, unresolved_count: Number(run.unresolved_count) + records.length - rows.length + skipped,
    lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", run.id).eq("lease_token", run.lease_token).select("id").maybeSingle();
  if (error || !saved) throw new InboxError("sync_conflict", 409);
  return { complete, processed, stage: next.stage, page: next.page };
}
