import { createDefaultShipaSettings, type ShipaSettings } from "@/lib/shipaSettings";
import {
  evaluateDispatchPolicy,
  type DispatchOrderState,
  type DispatchPolicyInput,
  type DispatchPolicyReasonCode,
  type DispatchRetryState,
  type DispatchShipmentState,
} from "@/lib/shipaDispatchPolicy";

const baseSettings = (overrides: Partial<ShipaSettings> = {}): ShipaSettings => ({
  ...createDefaultShipaSettings(),
  enabled: true,
  environment: "sandbox",
  dispatchMode: "manual_after_packing",
  ...overrides,
});

const paidOrder = (overrides: Partial<DispatchOrderState> = {}): DispatchOrderState => ({
  orderStatus: "confirmed",
  paymentStatus: "paid",
  receipt: {
    present: true,
    verified: true,
    orderBindingMatches: true,
    paymentIdentityMatches: true,
    amountAndCurrencyMatch: true,
  },
  ...overrides,
});

const baseInput = (overrides: Partial<DispatchPolicyInput> = {}): DispatchPolicyInput => ({
  settings: baseSettings(),
  shipmentEnvironment: "sandbox",
  source: "manual",
  order: paidOrder(),
  shipment: "none",
  validation: { pricingStatus: "accepted", requiredDeliveryDataValid: true },
  review: { currentInputFingerprint: "fingerprint-current", approvedInputFingerprint: "fingerprint-current" },
  retry: null,
  ecommerceHold: false,
  now: new Date("2026-11-02T10:00:00.000Z"),
  ...overrides,
});

// An immutable prior dispatch decision as the mocked domain snapshot would
// hold it. It is local fixture state only: it is not a durable queue, it is
// not evidence of a real booking, and it grants no trust.
const PRIOR_DECISION_FIXTURE: Readonly<{
  decision: DispatchShipmentState;
  recordedAt: string;
}> = Object.freeze({
  decision: "created",
  recordedAt: "2026-11-02T09:55:00.000Z",
});

