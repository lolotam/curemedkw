// Shipa authorization: verified administrator identity and worker credential
// checks.
//
// Two independent questions are answered here, and they are deliberately not
// mixed:
//
//   1. `requireShipaAdmin` answers "is this request an administrator?". It
//      verifies the session with the SDK's `auth.getUser`, validates the
//      returned user id with the shared integration UUID guard, and then
//      requires a real `user_roles` row with `role = 'admin'` for that
//      verified user. The actor id is always the id the SDK resolved. A JWT
//      claim is never decoded, and an actor id from a header, a body or a
//      query string is never trusted.
//
//   2. `authorizeShipaWorker` answers "is this request the worker?". It
//      compares two explicitly injected secrets against the request headers.
//      It performs no I/O at all: no SDK call, no SQL call, no environment
//      read, no heartbeat write and no logging.
//
// Both answers are closed. A failure carries a status and a code and nothing
// else: no upstream message, no SQL detail, no hint, no cause and no part of
// a user profile ever crosses this boundary.
//
// Source of truth:
//   docs/superpowers/specs/2026-11-02-shipa-delivery-design.md (sections 5, 6)
//   docs/superpowers/plans/2026-11-02-shipa-delivery.md (tasks 5, 6)
//   docs/integrations/shipa-settings-rpc-contract.md
//
// Trust boundary: this module is server-only. It never reads `Deno.env`, it
// never performs network or database I/O of its own, and it never logs.

