// Shipa admin endpoint — the authenticated configuration handler.
//
// What this endpoint is
// ---------------------
// The single Edge entrypoint for the five completed configuration actions:
// read the safe settings, save the safe settings, save one environment's
// credential, read the readiness projection and run one read-only diagnostic
// probe. It is the concrete contract a later admin UI calls.
//
// How a request is answered
// -------------------------
//   1. A CORS preflight is answered without authentication, without a
//      database call and without touching key material.
//   2. A non-POST request is refused with 405 and has no effect.
//   3. Every POST independently runs the real `requireShipaAdmin`: the
//      session is resolved through the SDK and the administrator role is read
//      from a real role row. Only the returned `{userId}` is authority.
//   4. The body is read with a real byte cap, after the administrator was
//      verified and before any service or key work happens.
//   5. The action is one of the five closed shapes. The nested request is
//      validated by the existing shared parsers.
//   6. The real settings store, credential service or readiness service runs
//      with the verified actor.
//
// The actor
// ---------
// The actor is the id the SDK resolved. A body, a header or a query string
// never supplies it. Body actor claims are refused; identity-like headers
// and query parameters are never consulted for authority.
//
// Trust boundary
// --------------
// Nothing here logs, and no rejected value, upstream body, SQL fragment,
// credential, ciphertext, nonce or key material reaches a response.
//
// Source of truth:
//   docs/superpowers/specs/2026-11-02-shipa-delivery-design.md (section 6)
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (tasks 5, 6)

import {
  mapShipaAdminFailure,
  parseShipaAdminAction,
  readShipaAdminJsonBody,
  SHIPA_ADMIN_ERROR_MESSAGES,
  type ShipaAdminParsedAction,
} from "../_shared/shipa-admin-actions.ts";
import {
  requireShipaAdmin,
  SHIPA_AUTH_ERROR_MESSAGES,
} from "../_shared/shipa-auth.ts";
import { handleOptions, jsonError, jsonResponse } from "../_shared/cors.ts";
import type { ShipaFetch } from "../_shared/shipa-client.ts";
import type { ShipaServiceActor } from "../_shared/shipa-configuration-service-contract.ts";
import {
  createShipaRuntimeServices,
  type ShipaRuntimeClient,
  type ShipaRuntimeServices,
} from "../_shared/shipa-runtime.ts";

/** The injected dependencies of the admin handler. */
export interface ShipaAdminHandlerOptions {
  /** The database client. It is the SDK boundary, never a table. */
  readonly client: ShipaRuntimeClient;
  /**
   * Reads the encoded master key.
   *
   * It is consulted only by the actions that genuinely need key material.
   */
  readonly readEncryptionKey: () => string | undefined;
  /** The fetch boundary of the provider adapter. */
  readonly fetchImpl?: ShipaFetch;
}

/** The request handler of the admin endpoint. */
export type ShipaAdminHandler = (request: Request) => Promise<Response>;

/**
 * Creates the admin handler over an injected client.
 *
 * The handler performs no I/O of its own: the database calls, the provider
 * calls and the key import all belong to the injected dependencies, so the
 * handler can be exercised without a listener.
 */
export function createShipaAdminHandler(
  options: ShipaAdminHandlerOptions,
): ShipaAdminHandler {
  const runtime = createShipaRuntimeServices({
    client: options.client,
    readEncryptionKey: options.readEncryptionKey,
    fetchImpl: options.fetchImpl,
  });

  return async function handleShipaAdminRequest(
    request: Request,
  ): Promise<Response> {
    const preflight = handleOptions(request);
    if (preflight !== null) return preflight;

    if (request.method !== "POST") {
      return methodNotAllowed(request);
    }

    const authorization = await requireShipaAdmin(request, options.client);
    if (!authorization.ok) {
      return jsonError(
        request,
        authorization.code,
        SHIPA_AUTH_ERROR_MESSAGES[authorization.code],
        authorization.status,
      );
    }
    const actor = authorization.actor;

    const body = await readShipaAdminJsonBody(request);
    if (!body.ok) {
      const code = body.status === 413 ? "payload_too_large" : "invalid_json";
      return jsonError(
        request,
        code,
        SHIPA_ADMIN_ERROR_MESSAGES[code],
        body.status,
      );
    }

    const parsed = parseShipaAdminAction(body.value);
    if (!parsed.ok) {
      return jsonError(
        request,
        "invalid_request",
        SHIPA_ADMIN_ERROR_MESSAGES.invalid_request,
        400,
      );
    }

    try {
      const data = await runAdminAction(runtime, parsed.action, actor);
      return jsonResponse(request, { success: true, data }, 200);
    } catch (error) {
      const failure = mapShipaAdminFailure(error);
      return jsonError(request, failure.code, failure.message, failure.status);
    }
  };
}

/**
 * Runs one validated action against the real services.
 *
 * The keyring is loaded only by the two actions that need it, and only after
 * the action and its request were accepted and the administrator was
 * verified. No action reaches the database outside the injected services.
 */
async function runAdminAction(
  runtime: ShipaRuntimeServices,
  action: ShipaAdminParsedAction,
  actor: ShipaServiceActor,
): Promise<unknown> {
  switch (action.action) {
    case "settings.read":
      return await runtime.settingsStore.read({ actor });

    case "settings.save":
      return await runtime.settingsStore.save({
        actor,
        request: action.request,
      });

    case "readiness.read":
      return await runtime.createReadinessService().read({ actor });

    case "credential.save": {
      const service = await runtime.requireCredentialService();
      return await service.save({ actor, request: action.request });
    }

    case "readiness.diagnose": {
      // The probe loads the stored credential, so the keyring is loaded first.
      await runtime.requireKeyring();
      return await runtime.createReadinessService().diagnose({
        actor,
        request: action.request,
      });
    }
  }
}

/** Refuses a non-POST request and names the accepted methods. */
function methodNotAllowed(request: Request): Response {
  const response = jsonError(
    request,
    "method_not_allowed",
    SHIPA_ADMIN_ERROR_MESSAGES.method_not_allowed,
    405,
  );
  response.headers.set("Allow", "POST, OPTIONS");
  return response;
}
