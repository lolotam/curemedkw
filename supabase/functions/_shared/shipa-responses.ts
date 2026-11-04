// Shipa Delivery V2 — bounded response parsing.
//
// Turns a provider document into a small, safe, normalised shape. It never
// returns the raw document, the raw body or an upstream error message, and it
// never invents a field the captured reference does not define.
//
// Source of truth:
//   docs/integrations/shipa-v2-contract.md
//   docs/integrations/shipa-v2-delivery-contract.json
//
// Strictness: a document that does not match the captured shape is reported
// as `invalid_response`. It is never softened into an empty successful
// result, because an empty list would look like "the provider has nothing"
// instead of "the provider answered something this adapter cannot use".
//
// Known reference inconsistencies, and how they are handled:
//   * `Country` lists a required `code` but declares no such property and
//     uses `isoAlpha3` instead. `code` is therefore never required.
//   * `City` lists required `code` and `country` but declares neither, and
//     defines only `name` and `state`. Only the defined properties are kept.
//   * `Tracking` lists a required `eta` but declares no such property, so
//     `eta` is kept when it is a string or a number and is never required.

import {
  isPlainRecord,
  SHIPA_MAX_CONTACT_NAME_LENGTH,
  SHIPA_MAX_PACKAGE_NAME_LENGTH,
  type ShipaFailureCode,
} from "./shipa-contract.ts";

// --- Bounds -----------------------------------------------------------------

/** Maximum length of a country name kept from a response. */
export const SHIPA_MAX_COUNTRY_NAME_LENGTH = 120;
/** Maximum length of a city name kept from a response. */
export const SHIPA_MAX_CITY_NAME_LENGTH = 120;
/** Maximum length of a status or story text kept from a response. */
export const SHIPA_MAX_STATUS_LENGTH = 120;
/** Maximum length of a provider reference kept from a response. */
export const SHIPA_MAX_RESPONSE_REFERENCE_LENGTH = 200;
/** Maximum number of cities accepted in one country document. */
export const SHIPA_MAX_CITY_COUNT = 5000;
/** Maximum number of countries accepted in one list document. */
export const SHIPA_MAX_COUNTRY_COUNT = 500;
/** Maximum number of history entries accepted in one story document. */
export const SHIPA_MAX_STORY_ENTRIES = 2000;

// --- Normalised shapes ------------------------------------------------------

/** The upstream service health. */
export type ShipaHealth = { readonly status: "OK" | "ERROR" };

/** One city of a country directory. */
export type ShipaCity = {
  readonly name: string;
  readonly state: string | null;
};

/** One country of the delivery directory. */
export interface ShipaCountry {
  readonly name: string;
  /** The ISO3 code, or null when the document does not carry one. */
  readonly isoAlpha3: string | null;
  readonly cities: readonly ShipaCity[];
}

/** The accepted outcome of a create call. */
export type ShipaCreateOutcome = {
  readonly shipaRef: string;
  readonly orderStatus: string | null;
};

/**
 * The identity facts of one party of a stored order. The contact phone, the
 * email and the street address are deliberately not copied out of the
 * provider document: the orchestration layer needs the reference and the
 * place facts, not a second copy of the customer data.
 */
export type ShipaOrderParty = {
  readonly contactName: string | null;
  readonly city: string | null;
  readonly country: string | null;
};
/** The identity facts of one stored package. */
export interface ShipaPackageDetail {
  readonly customerRef: string | null;
  readonly name: string | null;
  readonly shipaRef: string | null;
  readonly weight: number | null;
  readonly length: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * The normalised order detail. The provider locates the *first* order that
 * matches a customer reference, so `customerRef` is kept here so a caller
 * can check that the returned order is the one it meant. A lookup hit is not
 * proof of ownership and a lookup miss is not proof that nothing was created.
 */
export interface ShipaOrderDetail {
  readonly shipaRef: string | null;
  readonly customerRef: string | null;
  readonly customerRef2: string | null;
  readonly status: string | null;
  readonly storyStatusId: number | null;
  readonly storyStatusText: string | null;
  readonly type: string | null;
  readonly category: string | null;
  readonly readyForDelivery: boolean | null;
  readonly chargeableWeight: number | null;
  readonly origin: ShipaOrderParty | null;
  readonly destination: ShipaOrderParty | null;
  readonly packages: readonly ShipaPackageDetail[];
}

/** One history entry. */
export interface ShipaStoryEntry {
  readonly status: string | null;
  readonly statusCode: string | null;
  /**
   * The state time exactly as the provider reports it. The captured
   * reference states a numeric UTC timestamp but not its unit, so no
   * conversion is invented here.
   */
  readonly date: number | null;
}

/** A geographical point. */
export type ShipaGeoPoint = {
  readonly latitude: number;
  readonly longitude: number;
};

/** A measured value with its optional text form. */
export type ShipaMeasure = {
  readonly text: string | null;
  readonly value: number | null;
};

/**
 * The live courier position. The provider legitimately answers `null`
 * outside the pickup or delivery window, so a missing position is a valid
 * answer and not an error.
 */
export type ShipaTracking =
  | { readonly available: false }
  | {
    readonly available: true;
    readonly location: ShipaGeoPoint;
    readonly eta: string | number | null;
    readonly duration: ShipaMeasure | null;
    readonly distance: ShipaMeasure | null;
  };

// --- Parse results ----------------------------------------------------------

/** The closed set of parse failures. */
export type ShipaParseFailureCode = Extract<
  ShipaFailureCode,
  "invalid_response" | "missing_reference"
>;

/** The result of parsing one provider document. */
export type ShipaParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ShipaParseFailureCode };

