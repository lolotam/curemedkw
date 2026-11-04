// Curemed — the WhatsApp pairing administrator endpoint.
//
// The endpoint exposes exactly two actions for the Curemed administrator:
// read the state of the fixed Curemed Evolution instance, and ask that
// instance for a pairing QR.
//
// What it deliberately does not do
// -------------------------------
//   * It does not accept an instance, an origin, an endpoint, a credential
//     or an actor from the request. The instance and the origin are fixed
//     in the shared client, and the credential is read from the server
//     configuration only after the caller is authorized.
//   * It does not decode the bearer token. The shared administrator helper
//     resolves the session through the auth server and checks the admin
//     role; a body actor, an anonymous call, the anon key and the service
//     role key are not an authority.
//   * It does not read, import, store or send a message, and it does not
//     create, reset, restart, delete or log out an instance.
//   * It does not expose a provider body. The answer is the project local
//     pair {state, qrDataUrl} and nothing else.
//
// The factory takes its dependencies, so the real authorization helper and
// the real provider client run against a fake SDK and a fake fetch.

import {
  requireShipaAdmin,
  type ShipaAdminAuthorization,
  type ShipaAuthClient,
} from "../_shared/shipa-auth.ts";
import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { withAbortSignal } from "../_shared/evolution-pairing-io.ts";
import {
  EvolutionBodyTooLargeError,
  type EvolutionConnection,
  type EvolutionFetch,
  EvolutionPairingClient,
  EvolutionPairingError,
  isPlainObject,
  readBoundedText,
} from "../_shared/evolution-pairing.ts";

/** The hard fence of one request, authorization and provider included. */
export const REQUEST_FENCE_MS = 15_000;

/** The hard cap of the request body. */
export const MAX_REQUEST_BYTES = 4_096;

/** The closed set of failures this endpoint reports. */
export type PairingErrorCode =
  | "unauthorized"
  | "forbidden"
  | "origin_not_allowed"
  | "method_not_allowed"
  | "invalid_request"
  | "request_too_large"
  | "not_configured"
  | "provider_unauthorized"
  | "provider_unavailable"
  | "invalid_response"
  | "identity_mismatch"
  | "response_too_large"
  | "timeout"
  | "aborted";

/** The fixed wording of every failure. */
export const PAIRING_ERROR_MESSAGES: Record<PairingErrorCode, string> = {
  unauthorized: "Sign in again to use WhatsApp pairing.",
  forbidden: "This action requires an administrator account.",
  origin_not_allowed: "This action is not allowed from this origin.",
  method_not_allowed: "This action is not supported here.",
  invalid_request: "The request was rejected as invalid.",
  request_too_large: "The request was too large.",
  not_configured: "WhatsApp pairing is not configured on the server yet.",
  provider_unauthorized:
    "The WhatsApp pairing service rejected the server credential.",
  provider_unavailable: "The WhatsApp pairing service is unavailable.",
  invalid_response: "The WhatsApp pairing service answered unexpectedly.",
  identity_mismatch:
    "The WhatsApp pairing service answered for another instance.",
  response_too_large:
    "The WhatsApp pairing service answered with too much data.",
  timeout: "The WhatsApp pairing service did not answer in time.",
  aborted: "The WhatsApp pairing request was cancelled.",
};

/** The server configuration of the fixed instance. */
export interface EvolutionPairingConfig {
  readonly origin: string;
  readonly apiKey: string;
}

/** The dependencies of the handler. */
export interface EvolutionPairingHandlerOptions {
  /** The service role client the real admin helper runs on. */
  readonly admin: ShipaAuthClient;
  /** Reads the server configuration, lazily, after authorization. */
  readonly readConfig: () => EvolutionPairingConfig | undefined;
  /** The injected fetch boundary of the provider client. */
  readonly fetchImpl?: EvolutionFetch;
  /** The request fence. It may be shorter, never longer. */
  readonly requestFenceMs?: number;
}

