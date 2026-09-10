import React, {
  createContext,
  useContext,
  type ReactNode,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  templateConfig,
  type TemplateCategory,
} from "#root/components/template-system/templateConfig";
import { trpc } from "#root/shared/trpc/client";
import { usePageContext } from "vike-react/usePageContext";

// Re-export TemplateCategory for convenience
export type { TemplateCategory } from "#root/components/template-system/templateConfig";

// Template selection type
export type TemplateSelection = {
  [K in TemplateCategory]?: string | null;
};

// Template context type
interface TemplateContextType {
  activeTemplates: Record<string, string>;
  switchTemplate: (category: string, templateId: string) => void;
  getActiveTemplate: (category: string) => string;
  selection: TemplateSelection;
  getTemplateId: (category: TemplateCategory) => string | null;
  setTemplate: (category: TemplateCategory, templateId: string) => void;
  /** True while the initial DB fetch is in progress */
  isLoading: boolean;
}

// Create context
const TemplateContext = createContext<TemplateContextType | undefined>(
  undefined,
);

// localStorage key — used only as a fast hydration cache, NOT source of truth
const TEMPLATE_CACHE_KEY = "template-selection-cache";

// Legacy V1 localStorage keys (kept for backward compat of legacy panel)
const TEMPLATE_STORAGE_KEY = "selected-templates";

// Build default selection from templateConfig
function getDefaultSelection(): TemplateSelection {
  const defaultSelection: TemplateSelection = {};

  (Object.keys(templateConfig) as TemplateCategory[]).forEach((category) => {
    const templates = templateConfig[category];
    if (templates && templates.length > 0) {
      defaultSelection[category] = templates[0]?.id;
    }
  });

  return defaultSelection;
}

// Validate that saved template IDs still exist in templateConfig
function validateSelection(saved: TemplateSelection): TemplateSelection {
  const defaults = getDefaultSelection();
  const validated: TemplateSelection = { ...defaults };

  (Object.keys(saved) as TemplateCategory[]).forEach((category) => {
    const id = saved[category];
    if (id && templateConfig[category]) {
      const exists = templateConfig[category].some((t) => t.id === id);
      if (exists) {
        validated[category] = id;
      }
    }
  });

  return validated;
}

// Read localStorage cache (fast hydration before DB response)
function readCache(): TemplateSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TEMPLATE_CACHE_KEY);
    if (raw) return JSON.parse(raw) as TemplateSelection;
  } catch {
    // Corrupt cache — ignore
  }
  return null;
}

// Write localStorage cache
function writeCache(selection: TemplateSelection) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(selection));
  } catch {
    // localStorage full or unavailable — harmless
  }
}

// Template provider component
export function TemplateProvider({ children }: { children: ReactNode }) {
  // Read SSR-injected template selection from page context (available on both server & client)
  const pageContext = usePageContext();
  const ssrSelection = pageContext.templateSelection as
    | Record<string, string>
    | undefined;
  const hasSSR =
    !!ssrSelection && Object.keys(ssrSelection).length > 0;

  // Initialize: SSR data (highest priority) → cache → defaults
  const [selection, setSelection] = useState<TemplateSelection>(() => {
    if (hasSSR) {
      const validated = validateSelection(ssrSelection as TemplateSelection);
      // Eagerly write SSR data to cache for subsequent navigations
      writeCache(validated);
      return validated;
    }
    const cached = readCache();
    if (cached) return validateSelection(cached);
    return getDefaultSelection();
  });

  // If SSR provided the selection, we already have the truth — no loading flicker
  const [isLoading, setIsLoading] = useState(!hasSSR);

  // Legacy V1 active templates (kept for backward compat)
  const [activeTemplates, setActiveTemplates] = useState<
    Record<string, string>
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }
    return {
      home: "default",
      men: "default",
      women: "default",
      brands: "default",
      products: "default",
      product: "default-product",
      cart: "default",
      checkout: "default",
    };
  });

  // Track whether DB fetch completed to avoid writing stale cache
  const dbLoaded = useRef(false);

  // ───────────────────────────────────────────────────
  // Fetch template selection from DB on mount (source of truth)
  // Skip if SSR already provided accurate data
  // ───────────────────────────────────────────────────
  useEffect(() => {
    // SSR already gave us the DB selection — no need to re-fetch
    if (hasSSR) {
      dbLoaded.current = true;
      return;
    }

    let cancelled = false;

    trpc.settings.getTemplateSelection
      .query()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.result) {
          const dbSelection = res.result as Record<string, string>;
          // Only apply if DB has any saved selection
          if (Object.keys(dbSelection).length > 0) {
            const validated = validateSelection(
              dbSelection as TemplateSelection,
            );
            setSelection(validated);
            writeCache(validated);
          }
          // else: no DB selection yet → keep defaults (will be written on first admin save)
        }
        dbLoaded.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch template selection from DB:", err);
        // Keep cached/default selection on error — storefront still works
        dbLoaded.current = true;
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ───────────────────────────────────────────────────
  // V2 setTemplate: write to DB, then update state + cache
  // ───────────────────────────────────────────────────
  const setTemplate = useCallback(
    (category: TemplateCategory, templateId: string) => {
      // Optimistic local update
      setSelection((prev) => {
        const next = { ...prev, [category]: templateId };
        writeCache(next);

        // Persist to DB (fire-and-forget with error handling)
        // Build the full selection to send to the server
        const fullSelection: Record<string, string> = {};
        for (const [k, v] of Object.entries(next)) {
          if (v) fullSelection[k] = v;
        }

        trpc.settings.updateTemplateSelection
          .mutate({ selection: fullSelection })
          .catch((err) => {
            console.error("Failed to save template selection to DB:", err);
          });

        return next;
      });
    },
    [],
  );

  // ───────────────────────────────────────────────────
  // V1 legacy switchTemplate (localStorage-only, backward compat)
  // ───────────────────────────────────────────────────
  const switchTemplate = useCallback((category: string, templateId: string) => {
    setActiveTemplates((prev) => {
      const next = { ...prev, [category]: templateId };
      if (typeof window !== "undefined") {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const getActiveTemplate = useCallback(
    (category: string) => {
      return activeTemplates[category] || "default";
    },
    [activeTemplates],
  );

  const getTemplateId = useCallback(
    (category: TemplateCategory): string | null => {
      // Check for preview override via query param
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const previewTemplate = urlParams.get("templatePreview");

        if (previewTemplate) {
          const templates = templateConfig[category];
          if (templates && templates.some((t) => t.id === previewTemplate)) {
            return previewTemplate;
          }
        }
      }

      return selection[category] || null;
    },
    [selection],
  );

  return (
    <TemplateContext.Provider
      value={{
        activeTemplates,
        switchTemplate,
        getActiveTemplate,
        selection,
        getTemplateId,
        setTemplate,
        isLoading,
      }}>
      {children}
    </TemplateContext.Provider>
  );
}

// Hook to use template context
export function useTemplate() {
  const context = useContext(TemplateContext);
  if (context === undefined) {
    throw new Error("useTemplate must be used within a TemplateProvider");
  }
  return context;
}

export default TemplateProvider;
