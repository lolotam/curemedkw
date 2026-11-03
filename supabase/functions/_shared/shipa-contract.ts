// Shipa Delivery V2 — captured contract, request validation, payload build.
//
// The pure half of the Shipa adapter: no network access, no environment
// access, no logging. It owns the protocol vocabulary captured from the
// account reference, the local validation rules for a create-order request,
// and the single mapping from a Curemed-side draft to the captured `Order`
// wire shape with the documented units.
//
// Source of truth:
//   docs/integrations/shipa-v2-contract.md
//   docs/integrations/shipa-v2-delivery-contract.json
// Nothing here is invented. Where the reference is silent or self
// contradictory the conservative reading is used and the deviation is noted
// next to the code.
//
// Trust boundary: every value passed to `buildShipaOrderPayload` is server
// owned. The saved configuration supplies the origin, the category and
// `autoConfirm`; the paid-order snapshot supplies the reference, the
// destination and the parcel. This module never derives payment evidence,
// never reprices an order and never accepts a browser payment flag.

// --- Environments, origins and the captured order vocabulary ----------------

/** The two Shipa environments Curemed keeps separate. */
export const SHIPA_ENVIRONMENTS = ["sandbox", "live"] as const;
export type ShipaEnvironment = (typeof SHIPA_ENVIRONMENTS)[number];

/**
 * The fixed origins captured from the account reference. No caller may
 * supply a host, and no request is forwarded to a provider-returned or
 * user-supplied URL.
 */
export const SHIPA_BASE_URLS: Readonly<Record<ShipaEnvironment, string>> = {
  sandbox: "https://sandbox-api.shipadelivery.com/v2",
  live: "https://api.shipadelivery.com/v2",
};

/** Kuwait ISO3 code as the reference uses it for delivery countries. */
export const SHIPA_KUWAIT_COUNTRY_CODE = "KWT";

export function isShipaEnvironment(value: unknown): value is ShipaEnvironment {
  return typeof value === "string" &&
    (SHIPA_ENVIRONMENTS as readonly string[]).includes(value);
}

/** The order types the reference declares. Only `Delivery` is in scope. */
export const SHIPA_ORDER_TYPES = ["Delivery", "Pickup"] as const;

/**
 * The complete category vocabulary the reference declares. It is a
 * vocabulary, not evidence that the account is entitled to each service.
 */
export const SHIPA_DOCUMENTED_CATEGORIES = [
  "On Demand",
  "Same Day",
  "Next Day",
  "Cross Border",
] as const;

/**
 * The categories this integration may send. Kuwait domestic delivery only:
 * `Cross Border` is excluded by scope, not by entitlement.
 */
export const SHIPA_ALLOWED_CATEGORIES = [
  "On Demand",
  "Same Day",
  "Next Day",
] as const;
export type ShipaCategory = (typeof SHIPA_ALLOWED_CATEGORIES)[number];

/** The reference documents `Doorstep` as the destination default. */
export const SHIPA_DESTINATION_TYPE = "Doorstep";

// --- Field limits -----------------------------------------------------------

/**
 * The contact name, address and package description maxima come from the
 * captured schema. The city, package name, email and reference bounds are
 * local guards: the reference states no maximum for them.
 */
export const SHIPA_MAX_CONTACT_NAME_LENGTH = 150;
export const SHIPA_MAX_ADDRESS_LENGTH = 1000;
export const SHIPA_MAX_PACKAGE_DESCRIPTION_LENGTH = 1000;
export const SHIPA_MAX_REFERENCE_LENGTH = 64;
export const SHIPA_MAX_ORDER_ID_LENGTH = 200;
export const SHIPA_MAX_CITY_LENGTH = 120;
export const SHIPA_MAX_PACKAGE_NAME_LENGTH = 200;
export const SHIPA_MAX_EMAIL_LENGTH = 254;

/**
 * Characters a reference may contain. The value is percent encoded when it
 * becomes a path segment, and it is restricted here so that no separator,
 * control character or path segment can reach the provider.
 */
const SHIPA_SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9._~-]+$/;

/**
 * Kuwait numbers in international format: `+965` followed by eight digits.
 * The reference rejects a fake number upstream, so the local check only
 * enforces the documented shape.
 */
const SHIPA_KUWAIT_PHONE_PATTERN = /^\+965\d{8}$/;

/** True when the value is a Kuwait phone number in international format. */
export function isValidKuwaitPhone(value: string): boolean {
  return value.length === 12 && SHIPA_KUWAIT_PHONE_PATTERN.test(value);
}

