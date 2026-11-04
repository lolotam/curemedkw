import {
  DEFAULT_SHIPA_SETTINGS,
  KUWAIT_COUNTRY_CODE,
  SCHEDULER_HEARTBEAT_MAX_AGE_MS,
  SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH,
  applyShipaPublicSettingsPatch,
  createDefaultShipaSettings,
  evaluateShipaActivationReadiness,
  missingShipaOriginAddressFields,
  parseShipaPublicSettings,
  parseShipaSaveRequest,
  parseShipaSettings,
  shipaPublicSettingsForEnvironment,
  withShipaDispatchMode,
  withShipaEnvironment,
  withShipaEnvironmentSettings,
  type DispatchMode,
  type ShipaActivationReadinessInput,
  type ShipaEnvironment,
  type ShipaOriginAddress,
  type ShipaPublicSettings,
  type ShipaSaveablePublicSettings,
  type ShipaSaveableSettings,
  type ShipaSettings,
} from "@/lib/shipaSettings";

// A complete, obviously fake draft used as the base for the checks below.
// Nothing here is credential material.
const completePublicSettings = (): ShipaPublicSettings => ({
  appId: "app-draft",
  origin: {
    contactName: "Curemed",
    contactPhone: "+96550000000",
    address: {
      countryCode: KUWAIT_COUNTRY_CODE,
      governorate: "Hawalli",
      area: "Salmiya",
      block: "12",
      street: "12th Street",
      building: "8",
      addressLine: "Warehouse 3",
    },
  },
  serviceCode: "Same Day",
  autoConfirm: false,
  pickupInstructions: "",
  parcel: {
    count: 1,
    weightKg: 1.5,
    dimensionsCm: { lengthCm: 20, widthCm: 15, heightCm: 10 },
  },
  credential: { present: true, rotatedAt: "2026-11-01T10:00:00.000Z", keyVersion: 1 },
});

const completeSettings = (): ShipaSettings => ({
  ...createDefaultShipaSettings(),
  enabled: true,
  environment: "sandbox",
  dispatchMode: "manual_after_packing",
  sandbox: completePublicSettings(),
  live: completePublicSettings(),
});

const HEARTBEAT = "2026-11-02T10:00:00.000Z";
const HEARTBEAT_MS = Date.parse(HEARTBEAT);

const readinessInput = (
  overrides: Partial<ShipaActivationReadinessInput> = {},
): ShipaActivationReadinessInput => ({
  settings: completeSettings(),
  vendorReferenceAvailable: true,
  providerAdapterReady: true,
  activeEnvironmentCredentialPresent: true,
  schedulerHeartbeatAt: HEARTBEAT,
  now: new Date("2026-11-02T10:01:00.000Z"),
  ...overrides,
});

describe("safe defaults", () => {
  it("starts disabled, on sandbox, in manual mode, at revision 0", () => {
    const defaults = createDefaultShipaSettings();
    expect(defaults.enabled).toBe(false);
    expect(defaults.environment).toBe("sandbox");
    expect(defaults.dispatchMode).toBe("manual_after_packing");
    expect(defaults.revision).toBe(0);
  });

  it("keeps the parcel count at one and an unset weight null", () => {
    const defaults = createDefaultShipaSettings();
    expect(defaults.sandbox.parcel.count).toBe(1);
    expect(defaults.sandbox.parcel.weightKg).toBeNull();
    expect(defaults.sandbox.parcel.dimensionsCm).toBeNull();
    expect(DEFAULT_SHIPA_SETTINGS.sandbox.credential.present).toBe(false);
  });

  it("keeps the country fixed to Kuwait and every draft field empty", () => {
    const defaults = createDefaultShipaSettings();
    expect(defaults.sandbox.origin.address.countryCode).toBe("KW");
    expect(defaults.sandbox.origin.contactName).toBe("");
    expect(defaults.sandbox.origin.address.governorate).toBe("");
  });
});

