/**
 * Fincart is opt-in only. Set FINCART_ENABLED=true to send orders to Fincart.
 * Stores using Bosta (SYN_BOSTA_KEY) can leave this unset.
 */
export function isFincartEnabled(): boolean {
  return process.env.FINCART_ENABLED === "true";
}
