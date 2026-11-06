import { type EvolutionInboxClient, inboxMessage } from "../_shared/evolution-inbox.ts";
import { isPlainObject } from "../_shared/evolution-pairing.ts";
import { constantTimeSecretEquals } from "../_shared/shipa-auth.ts";
import {
  ORDER_WHATSAPP_KINDS, type OrderWhatsAppKind, type OrderWhatsAppTokens, renderWhatsAppTemplate, resolveWhatsAppTemplate,
} from "../_shared/order-whatsapp-template.ts";

/** The header the scheduler sends its dedicated dispatch token in. */
export const ORDER_WHATSAPP_TOKEN_HEADER = "x-order-whatsapp-token";
const CLAIM_LIMIT = 10;

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

interface DispatchOptions {
  rpc: Rpc;
  /** Built per run so a missing Evolution configuration answers 503 instead of failing at boot. */
  provider: () => EvolutionInboxClient;
  schedulerToken: string;
}

interface ClaimedMessage {
  id: string; kind: OrderWhatsAppKind; language: "ar" | "en"; recipient: string; tokens: OrderWhatsAppTokens;
}

async function storageRpc(rpc: Rpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error("dispatch_storage_unavailable");
  return data;
}

function readClaim(raw: unknown): { messages: ClaimedMessage[]; templates: unknown } {
  if (!isPlainObject(raw) || !Array.isArray(raw.messages)) throw new Error("invalid_claim");
  const messages = raw.messages.map(item => {
    if (!isPlainObject(item) || typeof item.id !== "string" || !ORDER_WHATSAPP_KINDS.includes(item.kind as OrderWhatsAppKind) ||
      (item.language !== "ar" && item.language !== "en") || typeof item.recipient !== "string" || !isPlainObject(item.tokens)) {
      throw new Error("invalid_claim");
    }
    return item as unknown as ClaimedMessage;
  });
  return { messages, templates: raw.templates };
}

/**
 * Sends one claimed message. It is attempted once: any doubt about whether WhatsApp delivered it is
 * recorded as uncertain and never retried, because a retry could reach the customer twice.
 */
async function sendClaimed(options: DispatchOptions, provider: EvolutionInboxClient, message: ClaimedMessage, templates: unknown) {
  const body = renderWhatsAppTemplate(resolveWhatsAppTemplate(templates, `${message.kind}_${message.language}`), message.tokens);
  let row: ReturnType<typeof inboxMessage> = null;
  try {
    row = inboxMessage(await provider("text", { number: `${message.recipient}@s.whatsapp.net`, text: body }), false);
  } catch { /* recorded as uncertain below */ }
  await storageRpc(options.rpc, "owa_finish", { p_message_id: message.id, p_status: row ? "sent" : "uncertain",
    p_body: body, p_provider_message_id: row?.provider_message_id ?? null });
  if (!row) return "uncertain";
  // Shows the message in the inbox thread. The webhook echo stores it too, so a failure here loses nothing.
  await options.rpc("wa_ingest_messages", { p_rows: [{ ...row, normalized_phone: row.normalized_phone ?? message.recipient,
    direction: "outbound", body, message_type: "text" }] }).catch(() => undefined);
  return "sent";
}

export function createOrderWhatsAppDispatchHandler(options: DispatchOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return Response.json({ code: "method_not_allowed" }, { status: 405 });
    const presented = request.headers.get(ORDER_WHATSAPP_TOKEN_HEADER);
    if (presented === null || !constantTimeSecretEquals(presented, options.schedulerToken)) {
      return Response.json({ code: "unauthenticated" }, { status: 401 });
    }
    try {
      const provider = options.provider();
      const status = await provider("status");
      // Nothing is claimed while the session is down; queued messages wait, and expire after a day.
      if (!isPlainObject(status) || !isPlainObject(status.instance) || status.instance.state !== "open") {
        return Response.json({ success: true, session: "disconnected", sent: 0, uncertain: 0 });
      }
      const claim = readClaim(await storageRpc(options.rpc, "owa_claim_due", { p_limit: CLAIM_LIMIT }));
      const outcomes = { sent: 0, uncertain: 0 };
      for (const message of claim.messages) outcomes[await sendClaimed(options, provider, message, claim.templates)]++;
      return Response.json({ success: true, ...outcomes }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Provider and database errors can carry customer numbers; none of it is echoed.
      return Response.json({ code: "dispatch_unavailable" }, { status: 503 });
    }
  };
}
