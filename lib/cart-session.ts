const SESSION_TOKEN_KEY = "cart-session-token";

/**
 * Anonymous per-browser identifier used to correlate a localStorage cart
 * with its server-side capture row (captured_cart), independent of login —
 * most abandoned carts belong to visitors who never create an account.
 * Persisted in localStorage (not a cookie): only ever read/written from the
 * browser via tRPC calls, no SSR or server-side access needed.
 */
export function getCartSessionToken(): string {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  }
  return token;
}
