// Client-side capability checks that decide whether to OFFER a device wallet
// at checkout. They do not guarantee the wallet completes — Apple Pay / Google
// Pay must also be enabled on the MyFatoorah account/domain. They only govern
// whether we surface the button to the customer.

/** Apple Pay is available on Apple devices/Safari that support it. */
export function canUseApplePay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ApplePaySession = (window as unknown as {
      ApplePaySession?: { canMakePayments?: () => boolean };
    }).ApplePaySession;
    return !!ApplePaySession?.canMakePayments?.();
  } catch {
    return false;
  }
}

/** Google Pay is offered on Android / Chrome (never Apple Safari). */
export function canUseGooglePay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    const isChrome = /Chrome|CriOS/i.test(ua) && !/Edg|OPR|Edge/i.test(ua);
    const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
    const hasPaymentRequest = typeof (window as unknown as { PaymentRequest?: unknown }).PaymentRequest !== "undefined";
    // Offer on Android, or on desktop/mobile Chrome that supports PaymentRequest,
    // but never on Apple Safari where Apple Pay is the native wallet.
    if (isApple && !isAndroid) return false;
    return isAndroid || (isChrome && hasPaymentRequest);
  } catch {
    return false;
  }
}
