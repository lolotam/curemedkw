// Behavioural tests for the Shipa request validation and payload build.
//
// The real validators run here; only the provider side is absent, and this
// file never touches the network at all.

import { assertEquals } from "jsr:@std/assert@1.0.19";

import {
  buildShipaOrderPayload,
  isValidKuwaitPhone,
  isValidShipaOrderId,
  isValidShipaReference,
  SHIPA_MAX_ADDRESS_LENGTH,
  SHIPA_MAX_CONTACT_NAME_LENGTH,
  type ShipaLocalRejectionCode,
  type ShipaOrderDraft,
  type ShipaOrderPayload,
} from "../../_shared/shipa-contract.ts";
import {
  draftWithExtraField,
  packageWithExtraField,
  partyWithExtraField,
  validOrderDraft,
} from "./shipa-fixtures.ts";

function expectPayload(draft: ShipaOrderDraft): ShipaOrderPayload {
  const built = buildShipaOrderPayload(draft);
  if (!built.ok) {
    throw new Error(
      `Unexpected local rejection: ${built.code} (${built.field})`,
    );
  }
  return built.payload;
}

function expectRejection(draft: ShipaOrderDraft): ShipaLocalRejectionCode {
  const built = buildShipaOrderPayload(draft);
  if (built.ok) {
    throw new Error("Expected a local rejection but the draft was accepted.");
  }
  return built.code;
}

Deno.test("maps a domestic draft onto the captured order shape", () => {
  const payload = expectPayload(validOrderDraft());

  assertEquals(payload.customerRef, "cm-order-0001");
  assertEquals(payload.type, "Delivery");
  assertEquals(payload.category, "Next Day");
  assertEquals(payload.autoConfirm, false);

  assertEquals(payload.origin.country, "KWT");
  assertEquals(payload.origin.contactName, "Curemed Warehouse");
  assertEquals(payload.origin.contactNo, "+96550000001");
  assertEquals(payload.origin.city, "Kuwait City");

  assertEquals(payload.destination.country, "KWT");
  assertEquals(payload.destination.city, "Hawalli");
  assertEquals(payload.destination.type, "Doorstep");
  assertEquals(payload.destination.options.amountToCollect, 0);

  assertEquals(payload.packages.length, 1);
});

Deno.test("maps the package units the captured schema documents", () => {
  const payload = expectPayload(validOrderDraft());
  const pkg = payload.packages[0];

  assertEquals(pkg.customerRef, "cm-order-0001-pkg-1");
  assertEquals(pkg.name, "Medication parcel");
  assertEquals(pkg.description, "Sealed medication parcel");
  // Kilograms.
  assertEquals(pkg.weight, 1.5);
  // Centimetres.
  assertEquals(pkg.length, 20);
  assertEquals(pkg.width, 15);
  assertEquals(pkg.height, 10);
});

Deno.test("never lets the courier collect from an already paid order", () => {
  const payload = expectPayload(validOrderDraft());

  assertEquals(payload.destination.options.amountToCollect, 0);
  assertEquals(
    JSON.stringify(payload).includes('"amountToCollect":0'),
    true,
  );
});

Deno.test("refuses a cross border category", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({ ...draft, category: "Cross Border" }),
    "cross_border_not_supported",
  );
});

Deno.test("refuses a category outside the documented vocabulary", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({ ...draft, category: "International" }),
    "invalid_category",
  );
});

Deno.test("refuses a missing category instead of defaulting one", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({ ...draft, category: null }),
    "missing_category",
  );
});

Deno.test("refuses a pickup order type", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({ ...draft, orderType: "Pickup" }),
    "invalid_order_type",
  );
});

Deno.test("refuses any country other than Kuwait", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({
      ...draft,
      origin: { ...draft.origin, country: "SAU" },
    }),
    "invalid_country",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: { ...draft.destination, country: "ARE" },
    }),
    "invalid_country",
  );
});

Deno.test("requires a Kuwait phone number in international format", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({
      ...draft,
      destination: { ...draft.destination, contactNo: "50000002" },
    }),
    "invalid_contact_phone",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: { ...draft.destination, contactNo: "+965 5000 0002" },
    }),
    "invalid_contact_phone",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: { ...draft.destination, contactNo: "+966500000002" },
    }),
    "invalid_contact_phone",
  );

  assertEquals(isValidKuwaitPhone("+96550000002"), true);
  assertEquals(isValidKuwaitPhone("50000002"), false);
  assertEquals(isValidKuwaitPhone("+966500000002"), false);
});

Deno.test("keeps the geographic coordinate limits", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({
      ...draft,
      destination: {
        ...draft.destination,
        coordinates: { latitude: 91, longitude: 47.9 },
      },
    }),
    "invalid_coordinates",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: {
        ...draft.destination,
        coordinates: { latitude: 29.3, longitude: 181 },
      },
    }),
    "invalid_coordinates",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: {
        ...draft.destination,
        coordinates: { latitude: Number.NaN, longitude: 47.9 },
      },
    }),
    "invalid_coordinates",
  );

  const payload = expectPayload({
    ...draft,
    destination: {
      ...draft.destination,
      coordinates: { latitude: 29.3759, longitude: 47.9774 },
    },
  });
  assertEquals(payload.destination.coordinates?.latitude, 29.3759);
});