describe("enum and revision validation", () => {
  const dispatchModes: DispatchMode[] = ["manual_after_packing", "automatic_after_payment"];
  const environments: ShipaEnvironment[] = ["sandbox", "live"];

  it.each(dispatchModes)("accepts the %s dispatch mode", (mode) => {
    const result = parseShipaSettings({ ...completeSettings(), dispatchMode: mode });
    expect(result.ok).toBe(true);
    expect(result.settings?.dispatchMode).toBe(mode);
  });

  it.each(environments)("accepts the %s environment", (environment) => {
    const result = parseShipaSettings({ ...completeSettings(), environment });
    expect(result.ok).toBe(true);
    expect(result.settings?.environment).toBe(environment);
  });

  const invalidCases: Array<[string, Record<string, unknown>]> = [
    ["unknown dispatch mode", { dispatchMode: "automatic" }],
    ["unknown environment", { environment: "prod" }],
    ["negative revision", { revision: -1 }],
    ["fractional revision", { revision: 1.5 }],
  ];

  it.each(invalidCases)("rejects an %s", (_label, patch) => {
    const result = parseShipaSettings({ ...completeSettings(), ...patch });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });
});

describe("environment and mode isolation", () => {
  it("keeps both environments intact when the dispatch mode changes", () => {
    const settings = withShipaEnvironmentSettings(completeSettings(), "live", {
      origin: { contactName: "Curemed Live" },
    });
    const switched = withShipaDispatchMode(settings, "automatic_after_payment");

    expect(switched.dispatchMode).toBe("automatic_after_payment");
    expect(switched.sandbox.origin.contactName).toBe("Curemed");
    expect(switched.live.origin.contactName).toBe("Curemed Live");
    expect(switched.live.origin.address.area).toBe("Salmiya");
    expect(switched.live.parcel.weightKg).toBe(1.5);
  });

  it("keeps both environments intact when the active environment changes", () => {
    const settings = withShipaEnvironmentSettings(completeSettings(), "live", {
      parcel: { weightKg: 4 },
    });
    const switched = withShipaEnvironment(settings, "live");

    expect(switched.environment).toBe("live");
    expect(switched.sandbox.origin.contactName).toBe("Curemed");
    expect(switched.live.origin.contactName).toBe("Curemed");
    expect(switched.live.parcel.weightKg).toBe(4);
    expect(switched.sandbox.parcel.weightKg).toBe(1.5);
  });

  it("patches one environment without disturbing the other", () => {
    const patched = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
      origin: { contactPhone: "+96551111111" },
      parcel: { weightKg: 2.25 },
    });

    expect(patched.sandbox.origin.contactPhone).toBe("+96551111111");
    expect(patched.sandbox.origin.contactName).toBe("Curemed");
    expect(patched.sandbox.origin.address.building).toBe("8");
    expect(patched.sandbox.parcel.weightKg).toBe(2.25);
    expect(patched.sandbox.parcel.dimensionsCm?.lengthCm).toBe(20);
    expect(patched.live.origin.contactPhone).toBe("+96550000000");
    expect(patched.live.parcel.weightKg).toBe(1.5);
  });

  it("merges a patch without dropping nested values", () => {
    const merged = applyShipaPublicSettingsPatch(completePublicSettings(), {
      origin: { address: { block: "99" } },
    });
    expect(merged.origin.address.block).toBe("99");
    expect(merged.origin.address.building).toBe("8");
    expect(merged.origin.contactName).toBe("Curemed");
  });
});