/**
 * The reference-safety rules live in one place so the merchant reference,
 * the package reference and the provider reference cannot drift apart. A dot
 * segment is refused because the URL parser would normalise it away and
 * change the request path.
 */
function matchesSafeReferencePattern(value: string): boolean {
  if (value === "." || value === "..") return false;
  return SHIPA_SAFE_REFERENCE_PATTERN.test(value) &&
    !/[^A-Za-z0-9._~-]/.test(value);
}

/** A Curemed-owned merchant or package reference. */
export function isValidShipaReference(value: string): boolean {
  if (value.length === 0 || value.length > SHIPA_MAX_REFERENCE_LENGTH) {
    return false;
  }
  return matchesSafeReferencePattern(value);
}

/** A provider reference used as a path segment. */
export function isValidShipaOrderId(value: string): boolean {
  if (value.length === 0 || value.length > SHIPA_MAX_ORDER_ID_LENGTH) {
    return false;
  }
  return matchesSafeReferencePattern(value);
}

// --- Failure vocabulary -----------------------------------------------------

/**
 * The closed set of failure codes the adapter can report. Nothing outside
 * this list is ever returned to a caller, and no upstream text, URL or body
 * is ever attached to a code. `invalid_request` and `invalid_order_ref` are
 * local refusals with no network call; the rest describe the transport, the
 * status or a body the adapter could not use.
 */
export type ShipaFailureCode =
  | "invalid_request"
  | "invalid_order_ref"
  | "timeout"
  | "network_error"
  | "redirect_refused"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "server_error"
  | "unexpected_status"
  | "malformed_response"
  | "invalid_response"
  | "response_too_large"
  | "missing_reference";

/**
 * The closed set of local rejections. A local rejection is proof that no
 * request was sent, so it is never confused with a provider outcome.
 */
export type ShipaLocalRejectionCode =
  | "unexpected_field"
  | "invalid_customer_ref"
  | "invalid_package_ref"
  | "invalid_order_type"
  | "missing_category"
  | "invalid_category"
  | "cross_border_not_supported"
  | "invalid_auto_confirm"
  | "invalid_country"
  | "invalid_contact_name"
  | "invalid_contact_phone"
  | "invalid_city"
  | "invalid_address"
  | "invalid_email"
  | "invalid_coordinates"
  | "invalid_package_name"
  | "invalid_package_description"
  | "invalid_package_weight"
  | "invalid_package_dimensions";

/** A local rejection. The message is safe text; it never contains a value. */
export interface ShipaLocalRejection {
  readonly code: ShipaLocalRejectionCode;
  /** The dotted path of the offending field. */
  readonly field: string;
  readonly message: string;
}

// --- Draft (server owned) and payload (wire) shapes --------------------------

export type ShipaCoordinatesDraft = {
  readonly latitude: number;
  readonly longitude: number;
};

/**
 * One party of a shipment. The origin comes from the saved warehouse
 * configuration, the destination from the paid-order snapshot. An address is
 * optional in the captured schema and is never invented here.
 */
export type ShipaPartyDraft = {
  readonly country: string;
  readonly contactName: string;
  readonly contactNo: string;
  readonly city: string;
  readonly address?: string;
  readonly email?: string;
  readonly coordinates?: ShipaCoordinatesDraft;
};

/** One parcel: dimensions in centimetres, weight in kilograms. */
export type ShipaPackageDraft = {
  readonly customerRef: string;
  readonly name: string;
  readonly description?: string;
  readonly weightKg: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
};

/**
 * The complete server-owned input of a create-order call. `origin`,
 * `category` and `autoConfirm` come from the saved configuration;
 * `customerRef`, `destination` and `package` come from the paid-order
 * snapshot and the stable shipment intent. The caller must have established
 * the paid evidence before calling.
 */
export type ShipaOrderDraft = {
  readonly customerRef: string;
  readonly orderType: string;
  readonly category: string | null;
  readonly autoConfirm: boolean;
  /** Merchant collection window and call-before-collection instructions. */
  readonly pickupInstructions?: string;
  readonly origin: ShipaPartyDraft;
  readonly destination: ShipaPartyDraft;
  readonly package: ShipaPackageDraft;
};

/** The wire `GeoPoint`; it carries the same pair as the draft coordinates. */
export type ShipaCoordinatesPayload = ShipaCoordinatesDraft;

