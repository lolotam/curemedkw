// Shipa admin actions — the discriminated action contract, the bounded body
// reader and the closed failure mapping of the admin endpoint.
//
// What this module owns
// ---------------------
// Three things that the endpoint would otherwise repeat:
//
//   1. The action vocabulary. The endpoint accepts exactly five discriminated
//      actions, and each one has exactly one body shape. An unknown action, an
//      unknown top-level field, a missing request and a nested actor, proof,
//      endpoint or credential field are all refused here.
//   2. The bounded body reader. The body is read with a real byte cap, and
//      the reader is cancelled as soon as the cap is passed.
//   3. The closed failure mapping. Every failure the endpoint can report has
//      a fixed code, a fixed status and fixed text.
//
// The nested request schemas are NOT re-declared here: the existing shared
// parsers own them, and they are used before any key read or service I/O.
//
// Trust boundary
// --------------
// Nothing in this module reads the environment, performs I/O, logs or keeps a
// secret. A rejected body is never echoed, and no rejected value reaches a
// caller.

import { isPlainRecord } from "./integration-credential-contract.ts";
import {
  hasExactRecordKeys,
  parseShipaCredentialSaveRequest,
  parseShipaReadinessDiagnosisRequest,
  SHIPA_CONFIGURATION_ERROR_MESSAGES,
  ShipaConfigurationError,
} from "./shipa-configuration-service-contract.ts";
import {
  ShipaCredentialLoaderError,
  type ShipaCredentialLoaderErrorCode,
} from "./shipa-credential-loader-contract.ts";
import { parseShipaSaveRequest } from "./shipa-settings-validation.ts";
import { ShipaSettingsError } from "./shipa-settings-responses.ts";
import { SHIPA_AUTH_ERROR_MESSAGES } from "./shipa-auth.ts";

// ---------------------------------------------------------------------------
// The action vocabulary
// ---------------------------------------------------------------------------

/** The five completed configuration actions of the admin endpoint. */
export const SHIPA_ADMIN_ACTIONS = [
  "settings.read",
  "settings.save",
  "credential.save",
  "readiness.read",
  "readiness.diagnose",
] as const;

/** The action name of one admin request. */
export type ShipaAdminAction = (typeof SHIPA_ADMIN_ACTIONS)[number];

/**
 * One validated action.
 *
 * The `request` of a write action is the raw nested value. It was validated
 * by the shared parsers before it was accepted, and it is handed to the
 * service unchanged so that the service validates the caller's own payload
 * rather than a value this module rebuilt.
 */
export type ShipaAdminParsedAction =
  | { readonly action: "settings.read" }
  | { readonly action: "settings.save"; readonly request: unknown }
  | { readonly action: "credential.save"; readonly request: unknown }
  | { readonly action: "readiness.read" }
  | { readonly action: "readiness.diagnose"; readonly request: unknown };

/** The closed result of parsing one admin request body. */
export type ShipaAdminActionResult =
  | { readonly ok: true; readonly action: ShipaAdminParsedAction }
  | { readonly ok: false };

/**
 * Parses the admin request body.
 *
 * The body is exactly one of the five shapes. A body that names an unknown
 * action, carries an unknown top-level field, omits the request of a write
 * action, or carries a nested actor, proof, endpoint or credential field is
 * refused before any key read and before any service call.
 */
export function parseShipaAdminAction(raw: unknown): ShipaAdminActionResult {
  if (!isPlainRecord(raw)) return { ok: false };

  const action = raw["action"];
  switch (action) {
    case "settings.read": {
      if (!hasExactRecordKeys(raw, ["action"])) return { ok: false };
      return { ok: true, action: { action: "settings.read" } };
    }

    case "readiness.read": {
      if (!hasExactRecordKeys(raw, ["action"])) return { ok: false };
      return { ok: true, action: { action: "readiness.read" } };
    }

    case "settings.save": {
      if (!hasExactRecordKeys(raw, ["action", "request"])) return { ok: false };
      const request = raw["request"];
      const parsed = parseShipaSaveRequest(request);
      if (!parsed.ok || parsed.request === undefined) return { ok: false };
      return { ok: true, action: { action, request } };
    }

    case "credential.save": {
      if (!hasExactRecordKeys(raw, ["action", "request"])) return { ok: false };
      const request = raw["request"];
      if (!parseShipaCredentialSaveRequest(request).ok) return { ok: false };
      return { ok: true, action: { action, request } };
    }

    case "readiness.diagnose": {
      if (!hasExactRecordKeys(raw, ["action", "request"])) return { ok: false };
      const request = raw["request"];
      if (!parseShipaReadinessDiagnosisRequest(request).ok) {
        return { ok: false };
      }
      return { ok: true, action: { action, request } };
    }

    default:
      return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// The bounded body reader
// ---------------------------------------------------------------------------

/** The largest admin request body that is read, in bytes. */
export const SHIPA_ADMIN_MAX_BODY_BYTES = 65536;

/** The closed result of reading one admin request body. */
export type ShipaAdminBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: 400 | 413 };

/**
 * Reads the admin request body as JSON, within a real byte cap.
 *
 * The declared length is checked when the request carries one, and the
 * streamed bytes are counted as they arrive. The reader is cancelled as soon
 * as the cap is passed, so an oversized body is never buffered in full.
 *
 * A body that is not JSON is refused. The rejected text is never returned.
 */
export async function readShipaAdminJsonBody(
  request: Request,
): Promise<ShipaAdminBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > SHIPA_ADMIN_MAX_BODY_BYTES) {
      return { ok: false, status: 413 };
    }
  }

  const body = request.body;
  if (body === null) {
    return { ok: false, status: 400 };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > SHIPA_ADMIN_MAX_BODY_BYTES) {
        await cancelQuietly(reader);
        return { ok: false, status: 413 };
      }
      chunks.push(chunk.value);
    }
  } catch {
    await cancelQuietly(reader);
    return { ok: false, status: 400 };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ),
    };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** Cancels a reader without letting the cancellation itself fail the request. */
