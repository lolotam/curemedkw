// Shared structural validation for the Shipa submission SQL boundary.
// The manager split the original response module without changing its API.
import {
  isIntegrationUuid,
  isPlainRecord,
} from "./integration-credential-contract.ts";
import {
  isValidShipaOrderId,
  type ShipaOrderDraft,
  type ShipaPackageDraft,
  type ShipaPartyDraft,
} from "./shipa-contract.ts";
import {
  ShipaSubmissionError,
  type ShipaSubmissionJson,
} from "./shipa-submission-contract.ts";

const DRAFT_KEYS = [
  "customerRef",
  "orderType",
  "category",
  "autoConfirm",
  "pickupInstructions",
  "origin",
  "destination",
  "package",
] as const;

const PARTY_KEYS = [
  "country",
  "contactName",
  "contactNo",
  "city",
  "address",
] as const;

const PACKAGE_KEYS = [
  "customerRef",
  "name",
  "description",
  "weightKg",
  "lengthCm",
  "widthCm",
  "heightCm",
] as const;

/** The SQL-owned shape of a fingerprint or a payload hash. */
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

/** The shape a PostgreSQL timestamp takes inside a JSON document. */
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})?$/;

// ---------------------------------------------------------------------------
// Structural JSON comparison
// ---------------------------------------------------------------------------

/**
 * True when two JSON documents are structurally equal.
 *
 * Object key order is irrelevant and array order is significant, exactly as
 * PostgreSQL's `jsonb` equality behaves. No hash is computed and no
 * serialisation is invented: the comparison reads the documents.
 */
export function shipaJsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    const leftItems: readonly unknown[] = left;
    const rightItems: readonly unknown[] = right;
    if (leftItems.length !== rightItems.length) return false;
    return leftItems.every((item, index) =>
      shipaJsonEqual(item, rightItems[index])
    );
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) return false;
    return leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      shipaJsonEqual(left[key], right[key])
    );
  }
  return false;
}

/** True when a value is a JSON document this module can carry. */
export function isShipaSubmissionJson(
  value: unknown,
): value is ShipaSubmissionJson {
  if (value === null) return true;
  if (typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.every(isShipaSubmissionJson);
  }
  if (isPlainRecord(value)) {
    return Object.values(value).every(isShipaSubmissionJson);
  }
  return false;
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/**
 * Parses the SQL draft into the adapter's own draft type.
 *
 * The SQL shape is exact and closed: the root has eight members, a party has
 * five and a package has seven. The SQL never emits the optional `email` or
 * `coordinates` members, so an answer that carries one is refused instead of
 * being spread into the draft.
 *
 * The parser checks the shape only. Whether the draft is a legal order is the
 * business decision of the real `buildShipaOrderPayload`, which stays the
 * authority for it.
 */
export function parseShipaSubmissionDraft(raw: unknown): ShipaOrderDraft {
  if (!isPlainRecord(raw)) throw invalidResponse();
  if (!hasExactKeys(raw, DRAFT_KEYS)) throw invalidResponse();
  const customerRef = readString(raw["customerRef"]);
  const orderType = readString(raw["orderType"]);
  const category = readNullableString(raw["category"]);
  const autoConfirm = readBoolean(raw["autoConfirm"]);
  const pickupInstructions = readNullableString(raw["pickupInstructions"]);
  const origin = readParty(raw["origin"]);
  const destination = readParty(raw["destination"]);
  const pkg = readPackage(raw["package"]);
  if (
    customerRef === null || orderType === null || category === undefined ||
    autoConfirm === null || pickupInstructions === undefined ||
    origin === null || destination === null || pkg === null
  ) {
    throw invalidResponse();
  }
  return {
    customerRef,
    orderType,
    category,
    autoConfirm,
    ...(pickupInstructions !== null ? { pickupInstructions } : {}),
    origin,
    destination,
    package: pkg,
  };
}

function readParty(raw: unknown): ShipaPartyDraft | null {
  if (!isPlainRecord(raw)) return null;
  if (!hasExactKeys(raw, PARTY_KEYS)) return null;
  const country = readString(raw["country"]);
  const contactName = readString(raw["contactName"]);
  const contactNo = readString(raw["contactNo"]);
  const city = readString(raw["city"]);
  const address = readNullableString(raw["address"]);
  if (
    country === null || contactName === null || contactNo === null ||
    city === null || address === undefined
  ) {
    return null;
  }
  return {
    country,
    contactName,
    contactNo,
    city,
    ...(address !== null ? { address } : {}),
  };
}

function readPackage(raw: unknown): ShipaPackageDraft | null {
  if (!isPlainRecord(raw)) return null;
  if (!hasExactKeys(raw, PACKAGE_KEYS)) return null;
  const customerRef = readString(raw["customerRef"]);
  const name = readString(raw["name"]);
  const description = readNullableString(raw["description"]);
  const weightKg = readFiniteNumber(raw["weightKg"]);
  const lengthCm = readFiniteNumber(raw["lengthCm"]);
  const widthCm = readFiniteNumber(raw["widthCm"]);
  const heightCm = readFiniteNumber(raw["heightCm"]);
  if (
    customerRef === null || name === null || description === undefined ||
    weightKg === null || lengthCm === null || widthCm === null ||
    heightCm === null
  ) {
    return null;
  }
  return {
    customerRef,
    name,
    ...(description !== null ? { description } : {}),
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
  };
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

/** True when a record carries exactly the named own keys and nothing else. */
export function hasExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const present = Object.keys(record);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

export function invalidResponse(): ShipaSubmissionError {
  return new ShipaSubmissionError("invalid_response");
}

export function readUuid(value: unknown): string | null {
  return isIntegrationUuid(value) ? value.toLowerCase() : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Reads a member that is a string or JSON null.
 *
 * It returns `undefined` for a member that is neither, which is an unusable
 * answer rather than an absent value.
 */
function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readHex64(value: unknown): string | null {
  return typeof value === "string" && HEX_64_PATTERN.test(value) ? value : null;
}

export function readRevision(value: unknown, minimum: number): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value < minimum || value > 2147483647) return null;
  return value;
}

export function readCount(value: unknown, maximum: number): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) return null;
  return value;
}

