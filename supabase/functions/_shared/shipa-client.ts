// Shipa Delivery V2 — bounded HTTP client.
//
// The only module of the adapter that performs network access. Every call:
//
//   * is bound to one of the two fixed origins; no caller may supply a host,
//   * is authenticated with the `apikey` query parameter exactly as the
//     captured reference declares, and with nothing else. The separately
//     supplied app secret is unused by this contract and is never sent,
//   * is sent once. There is no retry, no pacing, no probing, no queue and
//     no fallback from one environment to the other,
//   * is refused on any redirect, so a credential can never be replayed to a
//     host the adapter did not choose,
//   * is bounded by a single deadline that covers both the request and the
//     response body read, and by a bounded response size.
//
// Secret handling: the runtime key is passed to the constructor and kept in
// an ECMAScript private field. It appears in exactly one place, the query
// string of the request handed to the injected fetch. It never appears in a
// returned value, an error, an error cause, a message or a log. The request
// URL is secret bearing for the same reason, so it is never returned either.
//
// Source of truth:
//   docs/integrations/shipa-v2-contract.md
//   docs/integrations/shipa-v2-delivery-contract.json

import {
  buildShipaOrderPayload,
  isShipaEnvironment,
  isValidShipaOrderId,
  SHIPA_BASE_URLS,
  type ShipaEnvironment,
  type ShipaFailureCode,
  type ShipaLocalRejectionCode,
  type ShipaOrderDraft,
} from "./shipa-contract.ts";
import {
  parseShipaCountry,
  parseShipaCountryList,
  parseShipaCreateResponse,
  parseShipaHealth,
  parseShipaOrderDetail,
  parseShipaOrderStory,
  parseShipaTracking,
  type ShipaCountry,
  type ShipaHealth,
  type ShipaOrderDetail,
  type ShipaStoryEntry,
  type ShipaTracking,
} from "./shipa-responses.ts";

/** The deadline of one request, covering the response body read as well. */
export const SHIPA_DEFAULT_DEADLINE_MS = 10_000;

/** The largest response body the adapter reads, in bytes. */
export const SHIPA_MAX_RESPONSE_BYTES = 512 * 1024;

/**
 * The fetch boundary. It is injected so the adapter can be exercised without
 * a network, and it is the only place the request URL exists.
 */
export type ShipaFetch = (url: string, init: RequestInit) => Promise<Response>;

const defaultShipaFetch: ShipaFetch = (url, init) => fetch(url, init);

// --- Results ----------------------------------------------------------------

/** The result of a read-only call. */
export type ShipaResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: ShipaFailureCode };

/**
 * The result of a create call.
 *
 * `accepted` means the provider answered 2xx with a usable provider
 * reference. `rejected_local` means the request was refused before any
 * network call, so it provably was not submitted. `uncertain` covers every
 * remaining outcome, including a timeout, a disconnect, a 5xx, a 429, a
 * malformed success and a success without a provider reference.
 *
 * An uncertain outcome is never a safe retry. The captured reference proves
 * no idempotency guarantee and no retry semantics, and it documents the
 * error responses as generic 4XX/5XX without proving that a rejection
 * happened before an order was created, so no provider status is treated as
 * proof of a non-creation.
 */
export type ShipaCreateResult =
  | {
    readonly outcome: "accepted";
    readonly shipaRef: string;
    readonly orderStatus: string | null;
  }
  | { readonly outcome: "uncertain"; readonly code: ShipaFailureCode }
  | {
    readonly outcome: "rejected_local";
    readonly code: ShipaLocalRejectionCode;
    readonly field: string;
    readonly message: string;
  };

// --- Client -----------------------------------------------------------------

export interface ShipaClientOptions {
  /** The environment this client talks to. Its origin is fixed. */
  readonly environment: ShipaEnvironment;
  /**
   * The runtime key for that environment. It is private to the client and is
   * only ever used as the `apikey` query parameter.
   */
  readonly apiKey: string;
  /** The fetch boundary. Defaults to the platform fetch. */
  readonly fetchImpl?: ShipaFetch;
  /** The request deadline in milliseconds. Defaults to ten seconds. */
  readonly deadlineMs?: number;
}

/**
 * A client for the captured Shipa Delivery V2 operations this integration
 * needs: health, the country directory, one country with its cities, order
 * creation, order detail, order history and live tracking.
 */
export class ShipaClient {
  #environment: ShipaEnvironment;
  #apiKey: string;
  #fetch: ShipaFetch;
  #deadlineMs: number;