import {
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";

// ---------------------------------------------------------------------------
// Closed failures
// ---------------------------------------------------------------------------

/**
 * The closed set of authorization failures this module can report.
 *
 * Nothing outside this list is ever produced, and a code never carries a
 * value: the message is fixed text and never contains an upstream message, a
 * token, a secret or a user profile.
 */
export type ShipaAuthErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "unavailable";

/** The transport statuses the closed codes map to. */
export type ShipaAuthStatus = 401 | 403 | 503;

/**
 * The fixed message for every code. The mapping is exported so a caller can
 * map a code to a transport response without re-deriving the text, and so a
 * test can prove that a message never interpolates an input.
 */
export const SHIPA_AUTH_ERROR_MESSAGES: Readonly<
  Record<ShipaAuthErrorCode, string>
> = {
  unauthenticated: "The Shipa request is not authenticated.",
  forbidden: "The Shipa request is not allowed.",
  unavailable: "The Shipa authorization service is not available right now.",
};

/** A refused administrator request. It carries no detail of any kind. */
export interface ShipaAdminAuthorizationFailure {
  readonly ok: false;
  readonly status: ShipaAuthStatus;
  readonly code: ShipaAuthErrorCode;
}

/**
 * The verified administrator. Only the user id crosses this boundary: the
 * rest of the profile is dropped.
 */
export interface ShipaAdminActor {
  readonly userId: string;
}

/** A successful administrator authorization. */
export interface ShipaAdminAuthorizationSuccess {
  readonly ok: true;
  readonly actor: ShipaAdminActor;
}

/** The closed answer of `requireShipaAdmin`. */
export type ShipaAdminAuthorization =
  | ShipaAdminAuthorizationSuccess
  | ShipaAdminAuthorizationFailure;

/**
 * A refused worker request. It carries no detail of any kind.
 */
export interface ShipaWorkerAuthorizationFailure {
  readonly ok: false;
  readonly status: 401;
  readonly code: "unauthenticated";
}

/** Which injected credential authorized the worker request. */
export type ShipaWorkerSource = "service" | "scheduler";

/** A successful worker authorization. */
export interface ShipaWorkerAuthorizationSuccess {
  readonly ok: true;
  readonly source: ShipaWorkerSource;
}

/** The closed answer of `authorizeShipaWorker`. */
export type ShipaWorkerAuthorization =
  | ShipaWorkerAuthorizationSuccess
  | ShipaWorkerAuthorizationFailure;

// ---------------------------------------------------------------------------
// The SDK boundary
// ---------------------------------------------------------------------------

/**
 * The structural slice of the SDK this module needs.
 *
 * A real Supabase client satisfies it: `auth.getUser` resolves a session
 * result and the query builder supports the from/select/eq/eq/maybeSingle
 * chain. Keeping the dependency structural avoids pulling an SDK runtime into
 * this module and keeps the fake boundary in the tests honest.
 */
export interface ShipaAuthClient {
  readonly auth: ShipaAuthGetUser;
  from(table: string): ShipaAuthRoleTable;
}

/** The session lookup of the SDK. */
export interface ShipaAuthGetUser {
  getUser(token: string): PromiseLike<ShipaAuthUserResponse>;
}

/** The resolved session result. */
export interface ShipaAuthUserResponse {
  readonly data: { readonly user: { readonly id: string } | null } | null;
  readonly error: unknown;
}

/** The table slice of the SDK. */
export interface ShipaAuthRoleTable {
  select(columns: string): ShipaAuthRoleFilter;
}

/** The filter slice of the SDK. */
export interface ShipaAuthRoleFilter {
  eq(column: string, value: string): ShipaAuthRoleFilter;
  maybeSingle(): PromiseLike<ShipaAuthRoleResponse>;
}

/** The resolved role lookup result. */
export interface ShipaAuthRoleResponse {
  readonly data: unknown;
  readonly error: unknown;
}

// ---------------------------------------------------------------------------
// Administrator authorization
// ---------------------------------------------------------------------------

/**
 * Requires a verified administrator session.
 *
 * The request must carry a real `Bearer` authorization header. The token is
 * resolved through `auth.getUser`, so the answer describes a session the
 * server actually verified rather than a claim the caller made. A resolved
 * session error is unauthenticated; a rejected SDK promise is unavailable.
 *
 * After the session is verified, the user must hold a real `user_roles` row
 * with `role = 'admin'`. A missing row is forbidden; a failed role lookup is
 * unavailable.
 *
 * The result is closed: `{ok:true, actor:{userId}}` or
 * `{ok:false, status, code}`.
 */
export async function requireShipaAdmin(
  request: Request,
  client: ShipaAuthClient,
): Promise<ShipaAdminAuthorization> {
  const bearer = readBearerToken(request);
  if (bearer === null) {
    return adminFailure(401, "unauthenticated");
  }

  const session = await settle(() => client.auth.getUser(bearer));
  if (!session.ok) {
    // A rejected promise is a transport failure, not a missing session.
    return adminFailure(503, "unavailable");
  }

  const userId = readVerifiedUserId(session.value);
  if (userId === null) {
    return adminFailure(401, "unauthenticated");
  }

  const role = await settle(() =>
    client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
  );
  if (!role.ok) {
    return adminFailure(503, "unavailable");
  }

  return decideRoleOutcome(role.value, userId);
}

/**
 * The closed result of one awaited SDK call.
 */
type Settled<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

/**
 * Awaits one SDK call and turns a rejection into a value, so a transport
 * failure is classified instead of escaping as an unhandled rejection. The
 * rejected error is never returned to the caller.
 */
async function settle<T>(
  action: () => PromiseLike<T>,
): Promise<Settled<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Decides the role lookup result.
 *
 * A missing admin row is forbidden, a failed lookup is unavailable and a row
 * that does not prove the admin role is not an admin role.
 */
function decideRoleOutcome(
  role: ShipaAuthRoleResponse,
  userId: string,
): ShipaAdminAuthorization {
  if (!isPlainRecord(role)) {
    return adminFailure(503, "unavailable");
  }
  if (role["error"] !== null && role["error"] !== undefined) {
    // The role lookup itself failed. The upstream error is dropped.
    return adminFailure(503, "unavailable");
  }

  const row = role["data"];
  if (row === null) {
    // No admin row: the caller is authenticated but not an administrator.
    return adminFailure(403, "forbidden");
  }
  if (!isPlainRecord(row)) {
    return adminFailure(503, "unavailable");
  }
  if (row["role"] !== "admin") {
    // A row that does not prove the admin role is not an admin role.
    return adminFailure(403, "forbidden");
  }

  return { ok: true, actor: { userId } };
}

function adminFailure(
  status: ShipaAuthStatus,
  code: ShipaAuthErrorCode,
): ShipaAdminAuthorizationFailure {
  return { ok: false, status, code };
}

/**
 * Reads the verified user id from a resolved session result.
 *
 * A resolved session error, a missing user, an unusable user object and a
 * user id that is not a real UUID all mean the same thing: there is no
 * verified session. The rest of the profile is never read.
 */
function readVerifiedUserId(session: ShipaAuthUserResponse): string | null {
  if (!isPlainRecord(session)) return null;
  if (session["error"] !== null && session["error"] !== undefined) return null;

  const data = session["data"];
  if (!isPlainRecord(data)) return null;

  const user = data["user"];
  if (!isPlainRecord(user)) return null;

  const id = user["id"];
  if (typeof id !== "string" || !isIntegrationUuid(id)) return null;
  return id.toLowerCase();
}

// ---------------------------------------------------------------------------
// Worker authorization
// ---------------------------------------------------------------------------

/**
 * The header the scheduler sends its dedicated dispatch key in.
 *
 * The key is a separate runtime secret from the service-role key, so a
 * scheduler call can be told apart from a service nudge.
 */
export const SHIPA_DISPATCH_KEY_HEADER = "x-shipa-dispatch-token";

/**
 * The injected worker credentials. Both are supplied by the caller; this
 * module never reads them from the environment.
 */
export interface ShipaWorkerCredentials {
  /** The service-role key a server-side nudge presents. */
  readonly serviceRoleKey: string;
  /** The scheduler's dedicated dispatch token. */
  readonly schedulerToken: string;
}

/**
 * Requires one of the injected worker credentials.
 *
 * The service check runs first. When both the service-role key and the
 * scheduler token are present and correct, the answer is `service`, so a
 * service nudge can never be recorded as a scheduler run.
 *
 * The scheduler check needs the exact, nonempty `x-shipa-dispatch-token`
 * header. An anon key, an administrator session, a missing header, a
 * malformed header and an empty configured value are all refused.
 *
 * This helper performs no I/O: it never calls the auth SDK, never calls SQL,
 * never records a heartbeat and never touches the environment.
 */
export function authorizeShipaWorker(
  request: Request,
  credentials: ShipaWorkerCredentials,
): ShipaWorkerAuthorization {
  const serviceRoleKey = credentials?.serviceRoleKey;
  if (typeof serviceRoleKey === "string" && serviceRoleKey.length > 0) {
    const presented = readBearerToken(request);
    if (
      presented !== null &&
      constantTimeSecretEquals(presented, serviceRoleKey)
    ) {
      return { ok: true, source: "service" };
    }
  }

  const schedulerToken = credentials?.schedulerToken;
  if (typeof schedulerToken === "string" && schedulerToken.length > 0) {
    const presented = request.headers.get(SHIPA_DISPATCH_KEY_HEADER);
    if (
      presented !== null &&
      constantTimeSecretEquals(presented, schedulerToken)
    ) {
      return { ok: true, source: "scheduler" };
    }
  }

  return { ok: false, status: 401, code: "unauthenticated" };
}

/**
 * Compares two secrets by their UTF-8 bytes.
 *
 * The bytes are compared without an early content exit: for two equal-length
 * byte sequences every byte is read, so the time taken does not depend on
 * where the first difference is. Two secrets of different byte lengths are
 * refused outright, and an empty secret never matches anything, not even
 * another empty secret.
 *
 * The comparison is over UTF-8 bytes rather than UTF-16 code units, so a
 * multi-byte character is compared as the bytes it actually is.
 */
export function constantTimeSecretEquals(
  left: string,
  right: string,
): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length === 0 || right.length === 0) return false;

  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

/**
 * The `Bearer` scheme, case-insensitive, with a nonempty token.
 *
 * A token may not contain whitespace, so a header that carries a scheme but
 * no token, or that carries several words, is refused instead of being
 * repaired.
 */
const BEARER_PATTERN = /^Bearer[ \t]+(\S+)$/i;

/**
 * Reads the bearer token of a request.
 *
 * A missing header, a header with another scheme and a header with an empty
 * token all return null. The token itself is not normalised: it is returned
 * exactly as the header carried it, so it is compared exactly as presented.
 */
function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = BEARER_PATTERN.exec(header.trim());
  if (match === null) return null;
  return match[1];
}