export function readTimestamp(value: unknown): string | null {
  return typeof value === "string" && TIMESTAMP_PATTERN.test(value) &&
      Number.isFinite(Date.parse(value))
    ? value
    : null;
}

export function readNullableTimestamp(
  value: unknown,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return readTimestamp(value) ?? undefined;
}

export function readNullableReference(
  value: unknown,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return isValidShipaOrderId(value) ? value : undefined;
}

export function readNullableBoundedText(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return isBoundedText(value, maximum) ? value : undefined;
}

export function isBoundedText(value: string, maximum: number): boolean {
  if (value.length === 0 || value.length > maximum) return false;
  return !hasControlCharacter(value);
}

/**
 * True when a text carries a C0 control character or a delete character.
 *
 * The check walks the code points, so it never depends on an escape sequence
 * in this source file and never accepts an arbitrary upstream body.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function readJsonObject(value: unknown): ShipaSubmissionJson | null {
  if (!isPlainRecord(value)) return null;
  if (!isShipaSubmissionJson(value)) return null;
  return value;
}

// ---------------------------------------------------------------------------
// The SQL failure mapping
// ---------------------------------------------------------------------------

/**
 * Maps a rejected database call to a closed code.
 *
 * The mapping is by SQLSTATE only. Everything else — an unknown state, a
 * transport failure, a rejected promise — becomes `unavailable`. The SQL
 * message, detail and hint are never returned or attached.
 */
export function mapShipaSubmissionSqlError(
  error: unknown,
): ShipaSubmissionError {
  const sqlState = readSqlStateCode(error);
  if (
    sqlState === "40001" || sqlState === "23505" || sqlState === "40P01"
  ) {
    return new ShipaSubmissionError("conflict");
  }
  if (sqlState === "PGRST202") {
    return new ShipaSubmissionError("upgrade_required");
  }
  if (sqlState === "P0002") {
    return new ShipaSubmissionError("not_found");
  }
  if (sqlState === "42501") {
    return new ShipaSubmissionError("forbidden");
  }
  if (sqlState === "22023") {
    return new ShipaSubmissionError("invalid_request");
  }
  if (sqlState === "55000") {
    return new ShipaSubmissionError("ineligible");
  }
  return new ShipaSubmissionError("unavailable");
}

function readSqlStateCode(error: unknown): string | null {
  if (!isPlainRecord(error)) return null;
  const code = error["code"];
  return typeof code === "string" ? code.trim() : null;
}
