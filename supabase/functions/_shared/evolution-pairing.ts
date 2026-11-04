// Curemed — the fixed Evolution pairing client.
//
// This module is the only place that talks to the Curemed Evolution
// instance. It is deliberately narrow:
//
//   * The instance is the fixed constant "curemed". There is no caller
//     supplied instance name and no generic proxy.
//   * The origin is the fixed internal origin of that instance. Another
//     origin, a path, a query, a fragment or embedded credentials are
//     refused instead of being used.
//   * The credential is the scoped instance token of that instance. The
//     Evolution master key and the legacy/Postora variables are never a
//     fallback.
//   * Only two native paths exist: GET /instance/connectionState/curemed
//     and GET /instance/connect/curemed. One request per call, no retry
//     and no follow-up probe after an ambiguous connect.
//   * Every failure is a fixed safe error. Provider bodies, headers and
//     tokens are never logged, returned or attached to a cause.
//
// The module reads no environment variable and performs no I/O at import
// time. The caller injects the configuration and the fetch boundary, which
// keeps the secret on the server and keeps the module testable.

import {
  EvolutionBodyTooLargeError,
  readBoundedText,
  withAbortSignal,
} from "./evolution-pairing-io.ts";
import { isCanonicalPngBase64 } from "./evolution-pairing-png.ts";
export {
  EvolutionBodyTooLargeError,
  readBoundedText,
} from "./evolution-pairing-io.ts";

/** The one Evolution instance this slice may touch. */
export const EVOLUTION_INSTANCE = "curemed";

/** The fixed internal origin of the Curemed Evolution instance. */
export const EVOLUTION_ALLOWED_ORIGIN = "http://curemed-evolution:8080";

/** The header the Evolution API expects the instance token in. */
export const EVOLUTION_API_KEY_HEADER = "apikey";

/** The hard deadline of one provider request, headers and body included. */
export const EVOLUTION_REQUEST_DEADLINE_MS = 10_000;

/** The hard cap of one provider response body. */
export const EVOLUTION_MAX_RESPONSE_BYTES = 512 * 1024;

/** The hard cap of the base64 payload of one pairing QR. */
export const EVOLUTION_QR_MAX_BASE64_CHARS = 350_000;

/** The only safe connection state this slice reports. */
export type EvolutionConnectionState =
  | "connected"
  | "disconnected"
  | "connecting"
  | "unknown";

/** The project local, safe description of one connection. */
export interface EvolutionConnection {
  readonly state: EvolutionConnectionState;
  readonly qrDataUrl: string | null;
}

/** The closed set of failures this module reports. */
export type EvolutionPairingErrorCode =
  | "invalid_config"
  | "unauthorized"
  | "provider_unavailable"
  | "invalid_response"
  | "identity_mismatch"
  | "response_too_large"
  | "timeout"
  | "aborted";

/** The fixed wording of every failure. No provider text is ever used. */
export const EVOLUTION_PAIRING_ERROR_MESSAGES: Record<
  EvolutionPairingErrorCode,
  string
> = {
  invalid_config: "The WhatsApp pairing service is not configured.",
  unauthorized: "The WhatsApp pairing service rejected the request.",
  provider_unavailable: "The WhatsApp pairing service is unavailable.",
  invalid_response:
    "The WhatsApp pairing service returned an unexpected answer.",
  identity_mismatch:
    "The WhatsApp pairing service answered for another instance.",
  response_too_large:
    "The WhatsApp pairing service returned an oversized answer.",
  timeout: "The WhatsApp pairing service did not answer in time.",
  aborted: "The WhatsApp pairing request was cancelled.",
};

/** A failure with a fixed code and a fixed message. */
export class EvolutionPairingError extends Error {
  readonly code: EvolutionPairingErrorCode;

  constructor(code: EvolutionPairingErrorCode) {
    super(EVOLUTION_PAIRING_ERROR_MESSAGES[code]);
    this.name = "EvolutionPairingError";
    this.code = code;
  }
}

/**
 * The nested identity of a bound instance. The provider returns it inside
 * the instance object; the fields are unknown on purpose because only the
 * two values this slice checks are ever read.
 */
export interface EvolutionProviderInstance {
  readonly instanceName?: unknown;
  readonly state?: unknown;
}

/**
 * The shapes the two native paths may answer with. The flat pairing QR
 * object carries base64, code, pairingCode and count; only base64 may ever
 * become a safe field.
 */
export interface EvolutionProviderBody {
  readonly error?: unknown;
  readonly instance?: unknown;
  readonly base64?: unknown;
  readonly code?: unknown;
  readonly pairingCode?: unknown;
  readonly count?: unknown;
}

