/** Fixed wording only; database refusal remains authoritative for every payment status. */
export function orderDeletionErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "40001" && "message" in error &&
      error.message === "payment_invoice_identity_retained") {
      return "This order is protected because a MyFatoorah invoice has been assigned. " +
        "Orders with assigned invoices cannot be deleted, including pending or failed payments.";
    }
    if (error.code === "23503") {
      return "This order is protected by linked records and cannot be deleted. " +
        "Orders with an assigned MyFatoorah invoice stay protected, including pending or failed payments.";
    }
  }
  return "The order could not be deleted. Please refresh the order list.";
}