  constructor(options: ShipaClientOptions) {
    if (!isShipaEnvironment(options.environment)) {
      throw new Error("The Shipa client requires a supported environment.");
    }
    if (
      typeof options.apiKey !== "string" ||
      options.apiKey.trim().length === 0
    ) {
      throw new Error("The Shipa client requires a non-empty API key.");
    }
    const deadlineMs = options.deadlineMs ?? SHIPA_DEFAULT_DEADLINE_MS;
    if (
      !Number.isFinite(deadlineMs) || deadlineMs <= 0 ||
      deadlineMs > SHIPA_DEFAULT_DEADLINE_MS
    ) {
      throw new Error("The Shipa client requires a positive deadline.");
    }
    this.#environment = options.environment;
    const value = options.apiKey;
    this.#apiKey = value;
    this.#fetch = options.fetchImpl ?? defaultShipaFetch;
    this.#deadlineMs = deadlineMs;
  }

  /** The environment this client is bound to. */
  get environment(): ShipaEnvironment {
    return this.#environment;
  }

  // --- Read-only operations -------------------------------------------------

  /** Reads the upstream service health. */
  async health(): Promise<ShipaResult<ShipaHealth>> {
    const execution = await this.#execute("/health", "GET");
    if (execution.kind === "failed") {
      return { ok: false, code: execution.code };
    }
    const parsed = parseShipaHealth(execution.payload);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, code: parsed.code };
  }

  /** Reads the supported country directory. */
  async listCountries(): Promise<ShipaResult<ShipaCountry[]>> {
    const execution = await this.#execute("/countries", "GET");
    if (execution.kind === "failed") {
      return { ok: false, code: execution.code };
    }
    const parsed = parseShipaCountryList(execution.payload);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, code: parsed.code };
  }

  /** Reads one country with its cities. */
  async getCountry(iso3Code: string): Promise<ShipaResult<ShipaCountry>> {
    if (!/^[A-Z]{3}$/.test(iso3Code)) {
      return { ok: false, code: "invalid_request" };
    }
    const execution = await this.#execute(
      `/countries/${encodeURIComponent(iso3Code)}`,
      "GET",
    );
    if (execution.kind === "failed") {
      return { ok: false, code: execution.code };
    }
    const parsed = parseShipaCountry(execution.payload);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, code: parsed.code };
  }

  /**
   * Reads the detail of one order. The provider locates the first order that
   * matches a customer reference, so the caller must compare the returned
   * `customerRef` with the reference it meant. A miss is not proof that
   * nothing exists and never authorises a re-creation.
   */
  async getOrderDetail(
    orderId: string,
  ): Promise<ShipaResult<ShipaOrderDetail>> {
    if (!isValidShipaOrderId(orderId)) {
      return { ok: false, code: "invalid_order_ref" };
    }
    const execution = await this.#execute(
      `/orders/${encodeURIComponent(orderId)}`,
      "GET",
    );
    if (execution.kind === "failed") {
      return { ok: false, code: execution.code };
    }
    const parsed = parseShipaOrderDetail(execution.payload);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, code: parsed.code };
  }

  /** Reads the history of one order. */
  async getOrderStory(
    orderId: string,
  ): Promise<ShipaResult<ShipaStoryEntry[]>> {
    if (!isValidShipaOrderId(orderId)) {
      return { ok: false, code: "invalid_order_ref" };
    }
    const execution = await this.#execute(
      `/orders/${encodeURIComponent(orderId)}/story`,
      "GET",
    );
    if (execution.kind === "failed") {
      return { ok: false, code: execution.code };
    }
    const parsed = parseShipaOrderStory(execution.payload);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, code: parsed.code };
  }

  /** Reads the live courier position of one order. */
  async getTracking(orderId: string): Promise<ShipaResult<ShipaTracking>> {
    if (!isValidShipaOrderId(orderId)) {
      return { ok: false, code: "invalid_order_ref" };
    }
    const execution = await this.#execute(
      `/orders/${encodeURIComponent(orderId)}/tracking`,
      "GET",
    );
    if (execution.kind === "failed") {
      return { ok: false, code: execution.code };
    }
    const parsed = parseShipaTracking(execution.payload);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, code: parsed.code };
  }

  // --- Mutation -------------------------------------------------------------

  /**
   * Creates one domestic Kuwait delivery order. The payload is built and
   * validated locally first, so a locally rejected request performs no
   * network call at all and is reported as definitely not submitted. The
   * provider reference of an accepted creation is the only proof of
   * acceptance.
   */
  async createOrder(draft: ShipaOrderDraft): Promise<ShipaCreateResult> {
    const built = buildShipaOrderPayload(draft);
    if (!built.ok) {
      return {
        outcome: "rejected_local",
        code: built.code,
        field: built.field,
        message: built.message,
      };
    }

    const execution = await this.#execute(
      "/orders",
      "POST",
      JSON.stringify(built.payload),
    );
    if (execution.kind === "failed") {
      return { outcome: "uncertain", code: execution.code };
    }

    const parsed = parseShipaCreateResponse(execution.payload);
    if (!parsed.ok) {
      return { outcome: "uncertain", code: parsed.code };
    }
    return {
      outcome: "accepted",
      shipaRef: parsed.value.shipaRef,
      orderStatus: parsed.value.orderStatus,
    };
  }

  // --- Transport ------------------------------------------------------------

  /**
   * Builds the request URL. The result carries the API key and therefore
   * never leaves this class.
   */
  #buildUrl(path: string): string {
    const base = SHIPA_BASE_URLS[this.#environment];
    const url = new URL(`${base}${path}`);
    url.searchParams.set("apikey", this.#apiKey);
    return url.toString();
  }

  /**
   * Performs exactly one request and returns either the decoded document or
   * a fixed failure code. Upstream text, upstream URLs and upstream bodies
   * are never propagated.
   */
  async #execute(
    path: string,
    method: "GET" | "POST",
    body?: string,
  ): Promise<ShipaExecution> {
    const url = this.#buildUrl(path);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    let timedOut!: (result: ShipaExecution) => void;
    const deadline = new Promise<ShipaExecution>((resolve) => {
      timedOut = resolve;
    });
    const timer = setTimeout(() => {
      timedOut({ kind: "failed", code: "timeout" });
      controller.abort();
    }, this.#deadlineMs);

    try {
      const execute = async (): Promise<ShipaExecution> => {
        let response: Response;
        try {
          response = await this.#fetch(url, {
            method,
            headers,
            body,
            redirect: "manual",
            signal: controller.signal,
          });
        } catch {
          return {
            kind: "failed",
            code: controller.signal.aborted ? "timeout" : "network_error",
          };
        }

        if (controller.signal.aborted) {
          void discardBody(response);
          return { kind: "failed", code: "timeout" };
        }

        const statusFailure = statusFailureFor(response.status);
        if (statusFailure !== null) {
          void discardBody(response);
          return { kind: "failed", code: statusFailure };
        }

        return await this.#readJson(response, controller.signal);
      };
      return await Promise.race([execute(), deadline]);
    } catch {
      return {
        kind: "failed",
        code: controller.signal.aborted ? "timeout" : "network_error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Reads the response body under the size limit and decodes it as JSON.
   * The limit is enforced twice: against the declared content length and
   * against the bytes actually streamed.
   */
  async #readJson(
    response: Response,
    signal: AbortSignal,
  ): Promise<ShipaExecution> {
    const declared = response.headers.get("content-length");
    if (declared !== null) {
      const declaredLength = Number(declared);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > SHIPA_MAX_RESPONSE_BYTES
      ) {
        void discardBody(response);
        return { kind: "failed", code: "response_too_large" };
      }
    }

    const body = response.body;
    if (body === null) {
      return { kind: "failed", code: "malformed_response" };
    }

    const reader = body.getReader();
    const cancelReader = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancelReader, { once: true });
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        const chunk: Uint8Array | undefined = result.value;
        if (chunk === undefined) continue;
        total += chunk.byteLength;
        if (total > SHIPA_MAX_RESPONSE_BYTES) {
          cancelReader();
          return { kind: "failed", code: "response_too_large" };
        }
        chunks.push(chunk);
      }
    } catch {
      return {
        kind: "failed",
        code: signal.aborted ? "timeout" : "network_error",
      };
    } finally {
      signal.removeEventListener("abort", cancelReader);
      try {
        reader.releaseLock();
      } catch { /* Cancellation may still be settling. */ }
    }

    const text = new TextDecoder("utf-8").decode(concatChunks(chunks));
    try {
      return { kind: "response", payload: JSON.parse(text) };
    } catch {
      return { kind: "failed", code: "malformed_response" };
    }
  }
}

// --- Transport helpers ------------------------------------------------------

type ShipaExecution =
  | { readonly kind: "response"; readonly payload: unknown }
  | { readonly kind: "failed"; readonly code: ShipaFailureCode };

/**
 * Maps a status to a fixed failure code. A redirect is always refused: the
 * key is in the query string and must never reach another host.
 */
function statusFailureFor(status: number): ShipaFailureCode | null {
  if (status === 0) return "redirect_refused";
  if (status >= 300 && status < 400) return "redirect_refused";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status < 200 || status >= 300) return "unexpected_status";
  return null;
}

/** Cancels a body that will not be read. Best effort only. */
async function discardBody(response: Response): Promise<void> {
  const body = response.body;
  if (body === null) return;
  try {
    await body.cancel();
  } catch {
    return;
  }
}

/** Joins the streamed chunks into one buffer. */
function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let size = 0;
  for (const chunk of chunks) size += chunk.byteLength;
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

// Re-exported so a caller can use the normalised shapes without reaching
// into the parser module.
export type {
  ShipaCountry,
  ShipaHealth,
  ShipaOrderDetail,
  ShipaStoryEntry,
  ShipaTracking,
};
