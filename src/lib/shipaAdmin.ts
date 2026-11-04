// Shipa admin — the browser module of the five configuration actions.
//
// It owns the closed failure vocabulary with its fixed local messages, the
// single `functions.invoke` call boundary, the draft model of the editable
// configuration and the builder of the write payload.
//
// Three rules govern the transport:
//
//   1. A failure always carries a code that belongs to the closed set, and the
//      message is fixed text. A server message, a response body, a rejected
//      value and a secret never reach a caller.
//   2. The session and the JWT stay SDK-owned. This module never sends an
//      actor, a header of its own or a service-role key, and it never reads a
//      table. Every action is exactly one call: nothing here retries, polls
//      or falls back to a second endpoint.
//   3. A new API key exists only as an argument of one call. It is never
//      stored, cached, logged or echoed.
//
// The request bodies are exactly the five shapes the endpoint accepts. The
// settings block is validated with the shared parser before the call, so the
// nested credential metadata can never ride along in a save.
import { supabase } from "@/integrations/supabase/clientRuntime";
import {
  parseShipaAdminEnvelope,
  parseShipaReadinessPayload,
  parseShipaSettingsPayload,
  type ShipaReadinessDto,
  type ShipaSettingsEnvelopeDto,
} from "@/lib/shipaAdminResponses";
import {
  parseShipaSaveRequest,
  type ShipaEnvironment,
  type ShipaSaveableSettings,
} from "@/lib/shipaSettings";

export * from "@/lib/shipaAdminDraft";

/** The name of the one endpoint every action goes to. */
export const SHIPA_ADMIN_FUNCTION_NAME = "shipa-admin";

/**
 * The closed set of failures this client can report: the vocabulary of the
 * actual handler. An unknown code becomes `unavailable` and a malformed body
 * becomes `invalid_response`.
 */
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
  | "runtime_not_ready"
  | "upgrade_required"
  | "unavailable"
  | "invalid_configuration"
  | "unknown_key_version"
  | "decryption_failed"
  | "unhandled_error";

/**
 * The fixed message of every code. It never interpolates an input, a server
 * message or a body, so a failure can never leak a key, an endpoint or a
 * rejected value into the screen.
 */
export const SHIPA_ADMIN_ERROR_MESSAGES: Readonly<Record<ShipaAdminErrorCode, string>> = {
  unauthenticated: "Sign in as an administrator to manage Shipa delivery.",
  forbidden: "Your account is not allowed to manage Shipa delivery.",
  invalid_request: "The Shipa request was not valid. Nothing was changed.",
  invalid_json: "The Shipa request was not valid. Nothing was changed.",
  method_not_allowed: "The Shipa request was refused. Nothing was changed.",
  payload_too_large: "The Shipa request was too large. Nothing was changed.",
  conflict: "The Shipa settings changed elsewhere. Reload and review before saving again.",
  credential_in_use:
    "The Shipa API key is still in use by a shipment that may still be dispatched.",
  credential_missing: "No Shipa API key is configured for this environment.",
  invalid_response: "The Shipa service returned an unusable response.",
  runtime_not_ready:
    "Shipa delivery cannot be enabled yet because the delivery runtime is not ready.",
  upgrade_required: "Shipa delivery configuration is not available in this deployment yet.",
  unavailable: "The Shipa configuration service is not available right now.",
  invalid_configuration: "The Shipa configuration service is not set up correctly.",
  unknown_key_version: "No Shipa credential key is available for the stored key version.",
  decryption_failed: "The stored Shipa credential could not be read.",
  unhandled_error: "The Shipa request could not be completed.",
};

/** The fixed message of one code. */
export function shipaAdminErrorMessage(code: ShipaAdminErrorCode): string {
  return SHIPA_ADMIN_ERROR_MESSAGES[code];
}

/** The result of one action. */
export type ShipaAdminResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: ShipaAdminErrorCode; readonly message: string };

/** The options of one admin call. */
export interface ShipaAdminInvokeOptions {
  readonly body: unknown;
}

/** What the SDK hands back. */
export interface ShipaAdminInvokeResult {
  readonly data?: unknown;
  readonly error?: unknown;
}

/**
 * The injectable boundary of the transport.
 *
 * Only this function is the seam a test replaces. The real implementation is
 * `supabase.functions.invoke`, so the session and the JWT stay SDK-owned.
 */
