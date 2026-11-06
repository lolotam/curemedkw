import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { InboxError } from "../_shared/evolution-inbox.ts";
import { isPlainObject } from "../_shared/evolution-pairing.ts";
import { inboxRpc } from "./storage.ts";

export interface InboxContactPatch {
  display_name?: string; business_name?: string; email?: string; notes?: string; phone?: string;
}

const REFUSAL_STATUS: Record<string, number> = {
  contact_not_found: 404, invalid_contact_patch: 400, invalid_phone: 400, phone_locked: 409, phone_in_use: 409,
};

/** Applies an administrator's contact edit; the database decides whether a number may be attached. */
export async function updateInboxContact(admin: SupabaseClient, input: { contactId: string; patch: InboxContactPatch },
  actorId: string) {
  const receipt = await inboxRpc(admin, "wa_update_inbox_contact", { p_contact_id: input.contactId,
    p_patch: input.patch, p_actor_id: actorId });
  if (!isPlainObject(receipt)) throw new InboxError("storage_unavailable", 503);
  if (receipt.ok !== true) {
    const code = String(receipt.code);
    throw new InboxError(code in REFUSAL_STATUS ? code : "storage_unavailable", REFUSAL_STATUS[code] ?? 503);
  }
  return { contact: receipt.contact };
}
