// Advisory dispatch policy over mocked domain snapshots.
//
// This module answers one question: given the settings as they stand, the
// order/payment state, the shipment state and the review evidence, is it
// admissible to submit a shipment request for this order *right now*?
//
// It is advisory and it is pure.
//
// * Advisory: every decision here is a client-domain judgement over data the
//   caller supplies. It is not authorization. The real authorization, the
//   verified payment receipt, the atomicity of a submission and the duplicate
//   protection all belong to the future server-side verified-payment RPCs and
//   dispatch worker. A browser boolean produced by this function must never
//   be treated as proof of anything.
// * Pure: no provider call, no queue, no persistence, no enqueue. Choosing
//   `automatic_after_payment` generates no request and backfills no
//   historical order; this function only judges what it is given.
//
// The shipment state it reads is a mocked snapshot. It may represent an
// immutable prior dispatch decision, but it is local fixture state, not a
// durable queue, and it grants no trust.

import type { ShipaEnvironment, ShipaSettings } from "@/lib/shipaSettings";
import { shipaTimestampMilliseconds } from "@/lib/shipaSettings";

/**
 * Persisted shipment source, not the actor executing this attempt. A scheduler
 * may execute a due manual-source retry without changing its source.
 */
export type DispatchSource = "manual" | "automatic";

/**
 * The mocked shipment state of an order in one environment.
 *
 * - `none` / `queued`: no booking exists yet, or an intent is waiting.
 * - `submitting`: a submission is in flight; another create is not allowed.
 * - `created`: a booking already exists; another create is not allowed.
 * - `unknown`: the previous attempt had an ambiguous outcome; it never
 *   becomes retryable just because time passed.
 * - `rejected`: a definitive rejection before booking; staff may correct the
 *   data and try again.
 * - `needs_review`: a previous integrity or validation failure is waiting
 *   for an explicit staff decision.
 */
export type DispatchShipmentState =
  | "none"
  | "queued"
  | "submitting"
  | "created"
  | "unknown"
  | "rejected"
  | "needs_review";

export type DispatchOrderStatus = "confirmed" | "cancelled";

// Callers normalize project payment failures to pending; only paid may proceed.
export type DispatchPaymentStatus = "pending" | "paid" | "refunded" | "partially_refunded";

/**
 * The verified-provider-success receipt, described only by the bindings a
 * server would check. A missing or mismatched receipt can never be
 * overridden by a staff acknowledgement.
 */
export interface DispatchPaymentReceipt {
  /** Whether a receipt exists at all. */
  present: boolean;
  /** Whether the receipt records a verified provider success. */
  verified: boolean;
  /** Whether the receipt is bound to this order. */
  orderBindingMatches: boolean;
  /** Whether the receipt's payment identity matches the order's attempt. */
  paymentIdentityMatches: boolean;
  /** Whether amount and currency match the server-owned expectation. */
  amountAndCurrencyMatch: boolean;
}

export interface DispatchOrderState {
  orderStatus: DispatchOrderStatus;
  paymentStatus: DispatchPaymentStatus;
  receipt: DispatchPaymentReceipt;
}

/**
 * The retry state of a definitively rejected attempt. A retry only exists
 * for a documented "no booking happened" result; the budget is never reset by
 * this policy.
 */
export interface DispatchRetryState {
  /** Scheduled retry number, incremented before execution: 1, 2 or 3. */
  retryCount: number;
  /** Immutable fingerprint of the originally submitted input, including overrides. */
  originalInputFingerprint: string;
  /** When the retry becomes due. ISO timestamp, or null when unscheduled. */
  retryAt: string | null;
  /** Whether the recorded failure was a documented retryable no-booking result. */
  retryable: boolean;
}

/** The current integrity and data-validity evidence for the order. */
export interface DispatchValidationEvidence {
  /**
   * The current catalog/coupon comparison result. `not_checked` is treated as
   * unreviewed rather than as a pass.
   */
  pricingStatus: "accepted" | "mismatch" | "not_checked";
  /** Whether the required destination and parcel data is valid. */
  requiredDeliveryDataValid: boolean;
}