export type ShipaAdminInvoke = (
  functionName: string,
  options: ShipaAdminInvokeOptions,
) => Promise<ShipaAdminInvokeResult>;

/** The request of a settings-only save. */
export interface ShipaAdminSaveRequest {
  readonly expectedRevision: number;
  readonly settings: ShipaSaveableSettings;
}

/**
 * The credential operation of a save. `replace` carries the new key; `preserve`
 * and `remove` carry none, so a blank replacement keeps the stored key.
 */
export type ShipaAdminCredentialOperation =
  | { readonly environment: ShipaEnvironment; readonly mode: "preserve" }
  | { readonly environment: ShipaEnvironment; readonly mode: "remove" }
  | { readonly environment: ShipaEnvironment; readonly mode: "replace"; readonly apiKey: string };

/** The request of a credential save. */
export interface ShipaAdminCredentialSaveRequest extends ShipaAdminSaveRequest {
  readonly credential: ShipaAdminCredentialOperation;
}

/** The request of a diagnosis. */
export interface ShipaAdminDiagnoseRequest {
  readonly expectedRevision: number;
  readonly environment: ShipaEnvironment;
}

// --- the client ---

/** The five configuration actions. */
export interface ShipaAdminClient {
  readSettings(): Promise<ShipaAdminResult<ShipaSettingsEnvelopeDto>>;
  saveSettings(request: ShipaAdminSaveRequest): Promise<ShipaAdminResult<ShipaSettingsEnvelopeDto>>;
  saveCredential(
    request: ShipaAdminCredentialSaveRequest,
  ): Promise<ShipaAdminResult<ShipaSettingsEnvelopeDto>>;
  readReadiness(): Promise<ShipaAdminResult<ShipaReadinessDto>>;
  diagnoseReadiness(
    request: ShipaAdminDiagnoseRequest,
  ): Promise<ShipaAdminResult<ShipaReadinessDto>>;
}

/**
 * Creates the client over an injected `functions.invoke` boundary.
 *
 * Every action is one call. Nothing here retries, polls or falls back to a
 * second endpoint.
 */
export function createShipaAdminClient(invoke: ShipaAdminInvoke): ShipaAdminClient {
  async function send(body: unknown): Promise<ShipaAdminResult<unknown>> {
    let outcome: ShipaAdminInvokeResult;
    try {
      outcome = await invoke(SHIPA_ADMIN_FUNCTION_NAME, { body });
    } catch (error) {
      return failure(await recoverCodeFromContext(error));
    }
    if (outcome?.error) return failure(await recoverCodeFromContext(outcome.error));
    const envelope = parseShipaAdminEnvelope(outcome?.data);
    if (envelope.ok === false) return failure(envelope.code);
    return { ok: true, data: envelope.data };
  }

  async function callSettings(
    body: unknown,
  ): Promise<ShipaAdminResult<ShipaSettingsEnvelopeDto>> {
    const response = await send(body);
    if (response.ok === false) return response;
    return toResult(parseShipaSettingsPayload(response.data));
  }

  async function callReadiness(body: unknown): Promise<ShipaAdminResult<ShipaReadinessDto>> {
    const response = await send(body);
    if (response.ok === false) return response;
    return toResult(parseShipaReadinessPayload(response.data));
  }

  async function writeSettings(
    body: unknown,
    expectedRevision: number,
  ): Promise<ShipaAdminResult<ShipaSettingsEnvelopeDto>> {
    const response = await callSettings(body);
    if (response.ok === true && response.data.settings.revision !== expectedRevision + 1) {
      return failure("invalid_response");
    }
    return response;
  }

  return {
    async readSettings() {
      return callSettings({ action: "settings.read" });
    },

    async saveSettings(request) {
      const settings = parseSaveableSettings(request);
      if (settings === null) return failure("invalid_request");
      return writeSettings({
        action: "settings.save",
        request: { expectedRevision: settings.expectedRevision, settings: settings.settings },
      }, settings.expectedRevision);
    },

    async saveCredential(request) {
      const settings = parseSaveableSettings(request);
      if (settings === null) return failure("invalid_request");
      const credential = parseCredentialOperation(request.credential);
      if (credential === null) return failure("invalid_request");
      return writeSettings({
        action: "credential.save",
        request: {
          expectedRevision: settings.expectedRevision,
          settings: settings.settings,
          credential,
        },
      }, settings.expectedRevision);
    },

    async readReadiness() {
      return callReadiness({ action: "readiness.read" });
    },

    async diagnoseReadiness(request) {
      if (!isExpectedRevision(request.expectedRevision)) return failure("invalid_request");
      if (request.environment !== "sandbox" && request.environment !== "live") {
        return failure("invalid_request");
      }
      return callReadiness({
        action: "readiness.diagnose",
        request: {
          expectedRevision: request.expectedRevision,
          environment: request.environment,
        },
      });
    },
  };
}

