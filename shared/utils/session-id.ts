import { v7 } from "uuid";

const SESSION_ID_KEY = "tracking_session_id";

/**
 * Generate or retrieve a persistent session ID from localStorage.
 * Falls back to a new UUID per page load if localStorage is unavailable.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") {
    return v7();
  }

  try {
    let sessionId = window.localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = v7();
      window.localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // localStorage might be disabled (private browsing, etc.)
    return v7();
  }
}