async function cancelQuietly(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    return;
  }
}

// ---------------------------------------------------------------------------
// The closed failure surface
// ---------------------------------------------------------------------------

/** The closed set of failures the admin endpoint can report. */
export type ShipaAdminErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "invalid_json"
  | "method_not_allowed"
  | "payload_too_large"
  | "conflict"
  | "credential_in_use"
  | "credential_missing"
  | "invalid_response"
  | "save_before_activation"
  | "configuration_incomplete"
  | "verification_stale"
  | "verification_failed"
  | "origin_city_unmatched"
  | "scheduler_stale"
  | "runtime_not_ready"
  | "upgrade_required"
  | "unavailable"
  | "invalid_configuration"
  | "unknown_key_version"
  | "decryption_failed"
  | "unhandled_error";

/** The transport status every closed code maps to. */
const SHIPA_ADMIN_ERROR_STATUS: Readonly<Record<ShipaAdminErrorCode, number>> =
  {
    unauthenticated: 401,
    forbidden: 403,
    invalid_request: 400,
    invalid_json: 400,
    method_not_allowed: 405,
    payload_too_large: 413,
    conflict: 409,
    credential_in_use: 409,
    credential_missing: 409,
    invalid_response: 502,
    save_before_activation: 409,
    configuration_incomplete: 409,
    verification_stale: 409,
    verification_failed: 409,
    origin_city_unmatched: 409,
    scheduler_stale: 409,
    runtime_not_ready: 503,
    upgrade_required: 503,
    unavailable: 503,
    invalid_configuration: 503,
    unknown_key_version: 503,
    decryption_failed: 503,
    unhandled_error: 500,
  };

/**
 * The fixed message of every closed code.
 *
 * The codes the configuration services own reuse their own fixed wording; the
 * endpoint's own codes get fixed wording of their own. No message ever
 * interpolates an input.
 */
export const SHIPA_ADMIN_ERROR_MESSAGES: Readonly<
  Record<ShipaAdminErrorCode, string>
> = {
  ...SHIPA_CONFIGURATION_ERROR_MESSAGES,
  unauthenticated: SHIPA_AUTH_ERROR_MESSAGES.unauthenticated,
  invalid_json: "The Shipa admin request is not valid JSON.",
  method_not_allowed: "The Shipa admin endpoint only accepts POST.",
  payload_too_large: "The Shipa admin request body is too large.",
  unhandled_error: "The Shipa admin request could not be completed.",
};

/** One mapped failure. It carries a code, a status and fixed text only. */
export interface ShipaAdminFailure {
  readonly code: ShipaAdminErrorCode;
  readonly status: number;
  readonly message: string;
}

/**
 * Maps a failure of the configuration graph onto the closed admin surface.
 *
 * A closed failure keeps its code. Anything else becomes `unhandled_error`
 * with fixed text: the original message, stack and cause are never returned.
 */
export function mapShipaAdminFailure(error: unknown): ShipaAdminFailure {
  if (error instanceof ShipaConfigurationError) {
    return failureFor(error.code);
  }
  if (error instanceof ShipaSettingsError) {
    return failureFor(error.code);
  }
  if (error instanceof ShipaCredentialLoaderError) {
    return failureFor(mapLoaderCode(error.code));
  }
  return failureFor("unhandled_error");
}

/** Maps a closed loader code onto the admin vocabulary. */
function mapLoaderCode(
  code: ShipaCredentialLoaderErrorCode,
): ShipaAdminErrorCode {
  switch (code) {
    case "invalid_binding":
      return "invalid_request";
    case "credential_missing":
      return "credential_missing";
    case "invalid_response":
    case "context_mismatch":
      return "invalid_response";
    case "unknown_key_version":
      return "unknown_key_version";
    case "decryption_failed":
      return "decryption_failed";
    case "upgrade_required":
      return "upgrade_required";
    default:
      return "unavailable";
  }
}

/** Builds one failure with its fixed status and fixed message. */
function failureFor(code: ShipaAdminErrorCode): ShipaAdminFailure {
  return {
    code,
    status: SHIPA_ADMIN_ERROR_STATUS[code],
    message: SHIPA_ADMIN_ERROR_MESSAGES[code],
  };
}