/** The review evidence a staff member may have recorded for this order. */
export interface DispatchReviewEvidence {
  /** Fingerprint of the input as it stands now. */
  currentInputFingerprint: string;
  /** Explicit staff approval of delivery input, independent of price exceptions. */
  approvedInputFingerprint?: string;
  /** An explicit acknowledgement of a permitted pricing/coupon exception. */
  pricingException?: {
    acknowledged: boolean;
    /** Fingerprint of the exact input the staff member reviewed. */
    reviewedInputFingerprint: string;
  };
}

export interface DispatchPolicyInput {
  /** The settings as they stand. */
  settings: ShipaSettings;
  /** The environment the shipment is bound to. */
  shipmentEnvironment: ShipaEnvironment;
  source: DispatchSource;
  order: DispatchOrderState;
  shipment: DispatchShipmentState;
  validation: DispatchValidationEvidence;
  review: DispatchReviewEvidence;
  /** Present when this decision is about a retry of a previous attempt. */
  retry: DispatchRetryState | null;
  /** Whether the ministry hold currently closes the buying path. */
  ecommerceHold: boolean;
  /** Injected current time, so retry timing is deterministic and testable. */
  now: Date | number;
}

export type DispatchPolicyReasonCode =
  | "integration_disabled"
  | "environment_mismatch"
  | "ecommerce_hold"
  | "order_cancelled"
  | "payment_not_settled"
  | "payment_refunded"
  | "payment_partially_refunded"
  | "payment_receipt_missing"
  | "payment_receipt_unverified"
  | "payment_order_identity_mismatch"
  | "payment_identity_mismatch"
  | "payment_amount_mismatch"
  | "mode_requires_automatic"
  | "shipment_already_submitted"
  | "shipment_already_created"
  | "shipment_outcome_unknown"
  | "shipment_needs_review"
  | "invalid_delivery_data"
  | "pricing_review_required"
  | "pricing_exception_not_acknowledged"
  | "pricing_exception_fingerprint_stale"
  | "manual_review_required"
  | "retry_not_due"
  | "retry_not_retryable"
  | "retry_count_invalid"
  | "retry_input_changed"
  | "retry_budget_exhausted";

export interface DispatchPolicyDecision {
  /** True only when there is no reason to hold the submission. */
  allowed: boolean;
  /** True when the outcome is a staff review rather than a plain block. */
  requiresStaffReview: boolean;
  /** Every reason that applies, in a stable order. */
  reasons: DispatchPolicyReasonCode[];
}

function fingerprintsMatch(current: string, approved: string | undefined): boolean {
  return current.trim().length > 0 && approved === current;
}

/**
 * Evaluates the dispatch policy.
 *
 * The order of the checks does not change the outcome — every applicable
 * reason is collected — but the codes are stable so the UI, the audit trail
 * and the server can talk about the same thing.
 *
 * A needs_review row always remains blocked here. The caller must first resolve
 * it through an explicit server-owned staff transition to queued, adopting the
 * manual source and storing approval of the current input plus any permitted
 * pricing exception. Re-evaluate that resulting snapshot here before sending.
 * Neither changing a snapshot locally nor this helper authorizes the transition.
 */