/** The injected native fetch boundary. */
export type EvolutionFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** The server configuration of the client. */
export interface EvolutionPairingClientOptions {
  /** The internal origin of the instance. Only the fixed one is accepted. */
  readonly origin: string;
  /** The scoped instance token of the instance. */
  readonly apiKey: string;
  /** The injected fetch boundary. The runtime fetch is the default. */
  readonly fetchImpl?: EvolutionFetch;
  /** The request deadline. It may be shorter, never longer. */
  readonly deadlineMs?: number;
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/** True for a plain object, false for arrays and null. */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Projects a provider state onto the bounded safe set. A missing or
 * unrecognized state is "unknown" and is never "connected".
 */
export function mapEvolutionProviderState(
  value: unknown,
): EvolutionConnectionState {
  if (typeof value !== "string") return "unknown";
  switch (value.trim().toLowerCase()) {
    case "open":
      return "connected";
    case "connecting":
    case "qr":
      return "connecting";
    case "close":
    case "disconnected":
    case "unauthenticated":
      return "disconnected";
    default:
      return "unknown";
  }
}

/** True for bounded canonical base64 that decodes to one complete PNG. */
function isCanonicalBase64(value: string): boolean {
  if (value.length > EVOLUTION_QR_MAX_BASE64_CHARS) return false;
  return isCanonicalPngBase64(value);
}

/**
 * Reads the pairing QR of a provider body. Only a bounded canonical PNG
 * data URL is accepted; an SVG, a URL, an HTML fragment, non-PNG bytes or
 * a truncated PNG is not a usable QR and stays a safe no-QR state.
 */
function readQrDataUrl(body: Record<string, unknown>): string | null {
  const raw = body.base64;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith(PNG_DATA_URL_PREFIX)) {
    const payload = trimmed.slice(PNG_DATA_URL_PREFIX.length);
    if (!isCanonicalBase64(payload)) return null;
    return PNG_DATA_URL_PREFIX + payload;
  }
  if (trimmed.startsWith("data:")) return null;
  if (!isCanonicalBase64(trimmed)) return null;
  return PNG_DATA_URL_PREFIX + trimmed;
}

/** True when the body belongs to the flat pairing QR family. */
function isQrFamily(body: Record<string, unknown>): boolean {
  return "base64" in body || "code" in body || "pairingCode" in body ||
    "count" in body;
}

/** Refuse a contradictory explicit identity even in a flat QR answer. */
function assertOptionalTopIdentity(body: Record<string, unknown>): void {
  if (!Object.hasOwn(body, "instanceName")) return;
  if (typeof body.instanceName !== "string") {
    throw new EvolutionPairingError("invalid_response");
  }
  if (body.instanceName !== EVOLUTION_INSTANCE) {
    throw new EvolutionPairingError("identity_mismatch");
  }
}

/** Parses the answer of the connection state path. */
function parseStatusBody(body: unknown): EvolutionConnection {
  if (!isPlainObject(body)) throw new EvolutionPairingError("invalid_response");
  assertOptionalTopIdentity(body);
  if (body.error === true) {
    throw new EvolutionPairingError("provider_unavailable");
  }

  // The status path is the authoritative identity source, so the nested
  // instance identity has to be there and has to be the fixed instance.
  const instance = body.instance;
  if (!isPlainObject(instance)) {
    throw new EvolutionPairingError("invalid_response");
  }
  const name = instance.instanceName;
  if (typeof name !== "string") {
    throw new EvolutionPairingError("invalid_response");
  }
  if (name !== EVOLUTION_INSTANCE) {
    throw new EvolutionPairingError("identity_mismatch");
  }

  return { state: mapEvolutionProviderState(instance.state), qrDataUrl: null };
}

/** Parses the answer of the connect path. */
function parseConnectBody(body: unknown): EvolutionConnection {
  if (!isPlainObject(body)) throw new EvolutionPairingError("invalid_response");
  assertOptionalTopIdentity(body);
  if (body.error === true) {
    throw new EvolutionPairingError("provider_unavailable");
  }

  const instance = body.instance;
  if (instance !== undefined) {
    if (!isPlainObject(instance)) {
      throw new EvolutionPairingError("invalid_response");
    }
    const name = instance.instanceName;
    if (typeof name !== "string") {
      throw new EvolutionPairingError("invalid_response");
    }
    if (name !== EVOLUTION_INSTANCE) {
      throw new EvolutionPairingError("identity_mismatch");
    }
    const state = mapEvolutionProviderState(instance.state);
    if (state === "connected") {
      // An already open instance answers without a QR.
      return { state, qrDataUrl: null };
    }
    const nestedQr = readQrDataUrl(body);
    if (nestedQr !== null) return { state: "connecting", qrDataUrl: nestedQr };
    return { state, qrDataUrl: null };
  }

  // The flat QR object carries no identity. The fixed path and the
  // instance scoped key establish the binding, so no identity is invented.
  const qr = readQrDataUrl(body);
  if (qr !== null) return { state: "connecting", qrDataUrl: qr };
  if (isQrFamily(body)) {
    // An empty or unusable QR is a safe no-QR state, not a pairing.
    return { state: "unknown", qrDataUrl: null };
  }
  throw new EvolutionPairingError("invalid_response");
}