const INVALID_RESPONSE: ShipaParseResult<never> = {
  ok: false,
  code: "invalid_response",
};

// --- Field readers ----------------------------------------------------------

interface Field<T> {
  readonly present: boolean;
  readonly valid: boolean;
  readonly value: T | null;
}

/**
 * Reads one field. An absent or null field is not an error; a field of the
 * wrong shape or beyond its bound is.
 */
function readField<T>(
  record: Record<string, unknown>,
  key: string,
  parse: (raw: unknown) => T | null,
): Field<T> {
  if (!(key in record)) return { present: false, valid: true, value: null };
  const raw = record[key];
  if (raw === null || raw === undefined) {
    return { present: false, valid: true, value: null };
  }
  const value = parse(raw);
  if (value === null) return { present: true, valid: false, value: null };
  return { present: true, valid: true, value };
}

function boundedString(maxLength: number): (raw: unknown) => string | null {
  return (raw: unknown): string | null => {
    if (typeof raw !== "string") return null;
    if (raw.length === 0 || raw.length > maxLength) return null;
    return raw;
  };
}

function finiteNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function integerNumber(raw: unknown): number | null {
  const value = finiteNumber(raw);
  if (value === null || !Number.isInteger(value)) return null;
  return value;
}

function booleanValue(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}

const readStatus = boundedString(SHIPA_MAX_STATUS_LENGTH);
const readReference = boundedString(SHIPA_MAX_RESPONSE_REFERENCE_LENGTH);
const readCityName = boundedString(SHIPA_MAX_CITY_NAME_LENGTH);
const readCountryName = boundedString(SHIPA_MAX_COUNTRY_NAME_LENGTH);

// --- Parsers ----------------------------------------------------------------

/** Parses the health document. */
export function parseShipaHealth(
  payload: unknown,
): ShipaParseResult<ShipaHealth> {
  const record = isPlainRecord(payload) ? payload : null;
  if (record === null) return INVALID_RESPONSE;
  const status = readField(record, "status", readStatus);
  if (!status.valid || status.value === null) return INVALID_RESPONSE;
  if (status.value !== "OK" && status.value !== "ERROR") {
    return INVALID_RESPONSE;
  }
  return { ok: true, value: { status: status.value } };
}

function parseCities(value: unknown): readonly ShipaCity[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const cities: ShipaCity[] = [];
  for (const entry of value) {
    const record = isPlainRecord(entry) ? entry : null;
    if (record === null) return null;
    const name = readField(record, "name", readCityName);
    if (!name.valid || name.value === null) return null;
    const state = readField(record, "state", readCityName);
    if (!state.valid) return null;
    cities.push({ name: name.value, state: state.value });
    if (cities.length > SHIPA_MAX_CITY_COUNT) return null;
  }
  return cities;
}

/** Parses one country document. */
export function parseShipaCountry(
  payload: unknown,
): ShipaParseResult<ShipaCountry> {
  const record = isPlainRecord(payload) ? payload : null;
  if (record === null) return INVALID_RESPONSE;
  const name = readField(record, "name", readCountryName);
  if (!name.valid || name.value === null) return INVALID_RESPONSE;
  const isoAlpha3 = readField(record, "isoAlpha3", boundedString(3));
  if (!isoAlpha3.valid) return INVALID_RESPONSE;
  if (isoAlpha3.value !== null && !/^[A-Z]{3}$/.test(isoAlpha3.value)) {
    return INVALID_RESPONSE;
  }
  const cities = parseCities(record["cities"]);
  if (cities === null) return INVALID_RESPONSE;
  return {
    ok: true,
    value: { name: name.value, isoAlpha3: isoAlpha3.value, cities },
  };
}

