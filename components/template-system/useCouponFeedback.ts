import { useEffect, useState } from "react";

export interface CouponFeedback {
  success: boolean;
  message: string;
}

/**
 * The cart/checkout templates' "code applied" / "code rejected" line.
 *
 * The success line is the template's own state, set from the apply result —
 * but the CODE itself lives in CartContext, which can drop it on its own when
 * the cart changes (PICK6 down to 5 pieces, minimum no longer met, …) and
 * then publishes a `couponNotice` with the reason. Without this hook the old
 * "applied — 15% off" line stayed on screen next to totals that no longer
 * included the discount.
 *
 * Rule: a SUCCESS message is only shown while a code is applied. It is
 * cleared the moment the applied code goes away (or changes), and whenever a
 * removal notice arrives — the notice is then the one message the shopper
 * sees. An error message (a code that was never applied) is untouched.
 */
export function useCouponFeedback(appliedCode: string | null | undefined, couponNotice: string | null | undefined) {
  const [feedback, setFeedback] = useState<CouponFeedback | null>(null);
  const code = appliedCode ?? null;

  useEffect(() => {
    // `code` / `couponNotice` are the triggers; the update itself only
    // inspects the current feedback.
    if (code === null || couponNotice) {
      setFeedback((current) => (current?.success ? null : current));
    }
  }, [code, couponNotice]);

  // Render through the rule as well, so a stale success line never shows for
  // even the one render before the effect above clears it.
  return [visibleCouponFeedback(feedback, code, couponNotice), setFeedback] as const;
}

/** Pure form of the rule above, for tests and non-React callers. */
export function visibleCouponFeedback(
  feedback: CouponFeedback | null,
  appliedCode: string | null | undefined,
  couponNotice: string | null | undefined,
): CouponFeedback | null {
  if (feedback?.success && (!appliedCode || couponNotice)) return null;
  return feedback;
}
