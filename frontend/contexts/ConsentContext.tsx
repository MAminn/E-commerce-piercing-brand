import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type {
  ConsentCategories,
  ConsentMethodType,
  ConsentState,
} from "#root/shared/types/pixel-tracking";
import {
  getDefaultConsentState,
  buildAcceptAllConsent,
  buildRejectAllConsent,
  isConsentExpired,
  serializeConsentCookie,
  deserializeConsentCookie,
  CONSENT_COOKIE_NAME,
} from "#root/backend/pixel-tracking/consent/service";

// ─── Context Types ──────────────────────────────────────────────────────────

interface ConsentContextValue {
  /** Current consent state. */
  consent: ConsentState;
  /** Whether the consent banner should be shown. */
  showBanner: boolean;
  /** Accept all tracking categories. */
  acceptAll: () => void;
  /** Reject all non-functional tracking categories. */
  rejectAll: () => void;
  /** Update individual categories. */
  updateCategories: (categories: ConsentCategories) => void;
  /** Dismiss the banner without changing consent (implied consent). */
  dismissBanner: () => void;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

// ─── Cookie Helpers ─────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;expires=${expires.toUTCString()};SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(getDefaultConsentState);
  const [showBanner, setShowBanner] = useState(false);

  // Load consent from cookie on mount
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cookieValue = getCookie(CONSENT_COOKIE_NAME);
    if (cookieValue) {
      const parsed = deserializeConsentCookie(cookieValue);
      if (parsed && !isConsentExpired(parsed)) {
        setConsent(parsed);
        setShowBanner(false);
        return;
      }
    }

    // No valid consent cookie — show banner
    setShowBanner(true);
  }, []);

  /** Persist consent state to cookie and optionally to server. */
  const persistConsent = useCallback(
    (state: ConsentState) => {
      setConsent(state);
      setShowBanner(false);
      setCookie(CONSENT_COOKIE_NAME, serializeConsentCookie(state), 365);

      // Fire a custom event so TrackingContext can react
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tracking:consent-changed", { detail: state }),
        );
      }
    },
    [],
  );

  const acceptAll = useCallback(() => {
    persistConsent(buildAcceptAllConsent("banner_accept"));
  }, [persistConsent]);

  const rejectAll = useCallback(() => {
    persistConsent(buildRejectAllConsent("banner_reject"));
  }, [persistConsent]);

  const updateCategories = useCallback(
    (categories: ConsentCategories) => {
      const state: ConsentState = {
        given: true,
        categories: { ...categories, functional: true }, // Functional is always on
        method: "settings_page",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };
      persistConsent(state);
    },
    [persistConsent],
  );

  const dismissBanner = useCallback(() => {
    // Dismiss without explicit consent = implied consent (functional only)
    const state: ConsentState = {
      given: false,
      categories: { functional: true, analytics: false, marketing: false },
      method: "implied",
      expiresAt: null,
    };
    setConsent(state);
    setShowBanner(false);
    // Don't persist to cookie — banner will reappear on next visit
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      showBanner,
      acceptAll,
      rejectAll,
      updateCategories,
      dismissBanner,
    }),
    [consent, showBanner, acceptAll, rejectAll, updateCategories, dismissBanner],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return context;
}