/** Parses the country list document. */
export function parseShipaCountryList(
  payload: unknown,
): ShipaParseResult<ShipaCountry[]> {
  if (!Array.isArray(payload)) return INVALID_RESPONSE;
  const countries: ShipaCountry[] = [];
  for (const entry of payload) {
    const parsed = parseShipaCountry(entry);
    if (!parsed.ok) return INVALID_RESPONSE;
    countries.push(parsed.value);
    if (countries.length > SHIPA_MAX_COUNTRY_COUNT) return INVALID_RESPONSE;
  }
  return { ok: true, value: countries };
}

/**
 * Parses the create response. A usable provider reference is required; a
 * 2xx document without one is not an accepted creation.
 */
export function parseShipaCreateResponse(
  payload: unknown,
): ShipaParseResult<ShipaCreateOutcome> {
  const record = isPlainRecord(payload) ? payload : null;
  if (record === null) return INVALID_RESPONSE;
  const rawRef = record["shipaRef"];
  if (rawRef === undefined || rawRef === null) {
    return { ok: false, code: "missing_reference" };
  }
  if (typeof rawRef !== "string") return INVALID_RESPONSE;
  if (rawRef.trim().length === 0) {
    return { ok: false, code: "missing_reference" };
  }
  if (rawRef.length > SHIPA_MAX_RESPONSE_REFERENCE_LENGTH) {
    return INVALID_RESPONSE;
  }
  const orderStatus = readField(record, "orderStatus", readStatus);
  if (!orderStatus.valid) return INVALID_RESPONSE;
  return {
    ok: true,
    value: { shipaRef: rawRef, orderStatus: orderStatus.value },
  };
}

function parseParty(value: unknown): ShipaOrderParty | null {
  if (value === undefined || value === null) return null;
  const record = isPlainRecord(value) ? value : null;
  if (record === null) return null;
  const contactName = readField(
    record,
    "contactName",
    boundedString(SHIPA_MAX_CONTACT_NAME_LENGTH),
  );
  const city = readField(record, "city", readCityName);
  const country = readField(record, "country", boundedString(3));
  if (!contactName.valid || !city.valid || !country.valid) return null;
  return {
    contactName: contactName.value,
    city: city.value,
    country: country.value,
  };
}

function parsePackageDetails(
  value: unknown,
): readonly ShipaPackageDetail[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const packages: ShipaPackageDetail[] = [];
  for (const entry of value) {
    const record = isPlainRecord(entry) ? entry : null;
    if (record === null) return null;
    const customerRef = readField(record, "customerRef", readReference);
    const name = readField(
      record,
      "name",
      boundedString(SHIPA_MAX_PACKAGE_NAME_LENGTH),
    );
    const shipaRef = readField(record, "shipaRef", readReference);
    const weight = readField(record, "weight", finiteNumber);
    const length = readField(record, "length", finiteNumber);
    const width = readField(record, "width", finiteNumber);
    const height = readField(record, "height", finiteNumber);
    if (
      !customerRef.valid || !name.valid || !shipaRef.valid ||
      !weight.valid || !length.valid || !width.valid || !height.valid
    ) {
      return null;
    }
    packages.push({
      customerRef: customerRef.value,
      name: name.value,
      shipaRef: shipaRef.value,
      weight: weight.value,
      length: length.value,
      width: width.value,
      height: height.value,
    });
  }
  return packages;
}

