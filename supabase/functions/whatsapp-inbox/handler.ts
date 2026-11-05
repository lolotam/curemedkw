import { z } from "npm:zod@3.25.76";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireShipaAdmin } from "../_shared/shipa-auth.ts";
import { createShipaRuntimeClient } from "../_shared/shipa-runtime.ts";
import { handleOptions, isAllowedOrigin, jsonError, jsonResponse } from "../_shared/cors.ts";
import { createEvolutionInboxClient, InboxError } from "../_shared/evolution-inbox.ts";
import { EvolutionBodyTooLargeError, isPlainObject, readBoundedText } from "../_shared/evolution-pairing.ts";
import { getInboxMedia } from "./media.ts";
import { sendInboxMessage } from "./send.ts";
import { inboxRpc, updateInboxConnection } from "./storage.ts";
import { syncInbox } from "./sync.ts";

const sendFields = { chatId: z.string().uuid(), requestId: z.string().uuid(), text: z.string().max(4096) };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("sync") }).strict(),
  z.object({ action: z.literal("webhook.ensure"), force: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("markRead"), chatId: z.string().uuid(), seenMessageId: z.string().min(1).max(250) }).strict(),
  z.object({ action: z.literal("send"), ...sendFields, text: z.string().trim().min(1).max(4096) }).strict(),
  z.object({ action: z.literal("media.send"), ...sendFields,
    media: z.object({ base64: z.string().max(13981016), mime: z.string().max(150), fileName: z.string().min(1).max(200) }).strict() }).strict(),
  z.object({ action: z.literal("media.get"), messageId: z.string().uuid() }).strict(),
]);
// Direct runtime routing consumes the first path segment; /functions/v1 belongs to Kong only.
const WEBHOOK_URL = "http://cloud-supabase-hns8fw-supabase-edge-functions:9000/whatsapp-pairing-webhook";

export function createInboxHandler(options: { admin: SupabaseClient; readConfig: () => { origin: string; apiKey: string; webhookSecret: string }; fetchImpl?: typeof fetch }) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) return jsonError(request, "forbidden", "Origin refused.", 403);
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonError(request, "method_not_allowed", "POST required.", 405);
    const authorization = await requireShipaAdmin(request, createShipaRuntimeClient(options.admin));
    if (!authorization.ok) return jsonError(request, authorization.code, "Administrator access required.", authorization.status);
    try {
      const bodyText = await readBoundedText(request.body, 14_100_000, request.headers.get("content-length"), AbortSignal.timeout(10_000));
      let body: unknown;
      try { body = JSON.parse(bodyText); } catch { throw new InboxError("invalid_request"); }
      const parsed = actionSchema.safeParse(body);
      if (!parsed.success) throw new InboxError("invalid_request");
      const action = parsed.data;
      const config = options.readConfig();
      const provider = createEvolutionInboxClient({ ...config, fetchImpl: options.fetchImpl });
      let receipt: unknown;
      switch (action.action) {
        case "status": {
          const status = await provider("status");
          const state = isPlainObject(status) && isPlainObject(status.instance) ? String(status.instance.state) : "unknown";
          await updateInboxConnection(options.admin, state);
          const hook = await provider("webhookStatus");
          receipt = { connected: state === "open", webhookReady: isPlainObject(hook) && hook.enabled === true && hook.url === WEBHOOK_URL };
          break;
        }
        case "webhook.ensure": {
          if (!config.webhookSecret.trim()) throw new InboxError("webhook_not_configured", 503);
          const current = await provider("webhookStatus");
          const hook = isPlainObject(current) ? current : {};
          if (typeof hook.url === "string" && hook.url && hook.url !== WEBHOOK_URL && !action.force) {
            throw new InboxError("webhook_conflict", 409);
          }
          const headers = isPlainObject(hook.headers) ? Object.fromEntries(
            Object.entries(hook.headers).filter(([key]) => key.toLowerCase() !== "x-curemed-webhook-key"),
          ) : {};
          const events = [...new Set([
            ...(Array.isArray(hook.events) ? hook.events.filter((event): event is string => typeof event === "string") : []),
            "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE",
          ])];
          await provider("webhook", { webhook: { enabled: true, url: WEBHOOK_URL,
            headers: { ...headers, "x-curemed-webhook-key": config.webhookSecret }, byEvents: false, base64: false,
            events } });
          receipt = { configured: true };
          break;
        }
        case "sync": receipt = await syncInbox(options.admin, provider, authorization.actor.userId); break;
        case "markRead":
          receipt = { read: await inboxRpc(options.admin, "wa_mark_chat_read", { p_chat_id: action.chatId, p_seen_message_id: action.seenMessageId, p_actor_id: authorization.actor.userId }) === true }; break;
        case "send": case "media.send": receipt = await sendInboxMessage(options.admin, provider, action, authorization.actor.userId); break;
        case "media.get": receipt = await getInboxMedia(options.admin, provider, action.messageId); break;
      }
      const response = jsonResponse(request, { success: true, data: receipt });
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof EvolutionBodyTooLargeError) return jsonError(request, "request_too_large", "Request too large.", 413);
      const code = error instanceof InboxError ? error.code : "inbox_unavailable";
      return jsonError(request, code, "The WhatsApp request could not be completed.", error instanceof InboxError ? error.status : 503);
    }
  };
}