/** Refuses every origin but the fixed internal one. */
function assertAllowedOrigin(origin: string): string {
  const trimmed = typeof origin === "string" ? origin.trim() : "";
  if (trimmed === "") throw new EvolutionPairingError("invalid_config");
  if (trimmed !== EVOLUTION_ALLOWED_ORIGIN) {
    throw new EvolutionPairingError("invalid_config");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EvolutionPairingError("invalid_config");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new EvolutionPairingError("invalid_config");
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new EvolutionPairingError("invalid_config");
  }
  if (parsed.pathname !== "/") {
    throw new EvolutionPairingError("invalid_config");
  }
  return trimmed;
}

/** Refuses a missing or a blank instance token. */
function checkKey(apiKey: string): string {
  const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
  if (trimmed === "") throw new EvolutionPairingError("invalid_config");
  return trimmed;
}

/** Refuses a deadline that is not a positive integer up to the hard cap. */
function assertDeadline(deadlineMs: number | undefined): number {
  if (deadlineMs === undefined) return EVOLUTION_REQUEST_DEADLINE_MS;
  if (!Number.isInteger(deadlineMs) || deadlineMs <= 0) {
    throw new EvolutionPairingError("invalid_config");
  }
  if (deadlineMs > EVOLUTION_REQUEST_DEADLINE_MS) {
    throw new EvolutionPairingError("invalid_config");
  }
  return deadlineMs;
}

/**
 * The client of the fixed Curemed instance. It owns the provider request
 * boundary, the deadline and the safe projection of the provider answer.
 */
export class EvolutionPairingClient {
  readonly #origin: string;
  readonly #apiKey: string;
  readonly #fetch: EvolutionFetch;
  readonly #deadlineMs: number;

  constructor(options: EvolutionPairingClientOptions) {
    this.#origin = assertAllowedOrigin(options.origin);
    this.#apiKey = checkKey(options.apiKey);
    this.#fetch = options.fetchImpl ??
      ((input: string, init?: RequestInit) => fetch(input, init));
    this.#deadlineMs = assertDeadline(options.deadlineMs);
  }

  /** Reads the state of the fixed instance. Exactly one provider request. */
  async readStatus(signal?: AbortSignal): Promise<EvolutionConnection> {
    const body = await this.#request(
      `/instance/connectionState/${EVOLUTION_INSTANCE}`,
      signal,
    );
    return parseStatusBody(body);
  }

  /**
   * Requests a pairing QR for the fixed instance. Exactly one provider
   * request; there is no follow-up probe after an ambiguous answer.
   */
  async requestConnect(signal?: AbortSignal): Promise<EvolutionConnection> {
    const body = await this.#request(
      `/instance/connect/${EVOLUTION_INSTANCE}`,
      signal,
    );
    return parseConnectBody(body);
  }

  async #request(
    path: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) throw new EvolutionPairingError("aborted");

    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    const expiresAt = performance.now() + this.#deadlineMs;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#deadlineMs);

    try {
      const transport = this.#fetch(`${this.#origin}${path}`, {
        method: "GET",
        headers: { [EVOLUTION_API_KEY_HEADER]: this.#apiKey },
        redirect: "manual",
        signal: controller.signal,
      });
      // A fetch implementation may ignore abort. A late response is disposed,
      // never consumed or followed by another provider request.
      void transport.then((response) => {
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
        }
      }, () => {});
      const response = await withAbortSignal(transport, controller.signal);

      if (response.status === 401 || response.status === 403) {
        void response.body?.cancel().catch(() => {});
        throw new EvolutionPairingError("unauthorized");
      }
      if (response.status < 200 || response.status >= 300) {
        // A redirect is refused like any other unexpected status.
        void response.body?.cancel().catch(() => {});
        throw new EvolutionPairingError("provider_unavailable");
      }

      const text = await readBoundedText(
        response.body,
        EVOLUTION_MAX_RESPONSE_BYTES,
        response.headers.get("content-length"),
        controller.signal,
      );
      if (performance.now() >= expiresAt) {
        throw new EvolutionPairingError("timeout");
      }
      if (controller.signal.aborted) throw new EvolutionPairingError("aborted");
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new EvolutionPairingError("invalid_response");
      }
    } catch (error) {
      if (error instanceof EvolutionPairingError) throw error;
      if (error instanceof EvolutionBodyTooLargeError) {
        throw new EvolutionPairingError("response_too_large");
      }
      if (timedOut) throw new EvolutionPairingError("timeout");
      if (controller.signal.aborted) throw new EvolutionPairingError("aborted");
      throw new EvolutionPairingError("provider_unavailable");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}