export function evaluateDispatchPolicy(input: DispatchPolicyInput): DispatchPolicyDecision {
  const blocking: DispatchPolicyReasonCode[] = [];
  const review: DispatchPolicyReasonCode[] = [];

  const { settings } = input;

  // Integration state.
  if (!settings.enabled) blocking.push("integration_disabled");
  if (input.shipmentEnvironment !== settings.environment) blocking.push("environment_mismatch");
  if (input.ecommerceHold) blocking.push("ecommerce_hold");
  if (input.order.orderStatus === "cancelled") blocking.push("order_cancelled");

  // Payment settlement.
  if (input.order.paymentStatus === "refunded") {
    blocking.push("payment_refunded");
  } else if (input.order.paymentStatus === "partially_refunded") {
    blocking.push("payment_partially_refunded");
  } else if (input.order.paymentStatus !== "paid") {
    blocking.push("payment_not_settled");
  }

  // Verified provider success. These bindings can never be overridden by a
  // staff acknowledgement of a pricing exception.
  const receipt = input.order.receipt;
  if (!receipt.present) {
    blocking.push("payment_receipt_missing");
  } else {
    if (!receipt.verified) blocking.push("payment_receipt_unverified");
    if (!receipt.orderBindingMatches) blocking.push("payment_order_identity_mismatch");
    if (!receipt.paymentIdentityMatches) blocking.push("payment_identity_mismatch");
    if (!receipt.amountAndCurrencyMatch) blocking.push("payment_amount_mismatch");
  }

  // Source eligibility. Manual staff review may act in either mode;
  // automatic dispatch only exists in automatic mode.
  if (input.source === "automatic" && settings.dispatchMode !== "automatic_after_payment") {
    blocking.push("mode_requires_automatic");
  }
  if (input.source === "manual" && !fingerprintsMatch(
    input.review.currentInputFingerprint, input.review.approvedInputFingerprint,
  )) {
    review.push("manual_review_required");
  }

  // Shipment state. An ambiguous or existing booking is never re-created.
  switch (input.shipment) {
    case "submitting":
      blocking.push("shipment_already_submitted");
      break;
    case "created":
      blocking.push("shipment_already_created");
      break;
    case "unknown":
      blocking.push("shipment_outcome_unknown");
      break;
    case "needs_review":
      review.push("shipment_needs_review");
      break;
    case "rejected":
      if (!input.retry) blocking.push("retry_not_retryable");
      break;
    default:
      // `none` and `queued` may proceed to the remaining checks.
      break;
  }

  // Required delivery data. Invalid destination or parcel data is not a
  // pricing exception and cannot be acknowledged away.
  if (!input.validation.requiredDeliveryDataValid) {
    blocking.push("invalid_delivery_data");
  }

  // Pricing and coupon integrity.
  if (input.validation.pricingStatus !== "accepted") {
    if (input.source === "automatic" || input.validation.pricingStatus === "not_checked") {
      // Automatic fulfillment may never acknowledge a pricing mismatch.
      review.push("pricing_review_required");
    } else if (!input.review.pricingException || !input.review.pricingException.acknowledged) {
      review.push("pricing_exception_not_acknowledged");
    } else if (!fingerprintsMatch(
      input.review.currentInputFingerprint,
      input.review.pricingException.reviewedInputFingerprint,
    )) {
      // The acknowledgement was made against an input that has since changed.
      review.push("pricing_exception_fingerprint_stale");
    }
  }

  // Retry handling. A retry needs a documented retryable failure, a due
  // retryAt and an untouched budget.
  if (input.retry) {
    const retry = input.retry;
    // Scheduling has already incremented the count. The third retry may send;
    // its failure cannot schedule another retry. No caller-configurable budget.
    if (!Number.isSafeInteger(retry.retryCount) || retry.retryCount < 1) {
      blocking.push("retry_count_invalid");
    } else if (retry.retryCount > 3) {
      blocking.push("retry_budget_exhausted");
    }
    if (!fingerprintsMatch(input.review.currentInputFingerprint, retry.originalInputFingerprint)) {
      review.push("retry_input_changed");
    }
    if (!retry.retryable) blocking.push("retry_not_retryable");
    const retryAtMs = retry.retryAt ? shipaTimestampMilliseconds(retry.retryAt) : Number.NaN;
    if (Number.isNaN(retryAtMs)) {
      blocking.push("retry_not_due");
    } else {
      const nowMs = input.now instanceof Date ? input.now.getTime() : input.now;
      if (!Number.isFinite(nowMs) || nowMs < retryAtMs) blocking.push("retry_not_due");
    }
  }

  const reasons = [...blocking, ...review];
  return {
    allowed: reasons.length === 0,
    requiresStaffReview: review.length > 0,
    reasons,
  };
}