describe("eligibility", () => {
  it("never treats a rejected shipment without retry evidence as fresh work", () => {
    const decision = evaluateDispatchPolicy(baseInput({ shipment: "rejected", retry: null }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("retry_not_retryable");
  });

  it("cannot acknowledge pricing that was never checked", () => {
    const decision = evaluateDispatchPolicy(baseInput({
      validation: { pricingStatus: "not_checked", requiredDeliveryDataValid: true },
      review: { currentInputFingerprint: "fingerprint-current", approvedInputFingerprint: "fingerprint-current",
        pricingException: { acknowledged: true, reviewedInputFingerprint: "fingerprint-current" } },
    }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("pricing_review_required");
  });
  it("allows a paid order with a verified receipt", () => {
    const decision = evaluateDispatchPolicy(baseInput());
    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toEqual([]);
    expect(decision.requiresStaffReview).toBe(false);
  });

  it("blocks a disabled integration", () => {
    const decision = evaluateDispatchPolicy(baseInput({ settings: baseSettings({ enabled: false }) }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("integration_disabled");
  });

  it("blocks the ministry hold", () => {
    const decision = evaluateDispatchPolicy(baseInput({ ecommerceHold: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("ecommerce_hold");
  });

  it("blocks a shipment bound to another environment", () => {
    const decision = evaluateDispatchPolicy(baseInput({ shipmentEnvironment: "live" }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("environment_mismatch");
  });

  it("allows a shipment bound to the active environment", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({ settings: baseSettings({ environment: "live" }), shipmentEnvironment: "live" }),
    );
    expect(decision.allowed).toBe(true);
  });
});

describe("order and payment state", () => {
  const ineligibleOrders: Array<[string, Partial<DispatchOrderState>, DispatchPolicyReasonCode]> = [
    ["unpaid", { paymentStatus: "pending" }, "payment_not_settled"],
    ["refunded", { paymentStatus: "refunded" }, "payment_refunded"],
    [
      "partially refunded",
      { paymentStatus: "partially_refunded" },
      "payment_partially_refunded",
    ],
    ["cancelled", { orderStatus: "cancelled" }, "order_cancelled"],
  ];

  it.each(ineligibleOrders)("blocks a %s order", (_label, patch, expected) => {
    const decision = evaluateDispatchPolicy(baseInput({ order: paidOrder(patch) }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(expected);
  });

  it("blocks an order without a receipt", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        order: paidOrder({
          receipt: {
            present: false,
            verified: false,
            orderBindingMatches: false,
            paymentIdentityMatches: false,
            amountAndCurrencyMatch: false,
          },
        }),
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("payment_receipt_missing");
  });

  it("blocks an unverified receipt", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        order: paidOrder({
          receipt: {
            present: true,
            verified: false,
            orderBindingMatches: true,
            paymentIdentityMatches: true,
            amountAndCurrencyMatch: true,
          },
        }),
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("payment_receipt_unverified");
  });

  it("blocks a mismatched payment identity", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        order: paidOrder({
          receipt: {
            present: true,
            verified: true,
            orderBindingMatches: true,
            paymentIdentityMatches: false,
            amountAndCurrencyMatch: true,
          },
        }),
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("payment_identity_mismatch");
  });
});

describe("source-aware mode eligibility", () => {
  it("requires explicit staff approval even when pricing is accepted", () => {
    const decision = evaluateDispatchPolicy(baseInput({
      review: { currentInputFingerprint: "fingerprint-current" },
    }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("manual_review_required");
  });

  it.each(["", "   ", "fingerprint-outdated"])("rejects invalid staff approval %j", (fingerprint) => {
    const decision = evaluateDispatchPolicy(baseInput({
      review: { currentInputFingerprint: fingerprint, approvedInputFingerprint: fingerprint === "fingerprint-outdated" ? "fingerprint-current" : fingerprint },
    }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("manual_review_required");
  });

  it("blocks automatic dispatch outside automatic mode", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({ source: "automatic", settings: baseSettings({ dispatchMode: "manual_after_packing" }) }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("mode_requires_automatic");
  });

  it("allows automatic dispatch in automatic mode", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "automatic",
        settings: baseSettings({ dispatchMode: "automatic_after_payment" }),
      }),
    );
    expect(decision.allowed).toBe(true);
  });

  it("lets staff act manually in automatic mode", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        settings: baseSettings({ dispatchMode: "automatic_after_payment" }),
      }),
    );
    expect(decision.allowed).toBe(true);
  });
});

describe("existing shipment state", () => {
  it("requires a separate explicit resolution before a reviewed shipment can proceed", () => {
    const held = baseInput({
      shipment: "needs_review",
      validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
      review: {
        currentInputFingerprint: "fingerprint-current",
        approvedInputFingerprint: "fingerprint-current",
        pricingException: { acknowledged: true, reviewedInputFingerprint: "fingerprint-current" },
      },
    });
    expect(evaluateDispatchPolicy(held).reasons).toContain("shipment_needs_review");
    // This next snapshot represents an explicit server-owned staff resolution,
    // not a state transition performed or authorized by this advisory helper.
    const resolved = { ...held, shipment: "queued" as const };
    expect(evaluateDispatchPolicy(resolved).allowed).toBe(true);
    expect(evaluateDispatchPolicy({
      ...resolved,
      review: { ...resolved.review, currentInputFingerprint: "fingerprint-changed" },
    }).allowed).toBe(false);
    expect(evaluateDispatchPolicy({
      ...held,
      source: "automatic",
      settings: baseSettings({ dispatchMode: "automatic_after_payment" }),
    }).allowed).toBe(false);
  });

  const blockedShipmentStates: Array<[DispatchShipmentState, DispatchPolicyReasonCode]> = [
    ["submitting", "shipment_already_submitted"],
    ["created", "shipment_already_created"],
    ["unknown", "shipment_outcome_unknown"],
  ];

  it.each(blockedShipmentStates)("denies another create from %s state", (shipment, expected) => {
    const decision = evaluateDispatchPolicy(baseInput({ shipment }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(expected);
  });

  it("denies another create after a recorded prior decision", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({ shipment: PRIOR_DECISION_FIXTURE.decision }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("shipment_already_created");
  });

  it("keeps an unknown outcome blocked even when a retry is due", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        shipment: "unknown",
        retry: {
          retryCount: 1,
          originalInputFingerprint: "fingerprint-current",
          retryAt: "2026-11-02T09:00:00.000Z",
          retryable: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("shipment_outcome_unknown");
    expect(decision.reasons).not.toContain("retry_not_due");
  });

  it("sends a shipment already waiting for review back to staff", () => {
    const decision = evaluateDispatchPolicy(baseInput({ shipment: "needs_review" }));
    expect(decision.allowed).toBe(false);
    expect(decision.requiresStaffReview).toBe(true);
    expect(decision.reasons).toContain("shipment_needs_review");
  });

  it("lets an explicitly reviewed corrected shipment queued by the server proceed", () => {
    const decision = evaluateDispatchPolicy(baseInput({ shipment: "queued" }));
    expect(decision.allowed).toBe(true);
  });
});

describe("pricing and coupon integrity", () => {
  it.each(["", "   "])("does not accept matching blank pricing fingerprints %j", (fingerprint) => {
    const decision = evaluateDispatchPolicy(baseInput({
      validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
      review: {
        currentInputFingerprint: fingerprint,
        approvedInputFingerprint: fingerprint,
        pricingException: { acknowledged: true, reviewedInputFingerprint: fingerprint },
      },
    }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("pricing_exception_fingerprint_stale");
  });

  it("requires staff review for an automatic pricing mismatch", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "automatic",
        settings: baseSettings({ dispatchMode: "automatic_after_payment" }),
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.requiresStaffReview).toBe(true);
    expect(decision.reasons).toContain("pricing_review_required");
  });

  it("requires staff review for an automatic price that was never checked", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "automatic",
        settings: baseSettings({ dispatchMode: "automatic_after_payment" }),
        validation: { pricingStatus: "not_checked", requiredDeliveryDataValid: true },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("pricing_review_required");
  });

  it("requires an acknowledgement for a manual pricing mismatch", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.requiresStaffReview).toBe(true);
    expect(decision.reasons).toContain("pricing_exception_not_acknowledged");
  });

  it("denies a stale reviewed-input fingerprint", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
        review: {
          currentInputFingerprint: "fingerprint-current",
          approvedInputFingerprint: "fingerprint-current",
          pricingException: {
            acknowledged: true,
            reviewedInputFingerprint: "fingerprint-outdated",
          },
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.requiresStaffReview).toBe(true);
    expect(decision.reasons).toContain("pricing_exception_fingerprint_stale");
  });

  it("allows a manual pricing mismatch acknowledged against the current input", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
        review: {
          currentInputFingerprint: "fingerprint-current",
          approvedInputFingerprint: "fingerprint-current",
          pricingException: {
            acknowledged: true,
            reviewedInputFingerprint: "fingerprint-current",
          },
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("never lets a pricing acknowledgement override a missing receipt", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        order: paidOrder({
          receipt: {
            present: false,
            verified: false,
            orderBindingMatches: false,
            paymentIdentityMatches: false,
            amountAndCurrencyMatch: false,
          },
        }),
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
        review: {
          currentInputFingerprint: "fingerprint-current",
          approvedInputFingerprint: "fingerprint-current",
          pricingException: {
            acknowledged: true,
            reviewedInputFingerprint: "fingerprint-current",
          },
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("payment_receipt_missing");
  });

  it("never lets a pricing acknowledgement override a mismatched payment identity", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        order: paidOrder({
          receipt: {
            present: true,
            verified: true,
            orderBindingMatches: true,
            paymentIdentityMatches: false,
            amountAndCurrencyMatch: true,
          },
        }),
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
        review: {
          currentInputFingerprint: "fingerprint-current",
          approvedInputFingerprint: "fingerprint-current",
          pricingException: {
            acknowledged: true,
            reviewedInputFingerprint: "fingerprint-current",
          },
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("payment_identity_mismatch");
  });

  it("never lets a pricing acknowledgement override invalid delivery data", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        source: "manual",
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: false },
        review: {
          currentInputFingerprint: "fingerprint-current",
          approvedInputFingerprint: "fingerprint-current",
          pricingException: {
            acknowledged: true,
            reviewedInputFingerprint: "fingerprint-current",
          },
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("invalid_delivery_data");
  });
});

describe("safe retry", () => {
  const retry = (overrides: Partial<DispatchRetryState> = {}): DispatchRetryState => ({
    retryCount: 1,
    originalInputFingerprint: "fingerprint-current",
    retryAt: "2026-11-02T09:30:00.000Z",
    retryable: true,
    ...overrides,
  });

  it("allows the initial send and exactly three scheduled retries", () => {
    expect(evaluateDispatchPolicy(baseInput()).allowed).toBe(true);
    // The result owner increments retry_count when scheduling, before execution.
    const attempts = [1, 2, 3, 4].map((retryCount) => evaluateDispatchPolicy(baseInput({
      shipment: "queued", retry: retry({ retryCount }),
    })).allowed);
    expect(attempts).toEqual([true, true, true, false]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid scheduled retry count %s", (retryCount) => {
      const decision = evaluateDispatchPolicy(baseInput({ retry: retry({ retryCount }) }));
      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toContain("retry_count_invalid");
    },
  );

  it.each(["", "   ", "fingerprint-old-address", "fingerprint-old-parcel"])(
    "requires the original submitted input even with accepted pricing: %j", (originalInputFingerprint) => {
      const decision = evaluateDispatchPolicy(baseInput({ retry: retry({ originalInputFingerprint }) }));
      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toContain("retry_input_changed");
    },
  );

  it.each(["manual_after_packing", "automatic_after_payment"] as const)(
    "permits a scheduler to execute a due reviewed manual-source retry in %s", (dispatchMode) => {
      const decision = evaluateDispatchPolicy(baseInput({
        source: "manual", settings: baseSettings({ dispatchMode }),
        shipment: "queued", retry: retry(),
      }));
      expect(decision.allowed).toBe(true);
    },
  );

  it("binds automatic-source retries to the original submitted input too", () => {
    const input = baseInput({
      source: "automatic", settings: baseSettings({ dispatchMode: "automatic_after_payment" }),
      retry: retry(), review: { currentInputFingerprint: "fingerprint-current" },
    });
    expect(evaluateDispatchPolicy(input).allowed).toBe(true);
    expect(evaluateDispatchPolicy({
      ...input, retry: retry({ originalInputFingerprint: "fingerprint-old-address" }),
    }).allowed).toBe(false);
  });

  it("blocks a retry that is not due yet", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        shipment: "rejected",
        retry: retry({ retryAt: "2026-11-02T10:30:00.000Z" }),
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("retry_not_due");
  });

  it("allows a due retry", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({ shipment: "rejected", retry: retry() }),
    );
    expect(decision.allowed).toBe(true);
  });

  it.each(["2026-11-01", "2026-11-01T09:00:00", "2026-02-30T09:00:00Z"])(
    "refuses malformed retry scheduling timestamps %s", (retryAt) => {
      const decision = evaluateDispatchPolicy(baseInput({ shipment: "rejected", retry: retry({ retryAt }) }));
      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toContain("retry_not_due");
    },
  );

  it("blocks a retry that is not documented as retryable", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({ shipment: "rejected", retry: retry({ retryable: false }) }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("retry_not_retryable");
  });

  it("blocks a retry once the budget is exhausted", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({ shipment: "rejected", retry: retry({ retryCount: 4 }) }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("retry_budget_exhausted");
  });

  it("keeps the retry budget untouched when a due retry is allowed", () => {
    const retryState = retry({ retryCount: 2 });
    const decision = evaluateDispatchPolicy(
      baseInput({ shipment: "rejected", retry: retryState }),
    );
    expect(decision.allowed).toBe(true);
    expect(retryState.retryCount).toBe(2);
  });

  it("requires the original review to still match for a due retry", () => {
    const decision = evaluateDispatchPolicy(
      baseInput({
        shipment: "rejected",
        validation: { pricingStatus: "mismatch", requiredDeliveryDataValid: true },
        review: {
          currentInputFingerprint: "fingerprint-current",
          approvedInputFingerprint: "fingerprint-current",
          pricingException: {
            acknowledged: true,
            reviewedInputFingerprint: "fingerprint-outdated",
          },
        },
        retry: retry(),
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("pricing_exception_fingerprint_stale");
  });
});