const BEARER_PATTERN = /^Bearer ([^\s]+)$/i;

/** Reads a strict bearer credential. The token itself is never decoded. */
function readBearer(header: string | null): string | null {
  if (header === null) return null;
  const match = BEARER_PATTERN.exec(header.trim());
  if (match === null) return null;
  return match[1];
}

/** Builds a JSON answer with the shared CORS headers and no caching. */
function jsonResponse(
  req: Request,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Cache-Control": "no-store",
      ...(extraHeaders ?? {}),
    },
  });
}

/** Builds the closed failure envelope. */
function errorResponse(
  req: Request,
  status: number,
  code: PairingErrorCode,
  extraHeaders?: Record<string, string>,
): Response {
  return jsonResponse(
    req,
    status,
    { success: false, error: { code, message: PAIRING_ERROR_MESSAGES[code] } },
    extraHeaders,
  );
}

/** The preflight answer. It reads no session, no config and no provider. */
function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "Cache-Control": "no-store",
    },
  });
}

/** Maps a provider failure onto the closed endpoint failure set. */
function providerFailure(
  code: EvolutionPairingError["code"],
): { status: number; code: PairingErrorCode } {
  switch (code) {
    case "invalid_config":
      return { status: 503, code: "not_configured" };
    case "unauthorized":
      return { status: 502, code: "provider_unauthorized" };
    case "invalid_response":
      return { status: 502, code: "invalid_response" };
    case "identity_mismatch":
      return { status: 502, code: "identity_mismatch" };
    case "response_too_large":
      return { status: 502, code: "response_too_large" };
    case "timeout":
      return { status: 504, code: "timeout" };
    case "aborted":
      return { status: 504, code: "aborted" };
    default:
      return { status: 502, code: "provider_unavailable" };
  }
}

/** Reads the request body under the hard byte cap. */
async function readRequestText(
  req: Request,
  signal: AbortSignal,
): Promise<string> {
  return await readBoundedText(
    req.body,
    MAX_REQUEST_BYTES,
    req.headers.get("content-length"),
    signal,
  );
}

/**
 * Builds the request handler of the WhatsApp pairing endpoint.
 */