describe("credential-like and unknown public fields", () => {
  const credentialLikeCases: Array<[string, string]> = [
    ["apiKey", "dummy"],
    ["api_key", "dummy"],
    ["token", "dummy"],
    ["ciphertext", "dummy"],
    ["apiUrl", "https://example.invalid"],
    ["webhookSecret", "dummy"],
  ];

  it.each(credentialLikeCases)("rejects a %s field instead of preserving it", (field, value) => {
    const result = parseShipaPublicSettings({ ...completePublicSettings(), [field]: value });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("forbidden_credential_field");
    expect(result.messages).toEqual(["Credential or endpoint fields are not allowed in public settings."]);
    expect(result.settings).toBeUndefined();
  });

  it("rejects an unknown non-credential field", () => {
    const result = parseShipaPublicSettings({ ...completePublicSettings(), nickname: "warehouse" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
    expect(result.settings).toBeUndefined();
  });

  it("rejects a credential-like field nested inside the draft", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      origin: { ...completePublicSettings().origin, secretKey: "dummy" },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("forbidden_credential_field");
    expect(result.messages).toEqual(["Credential or endpoint fields are not allowed in public settings."]);
  });

  it("never returns the rejected value in a parsed result", () => {
    const result = parseShipaPublicSettings({ ...completePublicSettings(), apiKey: "dummy" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("dummy");
  });

  it.each(["environment", "dispatchMode"])("does not echo a rejected %s enum value", (field) => {
    const result = parseShipaSettings({ ...completeSettings(), [field]: "dummy-sensitive" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("dummy-sensitive");
  });

  it("does not echo a rejected literal value or unknown field name", () => {
    const draft = completePublicSettings();
    const malformed = {
      ...draft,
      "dummy-sensitive": "dummy-sensitive",
      origin: { ...draft.origin, address: { ...draft.origin.address, countryCode: "dummy-sensitive" } },
    };
    for (const result of [
      parseShipaPublicSettings(malformed),
      parseShipaSettings({ ...completeSettings(), sandbox: malformed }),
    ]) {
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("dummy-sensitive");
    }
  });

  it("does not echo an unknown ancestor of a forbidden field", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      "dummy-sensitive": { apiKey: "dummy" },
    });
    expect(result.code).toBe("forbidden_credential_field");
    expect(JSON.stringify(result)).not.toContain("dummy-sensitive");
  });
});

describe("Kuwait origin and one-parcel validation", () => {
  it("rejects a country other than Kuwait", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      origin: {
        ...completePublicSettings().origin,
        address: { ...completePublicSettings().origin.address, countryCode: "SA" },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });

  it("rejects a parcel count other than one", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      parcel: { ...completePublicSettings().parcel, count: 2 },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });

  const invalidWeightCases: Array<[string, { weightKg: number }]> = [
    ["negative weight", { weightKg: -1 }],
    ["zero weight", { weightKg: 0 }],
    ["infinite weight", { weightKg: Number.POSITIVE_INFINITY }],
    ["not-a-number weight", { weightKg: Number.NaN }],
  ];

  it.each(invalidWeightCases)("rejects a %s", (_label, patch) => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      parcel: { ...completePublicSettings().parcel, ...patch },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });

  it("rejects partial dimensions", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      parcel: {
        ...completePublicSettings().parcel,
        dimensionsCm: { lengthCm: 20, widthCm: 15 },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });

  it("rejects a non-positive dimension", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      parcel: {
        ...completePublicSettings().parcel,
        dimensionsCm: { lengthCm: 20, widthCm: 0, heightCm: 10 },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });

  it("accepts an unset weight and unset dimensions", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      parcel: { count: 1, weightKg: null, dimensionsCm: null },
    });
    expect(result.ok).toBe(true);
  });

  it("keeps an incomplete draft valid while the integration is disabled", () => {
    const draft = createDefaultShipaSettings();
    const result = parseShipaSettings(draft);
    expect(result.ok).toBe(true);
    expect(draft.enabled).toBe(false);
  });
});

