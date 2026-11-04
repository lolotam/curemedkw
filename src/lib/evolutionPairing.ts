// Curemed — the browser transport of the WhatsApp pairing action.
//
// The browser talks to exactly one endpoint, through the Supabase SDK:
//   supabase.functions.invoke("whatsapp-pairing", { body: { action } })
//
// It never builds a provider URL, it never carries a credential, it never
// selects an instance, and it never calls the provider directly.
//
// The answers are parsed strictly. A success body has to be exactly
// {success, connection:{state, qrDataUrl}}; an error body has to be exactly
// {success, error:{code, message}}. Anything else is refused, and the
// message of the server is dropped in favour of the fixed local wording, so
// a remote text can never reach the administrator.
//
// A pairing QR is a temporary credential. It stays in the memory of the
// component that received it: it is never written to the console, to the
// query cache, to local storage, to session storage or to analytics.

import { supabase } from "@/integrations/supabase/clientRuntime";
import { readBoundedHttpErrorJson } from "@/lib/boundedHttpErrorJson";

/** The two actions the endpoint accepts. */
export type EvolutionPairingAction = "status" | "connect";

/** The bounded connection state the slice reports. */
export type EvolutionConnectionState =
  | "connected"
  | "disconnected"
  | "connecting"
  | "unknown";

/** The safe description of one connection. */
export interface EvolutionConnection {
  readonly state: EvolutionConnectionState;
  readonly qrDataUrl: string | null;
}

/** The outcome of one pairing action. */
export type EvolutionPairingResult =
  | { readonly ok: true; readonly connection: EvolutionConnection }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** The fixed local wording of every failure. */
export const EVOLUTION_PAIRING_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Sign in again to use WhatsApp pairing.",
  forbidden: "This action requires an administrator account.",
  origin_not_allowed: "This action is not allowed from this address.",
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

/** The wording of a failure this slice does not know. */
export const EVOLUTION_PAIRING_FALLBACK_MESSAGE =
  "The WhatsApp pairing service is unavailable. Try again later.";

/** The hard cap of one pairing QR in the browser. */
export const EVOLUTION_QR_MAX_LENGTH = 512 * 1024;

/**
 * How long a pairing QR stays on the screen. The expiry is local: it says
 * nothing about the provider side.
 */
export const EVOLUTION_QR_DISPLAY_MS = 60_000;

/** The endpoint this transport talks to. */
export const EVOLUTION_PAIRING_FUNCTION = "whatsapp-pairing";

const CONNECTION_STATES: readonly EvolutionConnectionState[] = [
  "connected",
  "disconnected",
  "connecting",
  "unknown",
];

const QR_DATA_PREFIX = "data:image/png;base64,";
function isCanonicalQr(qr: string): boolean {
  if (!qr.startsWith(QR_DATA_PREFIX) || qr.length <= QR_DATA_PREFIX.length) return false;
  const payload = qr.slice(QR_DATA_PREFIX.length);
  try { return btoa(atob(payload)) === payload; }
  catch { return false; }
}

const ERROR_CODE_PATTERN = /^[a-z_]+$/;

/** The result shape of the SDK invocation. */
export interface EvolutionInvokeResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly context?: unknown } | null;
}

/** The injected invocation boundary. */
export type EvolutionInvoke = (
  functionName: string,
  options: { readonly body: { readonly action: EvolutionPairingAction } },
) => Promise<EvolutionInvokeResult>;

/** The client of the pairing action. */
export interface EvolutionPairingClient {
  /** Reads the state of the fixed instance. */
  readStatus(): Promise<EvolutionPairingResult>;
  /** Asks the fixed instance for a pairing QR. */
  requestConnect(): Promise<EvolutionPairingResult>;
}

/** True for a plain object, false for arrays and null. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the object carries exactly the given keys. */
function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => key in value);
}

/** The fixed wording of a known failure code. */
export function evolutionPairingMessage(code: string): string {
  const known = EVOLUTION_PAIRING_ERROR_MESSAGES[code];
  return typeof known === "string" ? known : EVOLUTION_PAIRING_FALLBACK_MESSAGE;
}

/** The refused shape failure. */
function invalidResponse(): EvolutionPairingResult {
  return {
    ok: false,
    code: "invalid_response",
    message: EVOLUTION_PAIRING_ERROR_MESSAGES.invalid_response,
  };
}

/**
 * Parses one answer of the pairing endpoint. A body with an unknown field,
 * a body with a secret field, an unknown state and a QR that is not a PNG
 * data URL are all refused.
 */