export function createEvolutionPairingHandler(
  options: EvolutionPairingHandlerOptions,
): (req: Request) => Promise<Response> {
  const requestedFence = options.requestFenceMs ?? REQUEST_FENCE_MS;
  const fenceMs = Number.isFinite(requestedFence)
    ? Math.max(0, Math.min(REQUEST_FENCE_MS, requestedFence))
    : 0;

  return async function handlePairingRequest(req: Request): Promise<Response> {
    // A preflight never authenticates and never reads the configuration.
    if (req.method === "OPTIONS") return preflightResponse(req);
    if (req.method !== "POST") {
      return errorResponse(req, 405, "method_not_allowed", {
        Allow: "POST, OPTIONS",
      });
    }

    // The bearer shape is checked before anything else is read.
    if (readBearer(req.headers.get("authorization")) === null) {
      return errorResponse(req, 401, "unauthorized");
    }

    // An origin that is not one of Curemed's own is refused.
    const origin = req.headers.get("origin");
    if (origin !== null && !isAllowedOrigin(origin)) {
      return errorResponse(req, 403, "origin_not_allowed");
    }

    // The fence covers the authorization, the body and the provider call.
    if (req.signal.aborted) return errorResponse(req, 504, "aborted");
    const expiresAt = performance.now() + fenceMs;
    const fence = new AbortController();
    let fenceElapsed = false;
    const timer = setTimeout(() => {
      fenceElapsed = true;
      fence.abort();
    }, fenceMs);
    const onClientAbort = () => fence.abort();
    req.signal.addEventListener("abort", onClientAbort, { once: true });

    try {
      // Authentication is required for both actions and comes before any
      // configuration read and any provider call.
      let authorization: ShipaAdminAuthorization;
      try {
        authorization = await withAbortSignal(
          requireShipaAdmin(req, options.admin),
          fence.signal,
        );
      } catch {
        if (fence.signal.aborted) {
          return errorResponse(
            req,
            504,
            (fenceElapsed || performance.now() >= expiresAt)
              ? "timeout"
              : "aborted",
          );
        }
        return errorResponse(req, 503, "provider_unavailable");
      }
      if (fence.signal.aborted || performance.now() >= expiresAt) {
        return errorResponse(
          req,
          504,
          (fenceElapsed || performance.now() >= expiresAt)
            ? "timeout"
            : "aborted",
        );
      }
      if (!authorization.ok) {
        return errorResponse(
          req,
          authorization.status,
          authorization.status === 401
            ? "unauthorized"
            : authorization.status === 403
            ? "forbidden"
            : "provider_unavailable",
        );
      }

      // The request contract is closed: one action and nothing else.
      const url = new URL(req.url);
      if (url.search !== "") return errorResponse(req, 400, "invalid_request");

      let bodyText: string;
      try {
        bodyText = await readRequestText(req, fence.signal);
      } catch (error) {
        if (fence.signal.aborted) {
          return errorResponse(
            req,
            504,
            (fenceElapsed || performance.now() >= expiresAt)
              ? "timeout"
              : "aborted",
          );
        }
        if (error instanceof EvolutionBodyTooLargeError) {
          return errorResponse(req, 413, "request_too_large");
        }
        return errorResponse(req, 400, "invalid_request");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText) as unknown;
      } catch {
        return errorResponse(req, 400, "invalid_request");
      }
      if (!isPlainObject(parsed)) {
        return errorResponse(req, 400, "invalid_request");
      }
      const keys = Object.keys(parsed);
      if (keys.length !== 1 || keys[0] !== "action") {
        return errorResponse(req, 400, "invalid_request");
      }
      const action = parsed.action;
      if (action !== "status" && action !== "connect") {
        return errorResponse(req, 400, "invalid_request");
      }

      if (fence.signal.aborted || performance.now() >= expiresAt) {
        return errorResponse(req, 504, "timeout");
      }
      // The configuration is read only now, and only from the server.
      let config: EvolutionPairingConfig | undefined;
      try {
        config = options.readConfig();
      } catch {
        return errorResponse(req, 503, "not_configured");
      }
      if (config === undefined || !config.origin || !config.apiKey) {
        return errorResponse(req, 503, "not_configured");
      }

      let client: EvolutionPairingClient;
      try {
        const key = config.apiKey;
        client = new EvolutionPairingClient({
          origin: config.origin,
          apiKey: key,
          fetchImpl: options.fetchImpl,
        });
      } catch {
        return errorResponse(req, 503, "not_configured");
      }

      // A request that ran out of time never starts the provider.
      if (fence.signal.aborted || performance.now() >= expiresAt) {
        return errorResponse(
          req,
          504,
          (fenceElapsed || performance.now() >= expiresAt)
            ? "timeout"
            : "aborted",
        );
      }

      let connection: EvolutionConnection;
      try {
        connection = action === "status"
          ? await client.readStatus(fence.signal)
          : await client.requestConnect(fence.signal);
      } catch (error) {
        if (error instanceof EvolutionPairingError) {
          const failure = providerFailure(error.code);
          return errorResponse(req, failure.status, failure.code);
        }
        return errorResponse(req, 502, "provider_unavailable");
      }

      // A late answer of an abandoned request never returns a QR.
      if (fence.signal.aborted || performance.now() >= expiresAt) {
        return errorResponse(
          req,
          504,
          (fenceElapsed || performance.now() >= expiresAt)
            ? "timeout"
            : "aborted",
        );
      }

      return jsonResponse(req, 200, { success: true, connection });
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener("abort", onClientAbort);
    }
  };
}
