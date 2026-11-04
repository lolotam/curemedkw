// Request helpers for the Shipa admin endpoint tests.
//
// Every request is built against a synthetic endpoint address. No listener
// is started: the handler is called directly, so a test observes the real
// request path without a server.
//
// Nothing here carries a real credential, key, token or personal value.

/** The synthetic endpoint address the handler is called with. */
export const ADMIN_ENDPOINT_URL = "https://curemedkw.test/shipa-admin";

/** The options of one synthetic admin request. */
export interface AdminRequestOptions {
  /** The HTTP method. Defaults to POST. */
  readonly method?: string;
  /** The bearer token. `null` sends no authorization header at all. */
  readonly token?: string | null;
  /** Extra headers, such as a declared content length. */
  readonly headers?: Record<string, string>;
  /** A raw body that replaces the serialised payload. */
  readonly rawBody?: BodyInit | null;
}

/**
 * Builds one synthetic admin request.
 *
 * A JSON payload is serialised unless a raw body is supplied. The
 * authorization header carries the bearer token unless the token is null.
 */
export function createAdminRequest(
  body?: unknown,
  options: AdminRequestOptions = {},
): Request {
  const method = options.method ?? "POST";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  };

  const access = options.token === undefined
    ? "synthetic-admin-token"
    : options.token;
  if (access !== null) {
    headers["authorization"] = `Bearer ${access}`;
  }

  const rawBody = options.rawBody !== undefined
    ? options.rawBody
    : body === undefined
    ? null
    : JSON.stringify(body);

  return new Request(ADMIN_ENDPOINT_URL, {
    method,
    headers,
    body: method === "GET" || method === "OPTIONS" ? null : rawBody,
  });
}

/**
 * Builds a body that is larger than the endpoint's byte cap.
 *
 * The payload is still shaped like an action, so the size is the only thing
 * that can refuse it.
 */
export function createOversizeBody(): string {
  return JSON.stringify({
    action: "settings.read",
    padding: "x".repeat(70 * 1024),
  });
}