export function parseEvolutionPairingResponse(
  payload: unknown,
): EvolutionPairingResult {
  if (!isPlainObject(payload)) return invalidResponse();

  if (payload.success === true) {
    if (!hasExactKeys(payload, ["success", "connection"])) {
      return invalidResponse();
    }
    const connection = payload.connection;
    if (!isPlainObject(connection)) return invalidResponse();
    if (!hasExactKeys(connection, ["state", "qrDataUrl"])) {
      return invalidResponse();
    }
    const state = connection.state;
    if (typeof state !== "string") return invalidResponse();
    if (!CONNECTION_STATES.includes(state as EvolutionConnectionState)) {
      return invalidResponse();
    }
    const qrDataUrl = connection.qrDataUrl;
    let safeQr: string | null = null;
    if (qrDataUrl !== null) {
      if (typeof qrDataUrl !== "string") return invalidResponse();
      if (qrDataUrl.length > EVOLUTION_QR_MAX_LENGTH) {
        return invalidResponse();
      }
      if (!isCanonicalQr(qrDataUrl)) return invalidResponse();
      safeQr = qrDataUrl;
    }
    return {
      ok: true,
      connection: {
        state: state as EvolutionConnectionState,
        qrDataUrl: safeQr,
      },
    };
  }

  if (payload.success === false) {
    return parseFailureEnvelope(payload) ?? invalidResponse();
  }

  return invalidResponse();
}

/** Parse only a closed failure envelope, never an HTTP-error QR/success. */
function parseFailureEnvelope(payload: unknown): EvolutionPairingResult | undefined {
  if (!isPlainObject(payload) || payload.success !== false) return undefined;
  if (!hasExactKeys(payload, ["success", "error"])) return undefined;
  const error = payload.error;
  if (!isPlainObject(error) || !hasExactKeys(error, ["code", "message"])) return undefined;
  const code = error.code;
  if (typeof code !== "string" || !ERROR_CODE_PATTERN.test(code)) return undefined;
  // The message of the server is deliberately dropped.
  if (Object.prototype.hasOwnProperty.call(EVOLUTION_PAIRING_ERROR_MESSAGES, code)) {
    return { ok: false, code, message: evolutionPairingMessage(code) };
  }
  return { ok: false, code: "unavailable", message: EVOLUTION_PAIRING_FALLBACK_MESSAGE };
}

/** Consume a real SDK HTTP-error response once, with byte and wait bounds. */
async function readHttpFailure(error: unknown): Promise<EvolutionPairingResult | undefined> {
  if (!isPlainObject(error) || !(error.context instanceof Response)) return undefined;
  return parseFailureEnvelope(await readBoundedHttpErrorJson(error.context));
}

/**
 * Builds the pairing client on top of an invocation boundary.
 */
export function createEvolutionPairingClient(
  invoke: EvolutionInvoke,
): EvolutionPairingClient {
  async function call(action: EvolutionPairingAction): Promise<
    EvolutionPairingResult
  > {
    let response: EvolutionInvokeResult | undefined;
    try {
      response = await invoke(EVOLUTION_PAIRING_FUNCTION, { body: { action } });
    } catch {
      return {
        ok: false,
        code: "unavailable",
        message: EVOLUTION_PAIRING_FALLBACK_MESSAGE,
      };
    }
    if (!isPlainObject(response)) return invalidResponse();
    if (response.error !== null && response.error !== undefined) {
      const failure = await readHttpFailure(response.error);
      if (failure?.ok === false) return failure;
      return {
        ok: false,
        code: "unavailable",
        message: EVOLUTION_PAIRING_FALLBACK_MESSAGE,
      };
    }
    return parseEvolutionPairingResponse(response.data);
  }

  return {
    readStatus: () => call("status"),
    requestConnect: () => call("connect"),
  };
}

/** The client of the runtime SDK. */
export const evolutionPairingClient: EvolutionPairingClient =
  createEvolutionPairingClient(async (functionName, options) => {
    const result = await supabase.functions.invoke(functionName, options);
    return { data: result.data as unknown, error: result.error };
  });

/**
 * Subscribes to the session changes of the runtime client, so that a card
 * can drop a pairing QR when the session behind it changes.
 */
export function subscribeToPairingAuthChanges(
  onChange: (event: string, userId: string | null) => void,
): () => void {
  const auth = supabase.auth;
  if (!auth || typeof auth.onAuthStateChange !== "function") return () => {};
  const { data } = auth.onAuthStateChange((event, session) => onChange(event, session?.user?.id ?? null));
  return () => {
    data?.subscription.unsubscribe();
  };
}