/** The wire party shared by origin and destination. */
export interface ShipaPartyPayload {
  readonly contactName: string;
  readonly contactNo: string;
  readonly city: string;
  readonly country: typeof SHIPA_KUWAIT_COUNTRY_CODE;
  readonly address?: string;
  readonly email?: string;
  readonly coordinates?: ShipaCoordinatesPayload;
}

/** The wire destination; doorstep only, and never a collection point. */
export interface ShipaDestinationPayload extends ShipaPartyPayload {
  readonly type: typeof SHIPA_DESTINATION_TYPE;
  /**
   * The courier collection amount. This adapter only creates prepaid
   * shipments, so it is always zero: the customer has already paid and must
   * never be charged again.
   */
  readonly options: { readonly amountToCollect: 0 };
}

/** The wire package. */
export interface ShipaPackagePayload {
  readonly customerRef: string;
  readonly name: string;
  readonly description?: string;
  /** Kilograms. */
  readonly weight: number;
  /** Centimetres. */
  readonly length: number;
  /** Centimetres. */
  readonly width: number;
  /** Centimetres. */
  readonly height: number;
}

/** The wire `Order`. */
export interface ShipaOrderPayload {
  readonly customerRef: string;
  readonly type: "Delivery";
  readonly category: ShipaCategory;
  readonly autoConfirm: boolean;
  readonly origin: ShipaPartyPayload & {
    readonly options?: { readonly specialInstructions: string };
  };
  readonly destination: ShipaDestinationPayload;
  readonly packages: readonly ShipaPackagePayload[];
}

/** The result of building a payload. */
export type ShipaPayloadBuildResult =
  | { readonly ok: true; readonly payload: ShipaOrderPayload }
  | ({ readonly ok: false } & ShipaLocalRejection);

// --- Helpers ----------------------------------------------------------------

/** True for a plain object that can carry named fields. */
export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ORDER_DRAFT_KEYS: readonly string[] = [
  "customerRef",
  "orderType",
  "category",
  "autoConfirm",
  "pickupInstructions",
  "origin",
  "destination",
  "package",
];
const PARTY_DRAFT_KEYS: readonly string[] = [
  "country",
  "contactName",
  "contactNo",
  "city",
  "address",
  "email",
  "coordinates",
];
const PACKAGE_DRAFT_KEYS: readonly string[] = [
  "customerRef",
  "name",
  "description",
  "weightKg",
  "lengthCm",
  "widthCm",
  "heightCm",
];

/**
 * Returns the first field that the captured schema does not define, so an
 * unexpected or authority-bearing field is rejected instead of being
 * silently serialised into a provider request.
 */
