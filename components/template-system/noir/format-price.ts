import { STORE_CURRENCY } from "#root/shared/config/branding";

/**
 * Noir (Demo 5) price formatter.
 *
 * All Noir components MUST use this — never hardcode a currency
 * code or symbol. Output style: "<STORE_CURRENCY> 42.00".
 */
export function formatNoirPrice(amount: number): string {
  return `${STORE_CURRENCY} ${amount.toFixed(2)}`;
}
