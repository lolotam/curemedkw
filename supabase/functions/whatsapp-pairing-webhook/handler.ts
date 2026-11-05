// Authenticated Curemed webhook. Persists connection, message and acknowledgement events.
import {
  EvolutionBodyTooLargeError,
  type EvolutionConnectionState,
  isPlainObject,
  mapEvolutionProviderState,
  readBoundedText,
} from "../_shared/evolution-pairing.ts";
import { secretsMatch } from "../_shared/caller-auth.ts";

/** The one instance this endpoint accepts. */
export const WEBHOOK_INSTANCE = "curemed";

/** The connection event accepted alongside message and acknowledgement events. */
export const WEBHOOK_EVENT = "connection.update";

/** The exact header the independent secret is presented in. */
export const WEBHOOK_HEADER_NAME = "x-curemed-webhook-key";

/** The hard cap of the request body. */
export const WEBHOOK_MAX_REQUEST_BYTES = 1_048_576;

/** The closed set of failures this endpoint reports. */
export type WebhookErrorCode =
  | "unauthorized"
  | "method_not_allowed"
  | "invalid_request"
  | "request_too_large"
  | "not_configured"
  | "storage_unavailable";

/** The fixed wording of every failure. */
export const WEBHOOK_ERROR_MESSAGES: Record<WebhookErrorCode, string> = {
  storage_unavailable: "The webhook could not persist the event.",
  unauthorized: "The webhook request was not authorized.",
  method_not_allowed: "This endpoint only accepts POST webhook events.",
  invalid_request: "The webhook request was rejected as invalid.",
  request_too_large: "The webhook request was too large.",
  not_configured: "The webhook secret is not configured on the server yet.",
};

/** The dependencies of the handler. */
export interface EvolutionWebhookHandlerOptions {
  /** Reads the independent webhook secret, lazily, per request. */
  readonly readSecret: () => string | undefined;
  readonly ingest: (event: string, payload: unknown) => Promise<void>;
}

/**
 * The payload keys this endpoint refuses. A QR or a message is not a
 * connection update, whatever the event field claims.
 */
const REFUSED_PAYLOAD_KEYS = [
  "base64",
  "code",
  "pairingCode",
  "qrcode",
  "qr",
  "message",
  "messages",
];

/** Builds the closed failure envelope. */
function errorResponse(
  status: number,
  code: WebhookErrorCode,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code, message: WEBHOOK_ERROR_MESSAGES[code] },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

/** Reads the bounded state of a native connection update. */
function projectState(body: Record<string, unknown>): EvolutionConnectionState {
  const data = body.data;
  if (isPlainObject(data) && typeof data.state === "string") {
    return mapEvolutionProviderState(data.state);
  }
  return mapEvolutionProviderState(body.state);
}

/**
 * Builds the authenticated handler for connection, message and acknowledgement events.
 */
export function createEvolutionPairingWebhookHandler(
  options: EvolutionWebhookHandlerOptions,
): (req: Request) => Promise<Response> {
  return async function handleWebhookRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return errorResponse(405, "method_not_allowed");
    }

    // The secret is read per request. An empty secret fails closed.
    let configured: string;
    try {
      configured = options.readSecret() ?? "";
    } catch {
      return errorResponse(503, "not_configured");
    }
    const expected = configured.trim();
    if (expected === "") return errorResponse(503, "not_configured");

    // The header is authenticated before the body is used at all.
    const presented = req.headers.get(WEBHOOK_HEADER_NAME);
    if (presented === null || presented.trim() === "") {
      return errorResponse(401, "unauthorized");
    }
    if (!secretsMatch(presented.trim(), expected)) {
      return errorResponse(401, "unauthorized");
    }

    if (req.signal.aborted) return errorResponse(400, "invalid_request");
    const fence = new AbortController();
    const expiresAt = performance.now() + 10_000;
    const cancel = () => fence.abort();
    const timer = setTimeout(cancel, 10_000);
    req.signal.addEventListener("abort", cancel, { once: true });
    let bodyText: string;
    try {
      bodyText = await readBoundedText(
        req.body,
        WEBHOOK_MAX_REQUEST_BYTES,
        req.headers.get("content-length"),
        fence.signal,
      );
    } catch (error) {
      if (error instanceof EvolutionBodyTooLargeError) {
        return errorResponse(413, "request_too_large");
      }
      return errorResponse(400, "invalid_request");
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener("abort", cancel);
    }

    if (fence.signal.aborted || performance.now() >= expiresAt) {
      return errorResponse(400, "invalid_request");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      return errorResponse(400, "invalid_request");
    }
    if (!isPlainObject(parsed)) return errorResponse(400, "invalid_request");

    // Project directly without copying untrusted keys into an object prototype.
    // Native authentication/sender/destination fields are never consulted.
    const sanitized = parsed;

    if (sanitized.instance !== WEBHOOK_INSTANCE) return errorResponse(400, "invalid_request");
    const event = typeof sanitized.event === "string" ? sanitized.event.toLowerCase().replaceAll("_", ".") : "";
    if (event === "messages.upsert" || event === "messages.update") {
      if (!sanitized.data || (typeof sanitized.data !== "object")) return errorResponse(400, "invalid_request");
      try { await options.ingest(event, sanitized.data); }
      catch { return errorResponse(503, "storage_unavailable"); }
      return Response.json({ success: true, acknowledged: true }, { headers: { "Cache-Control": "no-store" } });
    }
    // A QR or a message is refused whatever the event field claims.
    for (const key of REFUSED_PAYLOAD_KEYS) {
      if (
        key in sanitized ||
        (isPlainObject(sanitized.data) && key in sanitized.data)
      ) return errorResponse(400, "invalid_request");
    }

    if (
      !Object.hasOwn(sanitized, "instance") ||
      sanitized.instance !== WEBHOOK_INSTANCE
    ) {
      return errorResponse(400, "invalid_request");
    }
    if (
      !Object.hasOwn(sanitized, "event") || event !== WEBHOOK_EVENT
    ) {
      return errorResponse(400, "invalid_request");
    }

    const state = projectState(sanitized);
    try { await options.ingest(event, { state }); }
    catch { return errorResponse(503, "storage_unavailable"); }

    // Acknowledge only after durable storage has accepted the event.
    return new Response(
      JSON.stringify({
        success: true,
        acknowledged: true,
        instance: WEBHOOK_INSTANCE,
        state,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  };
}