/** Parses the order detail document. */
export function parseShipaOrderDetail(
  payload: unknown,
): ShipaParseResult<ShipaOrderDetail> {
  const record = isPlainRecord(payload) ? payload : null;
  if (record === null) return INVALID_RESPONSE;
  const shipaRef = readField(record, "shipaRef", readReference);
  const customerRef = readField(record, "customerRef", readReference);
  const customerRef2 = readField(record, "customerRef2", readReference);
  const status = readField(record, "status", readStatus);
  const storyStatusText = readField(record, "storyStatusText", readStatus);
  const type = readField(record, "type", readStatus);
  const category = readField(record, "category", readStatus);
  const storyStatusId = readField(record, "storyStatusId", integerNumber);
  const chargeableWeight = readField(record, "chargeableWeight", finiteNumber);
  const readyForDelivery = readField(record, "readyForDelivery", booleanValue);
  if (
    !shipaRef.valid || !customerRef.valid || !customerRef2.valid ||
    !status.valid || !storyStatusText.valid || !type.valid || !category.valid ||
    !storyStatusId.valid || !chargeableWeight.valid || !readyForDelivery.valid
  ) {
    return INVALID_RESPONSE;
  }
  const origin = parseParty(record["origin"]);
  if (origin === null) return INVALID_RESPONSE;
  const destination = parseParty(record["destination"]);
  if (destination === null) return INVALID_RESPONSE;
  const packages = parsePackageDetails(record["packages"]);
  if (packages === null) return INVALID_RESPONSE;
  return {
    ok: true,
    value: {
      shipaRef: shipaRef.value,
      customerRef: customerRef.value,
      customerRef2: customerRef2.value,
      status: status.value,
      storyStatusId: storyStatusId.value,
      storyStatusText: storyStatusText.value,
      type: type.value,
      category: category.value,
      readyForDelivery: readyForDelivery.value,
      chargeableWeight: chargeableWeight.value,
      origin,
      destination,
      packages,
    },
  };
}

/** Parses the order history document. */
export function parseShipaOrderStory(
  payload: unknown,
): ShipaParseResult<ShipaStoryEntry[]> {
  if (!Array.isArray(payload)) return INVALID_RESPONSE;
  const entries: ShipaStoryEntry[] = [];
  for (const entry of payload) {
    const record = isPlainRecord(entry) ? entry : null;
    if (record === null) return INVALID_RESPONSE;
    const status = readField(record, "status", readStatus);
    const statusCode = readField(record, "statusCode", readStatus);
    const date = readField(record, "date", finiteNumber);
    if (!status.valid || !statusCode.valid || !date.valid) {
      return INVALID_RESPONSE;
    }
    entries.push({
      status: status.value,
      statusCode: statusCode.value,
      date: date.value,
    });
    if (entries.length > SHIPA_MAX_STORY_ENTRIES) return INVALID_RESPONSE;
  }
  return { ok: true, value: entries };
}

function parseGeoPoint(value: unknown): ShipaGeoPoint | null {
  const record = isPlainRecord(value) ? value : null;
  if (record === null) return null;
  const latitude = record["latitude"];
  const longitude = record["longitude"];
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    latitude < -90 || latitude > 90
  ) {
    return null;
  }
  if (
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    longitude < -180 || longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function parseMeasure(value: unknown): ShipaMeasure | null {
  if (value === undefined || value === null) return null;
  const record = isPlainRecord(value) ? value : null;
  if (record === null) return null;
  const text = readField(record, "text", readStatus);
  const amount = readField(record, "value", integerNumber);
  if (!text.valid || !amount.valid) return null;
  return { text: text.value, value: amount.value };
}

/**
 * Parses the tracking document. `null` is a legitimate answer: the provider
 * reports no live position outside the pickup or delivery window.
 */
export function parseShipaTracking(
  payload: unknown,
): ShipaParseResult<ShipaTracking> {
  if (payload === null) return { ok: true, value: { available: false } };
  const record = isPlainRecord(payload) ? payload : null;
  if (record === null) return INVALID_RESPONSE;
  const location = parseGeoPoint(record["location"]);
  if (location === null) return INVALID_RESPONSE;

  const rawEta = record["eta"];
  let eta: string | number | null = null;
  if (rawEta !== undefined && rawEta !== null) {
    if (typeof rawEta === "string") {
      if (rawEta.length === 0 || rawEta.length > SHIPA_MAX_STATUS_LENGTH) {
        return INVALID_RESPONSE;
      }
      eta = rawEta;
    } else if (typeof rawEta === "number") {
      if (!Number.isFinite(rawEta)) return INVALID_RESPONSE;
      eta = rawEta;
    } else {
      return INVALID_RESPONSE;
    }
  }

  const duration = parseMeasure(record["duration"]);
  if (
    duration === null && record["duration"] !== undefined &&
    record["duration"] !== null
  ) {
    return INVALID_RESPONSE;
  }
  const distance = parseMeasure(record["distance"]);
  if (
    distance === null && record["distance"] !== undefined &&
    record["distance"] !== null
  ) {
    return INVALID_RESPONSE;
  }

  return {
    ok: true,
    value: { available: true, location, eta, duration, distance },
  };
}