Deno.test("refuses a non-positive weight or dimension", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({
      ...draft,
      package: { ...draft.package, weightKg: 0 },
    }),
    "invalid_package_weight",
  );
  assertEquals(
    expectRejection({
      ...draft,
      package: { ...draft.package, weightKg: Number.POSITIVE_INFINITY },
    }),
    "invalid_package_weight",
  );
  assertEquals(
    expectRejection({
      ...draft,
      package: { ...draft.package, heightCm: -1 },
    }),
    "invalid_package_dimensions",
  );
});

Deno.test("refuses an over-long contact name or address", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({
      ...draft,
      destination: {
        ...draft.destination,
        contactName: "a".repeat(SHIPA_MAX_CONTACT_NAME_LENGTH + 1),
      },
    }),
    "invalid_contact_name",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: {
        ...draft.destination,
        address: "a".repeat(SHIPA_MAX_ADDRESS_LENGTH + 1),
      },
    }),
    "invalid_address",
  );
});

Deno.test("refuses an unexpected or authority bearing field", () => {
  const draft = validOrderDraft();

  // A collection amount at the order level is never accepted from input.
  assertEquals(
    expectRejection(draftWithExtraField(draft, "amountToCollect", 25)),
    "unexpected_field",
  );
  // A browser payment flag is never accepted either.
  assertEquals(
    expectRejection(draftWithExtraField(draft, "isPaid", true)),
    "unexpected_field",
  );
  assertEquals(
    expectRejection({
      ...draft,
      destination: partyWithExtraField(
        draft.destination,
        "amountToCollect",
        25,
      ),
    }),
    "unexpected_field",
  );
  assertEquals(
    expectRejection({
      ...draft,
      package: packageWithExtraField(draft.package, "goodsValue", 40),
    }),
    "unexpected_field",
  );
});

Deno.test("refuses an unsafe or empty customer reference", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({ ...draft, customerRef: "" }),
    "invalid_customer_ref",
  );
  assertEquals(
    expectRejection({ ...draft, customerRef: "cm order 1" }),
    "invalid_customer_ref",
  );
  assertEquals(
    expectRejection({ ...draft, customerRef: "cm/order/1" }),
    "invalid_customer_ref",
  );
  assertEquals(
    expectRejection({ ...draft, customerRef: "a".repeat(65) }),
    "invalid_customer_ref",
  );
});

Deno.test("refuses an unsafe package reference", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection({
      ...draft,
      package: { ...draft.package, customerRef: ".." },
    }),
    "invalid_package_ref",
  );
});

Deno.test("requires an explicit autoConfirm from configuration", () => {
  const draft = validOrderDraft();

  assertEquals(
    expectRejection(draftWithExtraField(draft, "autoConfirm", undefined)),
    "invalid_auto_confirm",
  );
  assertEquals(
    expectRejection(draftWithExtraField(draft, "autoConfirm", "true")),
    "invalid_auto_confirm",
  );

  const payload = expectPayload({ ...draft, autoConfirm: true });
  assertEquals(payload.autoConfirm, true);
});

Deno.test("never invents an address that was not supplied", () => {
  const draft = validOrderDraft();
  const withoutAddress = {
    ...draft,
    destination: {
      country: draft.destination.country,
      contactName: draft.destination.contactName,
      contactNo: draft.destination.contactNo,
      city: draft.destination.city,
    },
  };

  const payload = expectPayload(withoutAddress);
  assertEquals("address" in payload.destination, false);
  assertEquals("email" in payload.destination, false);
});

Deno.test("accepts only safe reference characters", () => {
  assertEquals(isValidShipaReference("cm-order-0001"), true);
  assertEquals(isValidShipaReference("cm.order_0001"), true);
  assertEquals(isValidShipaReference(""), false);
  assertEquals(isValidShipaReference(".."), false);

  assertEquals(isValidShipaOrderId("SR-2026-0001"), true);
  assertEquals(isValidShipaOrderId(".."), false);
  assertEquals(isValidShipaOrderId("orders/1"), false);
});

Deno.test("preserves the merchant collection instruction without adding collection charges", () => {
  const instructions =
    "Call before pickup to confirm packing; collect 09:00-16:00 Kuwait time.";
  const result = expectPayload({
    ...validOrderDraft(),
    pickupInstructions: instructions,
  });
  assertEquals(result.origin.options?.specialInstructions, instructions);
  assertEquals(result.destination.options.amountToCollect, 0);
});

Deno.test("refuses malformed nested drafts and never echoes unknown property names", () => {
  const marker = "private-value";
  const valid = validOrderDraft();
  for (
    const draft of [
      null,
      { ...valid, origin: null },
      { ...valid, package: null },
      { ...valid, [marker]: true },
      {
        ...valid,
        origin: {
          ...valid.origin,
          coordinates: { latitude: 29, longitude: 48, [marker]: true },
        },
      },
    ]
  ) {
    const result = buildShipaOrderPayload(draft as unknown as ShipaOrderDraft);
    assertEquals(result.ok, false);
    assertEquals(JSON.stringify(result).includes(marker), false);
  }
  assertEquals(isValidShipaReference("valid\n"), false);
  assertEquals(isValidKuwaitPhone("+96550000000\n"), false);
});