describe("activation readiness", () => {
  it("refuses activation without a selected delivery service", () => {
    const settings = completeSettings();
    settings.sandbox.serviceCode = null;
    const readiness = evaluateShipaActivationReadiness(readinessInput({ settings }));
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("service_code_missing");
  });
  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a typed draft patched with invalid weight %s",
    (weightKg) => {
      const settings = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
        parcel: { weightKg },
      });
      const readiness = evaluateShipaActivationReadiness(readinessInput({ settings }));
      expect(readiness.ready).toBe(false);
      expect(readiness.issues.map((issue) => issue.code)).toContain("invalid_settings");
    },
  );

  it("rejects a typed draft patched with invalid dimensions", () => {
    const settings = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
      parcel: { dimensionsCm: { lengthCm: 10, widthCm: 0, heightCm: 10 } },
    });
    const readiness = evaluateShipaActivationReadiness(readinessInput({ settings }));
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("invalid_settings");
  });

  it("reports the missing requirements of an incomplete draft", () => {
    const readiness = evaluateShipaActivationReadiness(
      readinessInput({
        settings: createDefaultShipaSettings(),
        vendorReferenceAvailable: false,
        providerAdapterReady: false,
        activeEnvironmentCredentialPresent: false,
      }),
    );

    expect(readiness.ready).toBe(false);
    const codes = readiness.issues.map((issue) => issue.code);
    expect(codes).toContain("provider_reference_unavailable");
    expect(codes).toContain("provider_adapter_not_ready");
    expect(codes).toContain("credential_missing");
    expect(codes).toContain("origin_contact_missing");
    expect(codes).toContain("origin_phone_missing");
    expect(codes).toContain("origin_address_incomplete");
    expect(codes).toContain("parcel_weight_missing");
  });

  it("blocks activation while the provider reference is missing", () => {
    const readiness = evaluateShipaActivationReadiness(
      readinessInput({ vendorReferenceAvailable: false }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("provider_reference_unavailable");
  });

  it("blocks activation while the adapter is not ready", () => {
    const readiness = evaluateShipaActivationReadiness(
      readinessInput({ providerAdapterReady: false }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("provider_adapter_not_ready");
  });

  it("checks the active environment and keeps credential metadata separate", () => {
    const settings = withShipaEnvironmentSettings(completeSettings(), "live", {
      credential: { present: false, rotatedAt: null, keyVersion: null },
    });

    expect(settings.sandbox.credential.present).toBe(true);
    expect(settings.live.credential.present).toBe(false);
    expect(shipaPublicSettingsForEnvironment(settings, "sandbox").credential.present).toBe(true);
    expect(shipaPublicSettingsForEnvironment(settings, "live").credential.present).toBe(false);

    const readiness = evaluateShipaActivationReadiness(
      readinessInput({ settings, activeEnvironmentCredentialPresent: false }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("credential_missing");
  });

  it("is ready when the manual draft is complete", () => {
    const readiness = evaluateShipaActivationReadiness(readinessInput());
    expect(readiness.issues).toEqual([]);
    expect(readiness.ready).toBe(true);
  });
});

describe("scheduler heartbeat", () => {
  it.each(["2026-11-02", "2026-11-02T10:00:00", "2026-02-30T10:00:00Z"])(
    "refuses malformed heartbeat calendar/timezone %s", (schedulerHeartbeatAt) => {
      const readiness = evaluateShipaActivationReadiness(readinessInput({
        settings: { ...completeSettings(), dispatchMode: "automatic_after_payment" },
        schedulerHeartbeatAt,
      }));
      expect(readiness.issues.map((issue) => issue.code)).toContain("scheduler_heartbeat_invalid");
    },
  );
  const automatic = (overrides: Partial<ShipaActivationReadinessInput> = {}) =>
    readinessInput({
      settings: { ...completeSettings(), dispatchMode: "automatic_after_payment" },
      ...overrides,
    });

  it("accepts a fresh heartbeat", () => {
    const readiness = evaluateShipaActivationReadiness(automatic());
    expect(readiness.ready).toBe(true);
  });

  it("accepts a heartbeat exactly at the three minute boundary", () => {
    const readiness = evaluateShipaActivationReadiness(
      automatic({ now: new Date(HEARTBEAT_MS + SCHEDULER_HEARTBEAT_MAX_AGE_MS) }),
    );
    expect(readiness.issues.map((issue) => issue.code)).not.toContain("scheduler_heartbeat_stale");
    expect(readiness.ready).toBe(true);
  });

  it("rejects a stale heartbeat", () => {
    const readiness = evaluateShipaActivationReadiness(
      automatic({ now: new Date(HEARTBEAT_MS + SCHEDULER_HEARTBEAT_MAX_AGE_MS + 1000) }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("scheduler_heartbeat_stale");
  });

  it("rejects a heartbeat in the future", () => {
    const readiness = evaluateShipaActivationReadiness(
      automatic({
        schedulerHeartbeatAt: "2026-11-02T10:10:00.000Z",
        now: new Date("2026-11-02T10:01:00.000Z"),
      }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("scheduler_heartbeat_in_future");
  });

  it("rejects a missing heartbeat", () => {
    const readiness = evaluateShipaActivationReadiness(automatic({ schedulerHeartbeatAt: null }));
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("scheduler_heartbeat_missing");
  });

  it("rejects an unreadable heartbeat", () => {
    const readiness = evaluateShipaActivationReadiness(
      automatic({ schedulerHeartbeatAt: "not-a-timestamp" }),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("scheduler_heartbeat_invalid");
  });

  it("does not require the scheduler in manual mode", () => {
    const readiness = evaluateShipaActivationReadiness(
      readinessInput({ schedulerHeartbeatAt: null }),
    );
    expect(readiness.ready).toBe(true);
  });
});

describe("auto confirmation and pickup instructions", () => {
  it("defaults to no auto confirmation and no pickup text", () => {
    const defaults = createDefaultShipaSettings();
    expect(defaults.sandbox.autoConfirm).toBe(false);
    expect(defaults.sandbox.pickupInstructions).toBe("");
    expect(defaults.live.autoConfirm).toBe(false);
    expect(defaults.live.pickupInstructions).toBe("");
  });

  it("patches the two fields in one environment only", () => {
    const patched = withShipaEnvironmentSettings(completeSettings(), "live", {
      autoConfirm: true,
      pickupInstructions: "Ask for the warehouse manager",
    });

    expect(patched.live.autoConfirm).toBe(true);
    expect(patched.live.pickupInstructions).toBe("Ask for the warehouse manager");
    expect(patched.sandbox.autoConfirm).toBe(false);
    expect(patched.sandbox.pickupInstructions).toBe("");
    expect(patched.sandbox.credential.present).toBe(true);
    expect(patched.live.credential.keyVersion).toBe(1);
  });

  it("keeps both environments intact when the dispatch mode changes", () => {
    const patched = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
      autoConfirm: true,
      pickupInstructions: "Leave at the counter",
    });
    const switched = withShipaDispatchMode(patched, "automatic_after_payment");

    expect(switched.dispatchMode).toBe("automatic_after_payment");
    expect(switched.sandbox.autoConfirm).toBe(true);
    expect(switched.sandbox.pickupInstructions).toBe("Leave at the counter");
    expect(switched.live.autoConfirm).toBe(false);
    expect(switched.live.pickupInstructions).toBe("");
  });

  it("keeps the active environment switch separate from the drafts", () => {
    const patched = withShipaEnvironmentSettings(completeSettings(), "live", {
      autoConfirm: true,
    });
    const switched = withShipaEnvironment(patched, "live");

    expect(switched.environment).toBe("live");
    expect(switched.live.autoConfirm).toBe(true);
    expect(switched.sandbox.autoConfirm).toBe(false);
  });

  it("accepts pickup instructions up to the documented length", () => {
    const longest = "x".repeat(SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH);
    const accepted = parseShipaPublicSettings({
      ...completePublicSettings(),
      pickupInstructions: longest,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.settings?.pickupInstructions).toBe(longest);

    const refused = parseShipaPublicSettings({
      ...completePublicSettings(),
      pickupInstructions: `${longest}y`,
    });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("invalid_settings");
  });

  it("refuses a non-boolean auto confirmation", () => {
    const result = parseShipaPublicSettings({
      ...completePublicSettings(),
      autoConfirm: "yes",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_settings");
  });
});

describe("service code vocabulary", () => {
  const acceptedCodes = ["On Demand", "Same Day", "Next Day"] as const;

  it.each(acceptedCodes)("accepts the %s service code", (code) => {
    const result = parseShipaPublicSettings({ ...completePublicSettings(), serviceCode: code });
    expect(result.ok).toBe(true);
    expect(result.settings?.serviceCode).toBe(code);
  });

  it.each(["Cross Border", "draft-service", "Next day", "same day"])(
    "refuses the %s service code",
    (code) => {
      const result = parseShipaPublicSettings({ ...completePublicSettings(), serviceCode: code });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("invalid_settings");
    },
  );

  it("accepts an unset service code", () => {
    const result = parseShipaPublicSettings({ ...completePublicSettings(), serviceCode: null });
    expect(result.ok).toBe(true);
    expect(result.settings?.serviceCode).toBeNull();
  });

  it("treats a valid service code as configuration, never as an entitlement", () => {
    const settings = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
      serviceCode: "Next Day",
    });
    const readiness = evaluateShipaActivationReadiness(
      readinessInput({ settings, vendorReferenceAvailable: false }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("provider_reference_unavailable");
  });

  it("refuses an unknown service code through the activation path too", () => {
    const settings = completeSettings();
    const broken = {
      ...settings,
      sandbox: { ...settings.sandbox, serviceCode: "Cross Border" },
    } as unknown as ShipaSettings;
    const readiness = evaluateShipaActivationReadiness(readinessInput({ settings: broken }));

    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("invalid_settings");
  });
});

describe("freeform address completeness", () => {
  const address = (overrides: Partial<ShipaOriginAddress>): ShipaOriginAddress => ({
    countryCode: KUWAIT_COUNTRY_CODE,
    governorate: "Hawalli",
    area: "Hawally",
    block: "",
    street: "",
    building: "",
    addressLine: "",
    ...overrides,
  });

  it("accepts a full freeform address line without a block, street or building", () => {
    const freeform = address({ addressLine: "Warehouse 3, 12th Street, behind the pharmacy" });
    expect(missingShipaOriginAddressFields(freeform)).toEqual([]);

    const settings = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
      origin: { address: freeform },
    });
    const readiness = evaluateShipaActivationReadiness(readinessInput({ settings }));
    expect(readiness.ready).toBe(true);
  });

  it("requires the structured street and building when there is no address line", () => {
    expect(missingShipaOriginAddressFields(address({ street: "12th Street" }))).toEqual(["building"]);
    expect(
      missingShipaOriginAddressFields(address({ street: "12th Street", building: "8" })),
    ).toEqual([]);
  });

  it("still requires the governorate and the area", () => {
    expect(
      missingShipaOriginAddressFields(address({ governorate: "", addressLine: "Warehouse 3" })),
    ).toEqual(["governorate"]);
    expect(
      missingShipaOriginAddressFields(address({ area: "", addressLine: "Warehouse 3" })),
    ).toEqual(["area"]);
  });

  it("reports an incomplete freeform address as incomplete", () => {
    const settings = withShipaEnvironmentSettings(completeSettings(), "sandbox", {
      origin: { address: address({ addressLine: "   " }) },
    });
    const readiness = evaluateShipaActivationReadiness(readinessInput({ settings }));

    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("origin_address_incomplete");
  });
});

describe("browser save request", () => {
  const saveablePublicSettings = (): ShipaSaveablePublicSettings => {
    const draft = completePublicSettings();
    return {
      appId: draft.appId,
      origin: draft.origin,
      serviceCode: "Next Day",
      autoConfirm: true,
      pickupInstructions: "Ask for the warehouse manager",
      parcel: draft.parcel,
    };
  };

  const saveableSettings = (): ShipaSaveableSettings => ({
    enabled: false,
    environment: "sandbox",
    dispatchMode: "manual_after_packing",
    sandbox: saveablePublicSettings(),
    live: saveablePublicSettings(),
  });

  it("accepts exactly an expected revision and the five safe settings fields", () => {
    const result = parseShipaSaveRequest({ expectedRevision: 3, settings: saveableSettings() });

    expect(result.ok).toBe(true);
    expect(result.request?.expectedRevision).toBe(3);
    expect(Object.keys(result.request?.settings ?? {}).sort()).toEqual([
      "dispatchMode",
      "enabled",
      "environment",
      "live",
      "sandbox",
    ]);
  });

  it("keeps the two new fields in the save payload", () => {
    const result = parseShipaSaveRequest({ expectedRevision: 0, settings: saveableSettings() });

    expect(result.ok).toBe(true);
    expect(result.request?.settings.sandbox.autoConfirm).toBe(true);
    expect(result.request?.settings.sandbox.pickupInstructions).toBe("Ask for the warehouse manager");
    expect(result.request?.settings.live.autoConfirm).toBe(true);
  });

  it.each(["actor", "provider", "proof"])("refuses an unknown %s field", (field) => {
    const result = parseShipaSaveRequest({
      expectedRevision: 0,
      settings: saveableSettings(),
      [field]: "value",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_request");
  });

  it("refuses an endpoint field as a credential-like field", () => {
    const result = parseShipaSaveRequest({
      expectedRevision: 0,
      settings: saveableSettings(),
      endpoint: "https://example.invalid",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("forbidden_credential_field");
  });

  it("refuses credential metadata inside an environment", () => {
    const result = parseShipaSaveRequest({
      expectedRevision: 0,
      settings: {
        ...saveableSettings(),
        sandbox: {
          ...saveablePublicSettings(),
          credential: { present: true, rotatedAt: null, keyVersion: 1 },
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_request");
  });

  it.each([-1, 2147483647, 1.5])("refuses the expected revision %s", (revision) => {
    const result = parseShipaSaveRequest({ expectedRevision: revision, settings: saveableSettings() });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_request");
  });

  it("refuses a request without an expected revision", () => {
    const result = parseShipaSaveRequest({ settings: saveableSettings() });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_request");
  });

  it("never echoes a rejected value", () => {
    const result = parseShipaSaveRequest({
      expectedRevision: 0,
      settings: saveableSettings(),
      apiKey: ["marker", "value"].join("-"),
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("marker-value");
  });
});
