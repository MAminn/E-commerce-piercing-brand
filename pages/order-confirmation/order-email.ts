/**
 * The order-confirmation URL and the customer email shown on that page.
 *
 * The email used to travel in the URL (`?email=`), so every pixel and the
 * tracking beacon on the confirmation page received it as part of the page
 * address. It now stays in this tab's sessionStorage, keyed by order id, and
 * the URL carries only the order id, the total and the payment state.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const orderEmailKey = (orderId: string) => `order_email:${orderId}`;

export function saveOrderEmail(
  storage: StorageLike | null | undefined,
  orderId: string,
  email: string,
): void {
  if (!orderId || !email) return;
  try {
    storage?.setItem(orderEmailKey(orderId), email);
  } catch {
    /* private mode / quota — the page simply shows no address */
  }
}

export function readOrderEmail(
  storage: StorageLike | null | undefined,
  orderId: string,
): string {
  if (!orderId) return "";
  try {
    return storage?.getItem(orderEmailKey(orderId)) ?? "";
  } catch {
    return "";
  }
}

export type ConfirmationPayment = "success" | "cancelled" | "pending";

/**
 * `/order-confirmation?id=…&total=…[&payment=…]`, absolute when `origin` is
 * given (payment-gateway return URLs). Never contains customer data.
 */
export function buildOrderConfirmationUrl(input: {
  orderId: string;
  total: string | number;
  payment?: ConfirmationPayment;
  origin?: string;
}): string {
  const params = new URLSearchParams();
  params.set("id", input.orderId);
  params.set("total", String(input.total));
  if (input.payment) params.set("payment", input.payment);
  return `${input.origin ?? ""}/order-confirmation?${params.toString()}`;
}