function findUnexpectedKey(
  value: unknown,
  allowed: readonly string[],
): string | null {
  if (!isPlainRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

function fail(
  code: ShipaLocalRejectionCode,
  field: string,
  message: string,
): ShipaLocalRejection {
  return { code, field, message };
}

function isBoundedString(value: unknown, maxLength: number): boolean {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength;
}

function isEmail(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 &&
    value.length <= SHIPA_MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// --- Local validation -------------------------------------------------------

/**
 * Validates the optional coordinates. The captured schema wrongly describes
 * the latitude range as 180 degrees, so the geographic 90 degree limit is
 * kept.
 */
function validateCoordinates(
  value: unknown,
  field: string,
): ShipaLocalRejection | null {
  if (!isPlainRecord(value)) {
    return fail(
      "invalid_coordinates",
      field,
      "The coordinates must be an object with a latitude and a longitude.",
    );
  }
  if (findUnexpectedKey(value, ["latitude", "longitude"]) !== null) {
    return fail(
      "invalid_coordinates",
      field,
      "The coordinates contain unsupported fields.",
    );
  }
  const latitude = value["latitude"];
  const longitude = value["longitude"];
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    latitude < -90 || latitude > 90
  ) {
    return fail(
      "invalid_coordinates",
      `${field}.latitude`,
      "The latitude must be a finite number between -90 and 90.",
    );
  }
  if (
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    longitude < -180 || longitude > 180
  ) {
    return fail(
      "invalid_coordinates",
      `${field}.longitude`,
      "The longitude must be a finite number between -180 and 180.",
    );
  }
  return null;
}

/** Validates one party of a shipment. */
function validateParty(
  party: ShipaPartyDraft,
  field: string,
): ShipaLocalRejection | null {
  if (!isPlainRecord(party)) {
    return fail(
      "unexpected_field",
      field,
      "A shipment contact object is required.",
    );
  }
  const unexpected = findUnexpectedKey(party, PARTY_DRAFT_KEYS);
  if (unexpected !== null) {
    return fail(
      "unexpected_field",
      field,
      "The shipment contact contains unsupported fields.",
    );
  }
  if (party.country !== SHIPA_KUWAIT_COUNTRY_CODE) {
    return fail(
      "invalid_country",
      `${field}.country`,
      "Only Kuwait (KWT) domestic delivery is supported.",
    );
  }
  if (!isBoundedString(party.contactName, SHIPA_MAX_CONTACT_NAME_LENGTH)) {
    return fail(
      "invalid_contact_name",
      `${field}.contactName`,
      `The contact name is required and must be at most ${SHIPA_MAX_CONTACT_NAME_LENGTH} characters.`,
    );
  }
  if (
    typeof party.contactNo !== "string" || !isValidKuwaitPhone(party.contactNo)
  ) {
    return fail(
      "invalid_contact_phone",
      `${field}.contactNo`,
      "The contact phone must be a Kuwait number in international format, for example +965XXXXXXXX.",
    );
  }
  if (!isBoundedString(party.city, SHIPA_MAX_CITY_LENGTH)) {
    return fail(
      "invalid_city",
      `${field}.city`,
      "The city is required and must come from the country directory.",
    );
  }
  if (
    party.address !== undefined &&
    !isBoundedString(party.address, SHIPA_MAX_ADDRESS_LENGTH)
  ) {
    return fail(
      "invalid_address",
      `${field}.address`,
      `The address must not be empty and must be at most ${SHIPA_MAX_ADDRESS_LENGTH} characters.`,
    );
  }
  if (party.email !== undefined && !isEmail(party.email)) {
    return fail(
      "invalid_email",
      `${field}.email`,
      "The contact email is not a valid address.",
    );
  }
  if (party.coordinates !== undefined) {
    const problem = validateCoordinates(
      party.coordinates,
      `${field}.coordinates`,
    );
    if (problem !== null) return problem;
  }
  return null;
}

/** Validates one parcel. */
function validatePackage(
  pkg: ShipaPackageDraft,
  field: string,
): ShipaLocalRejection | null {
  if (!isPlainRecord(pkg)) {
    return fail(
      "unexpected_field",
      field,
      "A shipment package object is required.",
    );
  }
  const unexpected = findUnexpectedKey(pkg, PACKAGE_DRAFT_KEYS);
  if (unexpected !== null) {
    return fail(
      "unexpected_field",
      field,
      "The shipment package contains unsupported fields.",
    );
  }
  if (
    typeof pkg.customerRef !== "string" ||
    !isValidShipaReference(pkg.customerRef)
  ) {
    return fail(
      "invalid_package_ref",
      `${field}.customerRef`,
      "The package reference is required and must be a stable, safe reference.",
    );
  }
  if (!isBoundedString(pkg.name, SHIPA_MAX_PACKAGE_NAME_LENGTH)) {
    return fail(
      "invalid_package_name",
      `${field}.name`,
      `The package name is required and must be at most ${SHIPA_MAX_PACKAGE_NAME_LENGTH} characters.`,
    );
  }
  if (
    pkg.description !== undefined &&
    (typeof pkg.description !== "string" ||
      pkg.description.length > SHIPA_MAX_PACKAGE_DESCRIPTION_LENGTH)
  ) {
    return fail(
      "invalid_package_description",
      `${field}.description`,
      `The package description must be at most ${SHIPA_MAX_PACKAGE_DESCRIPTION_LENGTH} characters.`,
    );
  }
  if (
    typeof pkg.weightKg !== "number" || !Number.isFinite(pkg.weightKg) ||
    pkg.weightKg <= 0
  ) {
    return fail(
      "invalid_package_weight",
      `${field}.weightKg`,
      "The package weight must be a positive number of kilograms.",
    );
  }
  const dimensions = [["lengthCm", pkg.lengthCm], ["widthCm", pkg.widthCm], [
    "heightCm",
    pkg.heightCm,
  ]] as const;
  for (const [name, dimension] of dimensions) {
    if (
      typeof dimension !== "number" || !Number.isFinite(dimension) ||
      dimension <= 0
    ) {
      return fail(
        "invalid_package_dimensions",
        `${field}.${name}`,
        "Every package dimension must be a positive number of centimetres.",
      );
    }
  }
  return null;
}

/** Validates the whole draft in a stable order. */
function validateOrderDraft(
  draft: ShipaOrderDraft,
): ShipaLocalRejection | null {
  if (!isPlainRecord(draft)) {
    return fail(
      "unexpected_field",
      "order",
      "A shipment order object is required.",
    );
  }
  const unexpected = findUnexpectedKey(draft, ORDER_DRAFT_KEYS);
  if (unexpected !== null) {
    return fail(
      "unexpected_field",
      "order",
      "The shipment order contains unsupported fields.",
    );
  }
  if (
    typeof draft.customerRef !== "string" ||
    !isValidShipaReference(draft.customerRef)
  ) {
    return fail(
      "invalid_customer_ref",
      "order.customerRef",
      "The customer reference is required and must be a stable, safe reference.",
    );
  }
  if (draft.orderType !== "Delivery") {
    return fail(
      "invalid_order_type",
      "order.orderType",
      "Only a delivery order is supported by this integration.",
    );
  }
  if (draft.category === null || draft.category === undefined) {
    return fail(
      "missing_category",
      "order.category",
      "The service category must be chosen explicitly; it is never defaulted.",
    );
  }
  if (draft.category === "Cross Border") {
    return fail(
      "cross_border_not_supported",
      "order.category",
      "Cross border delivery is not part of this Kuwait domestic integration.",
    );
  }
  if (
    !(SHIPA_ALLOWED_CATEGORIES as readonly string[]).includes(draft.category)
  ) {
    return fail(
      "invalid_category",
      "order.category",
      "The service category is not one of the supported Kuwait domestic categories.",
    );
  }
  if (typeof draft.autoConfirm !== "boolean") {
    return fail(
      "invalid_auto_confirm",
      "order.autoConfirm",
      "autoConfirm must be an explicit boolean taken from the saved account configuration.",
    );
  }
  if (
    draft.pickupInstructions !== undefined &&
    !isBoundedString(draft.pickupInstructions, SHIPA_MAX_ADDRESS_LENGTH)
  ) {
    return fail(
      "unexpected_field",
      "order.pickupInstructions",
      "Pickup instructions must be nonempty and at most 1000 characters.",
    );
  }
  const origin = validateParty(draft.origin, "origin");
  if (origin !== null) return origin;
  const destination = validateParty(draft.destination, "destination");
  if (destination !== null) return destination;
  return validatePackage(draft.package, "package");
}

// --- Payload build ----------------------------------------------------------

function toPartyPayload(party: ShipaPartyDraft): ShipaPartyPayload {
  const coordinates = party.coordinates;
  return {
    contactName: party.contactName,
    contactNo: party.contactNo,
    city: party.city,
    country: SHIPA_KUWAIT_COUNTRY_CODE,
    ...(party.address !== undefined ? { address: party.address } : {}),
    ...(party.email !== undefined ? { email: party.email } : {}),
    ...(coordinates !== undefined
      ? {
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
      }
      : {}),
  };
}

function toPackagePayload(pkg: ShipaPackageDraft): ShipaPackagePayload {
  return {
    customerRef: pkg.customerRef,
    name: pkg.name,
    ...(pkg.description !== undefined ? { description: pkg.description } : {}),
    weight: pkg.weightKg,
    length: pkg.lengthCm,
    width: pkg.widthCm,
    height: pkg.heightCm,
  };
}

/**
 * Validates a server-owned draft and maps it to the captured `Order` shape.
 *
 * The builder is deliberately strict: an unexpected field is refused instead
 * of being serialised, the category must be explicit, the order type must be
 * `Delivery`, both countries must be `KWT`, `Cross Border` is refused, and
 * the collection amount is fixed at zero because this adapter only creates
 * prepaid shipments.
 */
export function buildShipaOrderPayload(
  draft: ShipaOrderDraft,
): ShipaPayloadBuildResult {
  const problem = validateOrderDraft(draft);
  if (problem !== null) {
    return { ok: false, ...problem };
  }
  return {
    ok: true,
    payload: {
      customerRef: draft.customerRef,
      type: "Delivery",
      category: draft.category as ShipaCategory,
      autoConfirm: draft.autoConfirm,
      origin: {
        ...toPartyPayload(draft.origin),
        ...(draft.pickupInstructions === undefined
          ? {}
          : { options: { specialInstructions: draft.pickupInstructions } }),
      },
      destination: {
        ...toPartyPayload(draft.destination),
        type: SHIPA_DESTINATION_TYPE,
        options: { amountToCollect: 0 },
      },
      packages: [toPackagePayload(draft.package)],
    },
  };
}
