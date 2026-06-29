// Pure mapping of MyFatoorah payment details -> Curemed internal status.
// Used by both the callback-verify and webhook functions so the rules stay
// identical. Success is always final and must never be downgraded.

export type InternalPaymentStatus =
  | "paid"
  | "payment_failed"
  | "payment_cancelled"
  | "payment_expired"
  | "pending_payment"
  | "pending_status_update";

export interface MappedStatus {
  paymentStatus: InternalPaymentStatus;
  isSuccess: boolean;
  isFinal: boolean;
  providerStatus: string;
  errorCode?: string;
  errorMessage?: string;
}

interface NormalizedInput {
  invoiceStatus?: string | null;
  transactionStatus?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/**
 * Accepts either:
 *  - the GET /v3/payments {paymentId} Data object ({ Invoice, Transaction, ... })
 *  - the webhook v2 Data object ({ Invoice, Transaction, ... })
 * Both share the Invoice.Status / Transaction.Status shape.
 */
export function mapMyFatoorahStatus(data: unknown): MappedStatus {
  const n = normalize(data);
  const invoice = (n.invoiceStatus ?? "").toUpperCase();
  const txn = (n.transactionStatus ?? "").toUpperCase();
  const providerStatus = txn || invoice || "UNKNOWN";

  // Success is final.
  if (txn === "SUCCESS" || invoice === "PAID") {
    return { paymentStatus: "paid", isSuccess: true, isFinal: true, providerStatus };
  }

  if (txn === "FAILED") {
    return {
      paymentStatus: "payment_failed",
      isSuccess: false,
      isFinal: true,
      providerStatus,
      errorCode: n.errorCode ?? undefined,
      errorMessage: n.errorMessage ?? undefined,
    };
  }

  if (txn === "CANCELED" || txn === "CANCELLED") {
    return { paymentStatus: "payment_cancelled", isSuccess: false, isFinal: true, providerStatus };
  }

  if (invoice === "EXPIRED") {
    return { paymentStatus: "payment_expired", isSuccess: false, isFinal: true, providerStatus };
  }

  // AUTHORIZE / PENDING / no final transaction yet.
  if (txn === "AUTHORIZE" || invoice === "PENDING" || txn === "" ) {
    return { paymentStatus: "pending_payment", isSuccess: false, isFinal: false, providerStatus };
  }

  // Unknown / unexpected -> needs manual or scheduled follow-up.
  return { paymentStatus: "pending_status_update", isSuccess: false, isFinal: false, providerStatus };
}

function normalize(data: unknown): NormalizedInput {
  const d = (data ?? {}) as Record<string, any>;
  const invoice = d.Invoice ?? {};
  const transaction = d.Transaction ?? {};
  const error = transaction.Error ?? {};
  return {
    invoiceStatus: invoice.Status ?? null,
    transactionStatus: transaction.Status ?? null,
    errorCode: error.Code ?? null,
    errorMessage: error.Message ?? null,
  };
}