/**
 * The client the admin page uses. The existing runtime client owns deployment
 * configuration and session authentication.
 */
export const shipaAdminClient: ShipaAdminClient = createShipaAdminClient(
  async (functionName, options) => {
    const response = await supabase.functions.invoke(functionName, { body: options.body });
    return { data: response.data, error: response.error };
  },
);

// --- the internals ---

function failure(code?: ShipaAdminErrorCode | null): ShipaAdminResult<never> {
  const resolved: ShipaAdminErrorCode = code ?? "unavailable";
  return { ok: false, code: resolved, message: SHIPA_ADMIN_ERROR_MESSAGES[resolved] };
}

function toResult<T>(
  parsed: { ok: true; data: T } | { ok: false; code: ShipaAdminErrorCode },
): ShipaAdminResult<T> {
  if (parsed.ok === true) return { ok: true, data: parsed.data };
  return failure(parsed.code);
}

/**
 * Validates the settings of a save with the shared parser. The shared saveable
 * schema has exactly five keys and no credential metadata, so a payload that
 * carries one is refused here and the endpoint is never called.
 */
function parseSaveableSettings(request: ShipaAdminSaveRequest): {
  expectedRevision: number;
  settings: ShipaSaveableSettings;
} | null {
  if (!isExpectedRevision(request.expectedRevision)) return null;
  const parsed = parseShipaSaveRequest({
    expectedRevision: request.expectedRevision,
    settings: request.settings,
  });
  if (!parsed.ok || parsed.request === undefined) return null;
  return {
    expectedRevision: parsed.request.expectedRevision,
    settings: parsed.request.settings,
  };
}

function isExpectedRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Validates the credential operation against the closed three modes. */
function parseCredentialOperation(
  credential: ShipaAdminCredentialOperation,
): ShipaAdminCredentialOperation | null {
  if (!credential || typeof credential !== "object") return null;
  const environment = credential.environment;
  if (environment !== "sandbox" && environment !== "live") return null;
  const mode = credential.mode;
  if (mode === "preserve") return { environment, mode };
  if (mode === "remove") return { environment, mode };
  if (mode !== "replace") return null;
  const candidate = credential.apiKey;
  if (typeof candidate !== "string") return null;
  if (candidate.trim() === "") return { environment, mode: "preserve" };
  return { environment, mode, apiKey: candidate };
}

/** The responses whose body has already been read. */
const READ_RESPONSES = new WeakSet<object>();

/**
 * Recovers an allowed code from an SDK error.
 *
 * A `FunctionsHttpError` carries the response in `context`. That body is read
 * once, and only the `code` of its error object is used: the message, the
 * status and every other part of the body are discarded, so no server text
 * and no body content can reach the caller.
 */
async function recoverCodeFromContext(
  error: unknown,
): Promise<ShipaAdminErrorCode | null> {
  if (!isRecord(error)) return null;
  const context = error.context;
  if (!isRecord(context) || typeof context.json !== "function") return null;
  if (READ_RESPONSES.has(context)) return null;
  READ_RESPONSES.add(context);

  let body: unknown = null;
  try {
    body = await (context.json as () => Promise<unknown>).call(context);
  } catch {
    return null;
  }
  if (!isRecord(body)) return null;
  const inner = body.error;
  if (!isRecord(inner)) return null;
  const code = inner.code;
  if (typeof code !== "string") return null;
  return isKnownErrorCode(code) ? code : null;
}

function isKnownErrorCode(value: string): value is ShipaAdminErrorCode {
  return Object.prototype.hasOwnProperty.call(SHIPA_ADMIN_ERROR_MESSAGES, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
