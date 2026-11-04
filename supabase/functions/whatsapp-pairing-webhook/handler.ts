// Curemed — the connection only webhook.
//
// The webhook accepts exactly one provider event: the connection update of
// the fixed Curemed Evolution instance. It authenticates the request with an
// independently generated header secret, it projects the bounded connection
// state, and it answers with a safe acknowledgement.
//
// What it deliberately does not do
// -------------------------------
//   * It does not write anything. There is no database client, no instance
//     mutation, no readiness or generation change and no session reopen.
//     A replayed acknowledgement therefore cannot change anything: the
//     endpoint has no write path at all.
//   * It does not subscribe to messages, contacts or history. A message or
//     a QR event is refused.
//   * It does not trust the native envelope. The apikey, sender,
//     destination and server_url of a native body are dropped: they are not
//     authorization and they are never logged, returned or persisted.
//   * It does not authorize a browser, the service role key or the anon
//     key. Only the independent header secret opens it, and an empty
//     configured secret fails closed.

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

/** The one event this endpoint accepts. */
export const WEBHOOK_EVENT = "connection.update";

/** The exact header the independent secret is presented in. */
export const WEBHOOK_HEADER_NAME = "x-curemed-webhook-key";

/** The hard cap of the request body. */
export const WEBHOOK_MAX_REQUEST_BYTES = 32_768;

/** The closed set of failures this endpoint reports. */
export type WebhookErrorCode =
  | "unauthorized"
  | "method_not_allowed"
  | "invalid_request"
  | "request_too_large"
  | "not_configured";

/** The fixed wording of every failure. */
export const WEBHOOK_ERROR_MESSAGES: Record<WebhookErrorCode, string> = {
  unauthorized: "The webhook request was not authorized.",
  method_not_allowed: "This endpoint only accepts a connection update.",
  invalid_request: "The webhook request was rejected as invalid.",
  request_too_large: "The webhook request was too large.",
  not_configured: "The webhook secret is not configured on the server yet.",
};

/** The dependencies of the handler. */
export interface EvolutionWebhookHandlerOptions {
  /** Reads the independent webhook secret, lazily, per request. */
  readonly readSecret: () => string | undefined;
}

/**
 * The payload keys this endpoint refuses. A QR or a message is not a
 * connection update, whatever the event field claims.
 */
const REFUSED_PAYLOAD_KEYS = [
  "base64",
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
 * Builds the request handler of the connection only webhook.
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
      !Object.hasOwn(sanitized, "event") || sanitized.event !== WEBHOOK_EVENT
    ) {
      return errorResponse(400, "invalid_request");
    }

    const state = projectState(sanitized);

    // The acknowledgement is the only answer. Nothing is stored, and the
    // displayed state of the website comes from the native scoped status.
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
