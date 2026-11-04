// Synthetic fixtures for the Shipa readiness service tests.
//
// Nothing in this file talks to Shipa. The provider documents are synthetic:
// no credential, no customer data, no real address and no real phone number.
//
// Only the SDK boundary and the fetch boundary are faked. The strict
// projection parser, the credential loader, the Web Crypto operations, the
// settings store, the provider adapter and the parsers it uses are the real
// production modules.

import { jsonResponse } from "./shipa-fixtures.ts";

/**
 * The readiness facts of one environment.
 *
 * The entitlement stays the literal `unconfirmed`: a directory vocabulary or
 * a valid key never establishes a merchant entitlement.
 */
export function createEnvironmentReadiness(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    credential_present: true,
    configuration_ready: true,
    probe_current: true,
    credentials_verified: true,
    origin_city_matched: true,
    last_checked_at: "2026-11-03T22:41:55.105Z",
    safe_code: null,
    service_entitlement: "unconfirmed",
    ...overrides,
  };
}

/** A consistent environment with no stored credential. */
export function createMissingEnvironmentReadiness(): Record<string, unknown> {
  return createEnvironmentReadiness({
    credential_present: false,
    configuration_ready: false,
    probe_current: false,
    credentials_verified: false,
    origin_city_matched: false,
    last_checked_at: null,
    safe_code: "credential_missing",
  });
}

/** The exact readiness document `shipa_read_readiness` returns. */
export function createReadinessDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    settings_revision: 4,
    active_environment: "sandbox",
    environments: {
      sandbox: createEnvironmentReadiness(),
      live: createEnvironmentReadiness({
        credential_present: false,
        configuration_ready: false,
        probe_current: false,
        credentials_verified: false,
        origin_city_matched: false,
        last_checked_at: null,
        safe_code: "credential_missing",
      }),
    },
    scheduler: { last_ok_at: null, current: false },
    ...overrides,
  };
}

/** The exact three-key acknowledgment of a recorded observation. */
export function createObservationAcknowledgement(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    recorded: true,
    origin_city_matched: true,
    remote_probe_ok: true,
    ...overrides,
  };
}

/** The city names a healthy KWT directory returns. */
export const SHIPA_TEST_KWT_CITIES: string[] = ["Hawally", "Salmiya"];

/** A healthy upstream service health document. */
export function healthResponse(status: "OK" | "ERROR" = "OK"): Response {
  return jsonResponse({ status });
}

/** A country directory document. */
export function countryResponse(
  isoAlpha3: string | null = "KWT",
  cities: readonly string[] = SHIPA_TEST_KWT_CITIES,
): Response {
  return jsonResponse({
    name: "Kuwait",
    isoAlpha3,
    cities: cities.map((name) => ({ name, state: null })),
  });
}

/** A country directory document for a country that is not Kuwait. */
export function otherCountryResponse(): Response {
  return jsonResponse({
    name: "United Arab Emirates",
    isoAlpha3: "ARE",
    cities: [{ name: "Dubai", state: null }],
  });
}
