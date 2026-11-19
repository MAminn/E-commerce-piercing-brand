import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutSettingsContext } from "#root/frontend/contexts/LayoutSettingsContext";
import {
  DEFAULT_LAYOUT_SETTINGS,
  type LayoutSettings,
} from "#root/shared/types/layout-settings";
import type { PublishedLegalPage } from "#root/shared/legal/legal-pages";

// The footer needs the current path and the live legal pages from the page context.
let currentPath = "/";
let currentLegalPages: PublishedLegalPage[] | undefined;
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: currentPath, legalPages: currentLegalPages }),
}));
// Newsletter submit is never exercised here; keep the module free of a
// real HTTP client and of sonner's DOM-bound toaster.
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MinimalFooter } from "../MinimalFooter";
import { MinimalI18nProvider } from "#root/lib/i18n/MinimalI18nContext";

function render(overrides: Partial<LayoutSettings["footer"]> = {}, path = "/") {
  currentPath = path;
  const settings: LayoutSettings = {
    ...DEFAULT_LAYOUT_SETTINGS,
    footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, ...overrides },
  };
  return renderToStaticMarkup(
    createElement(
      LayoutSettingsContext.Provider,
      { value: settings },
      createElement(MinimalFooter),
    ),
  );
}

describe("MinimalFooter newsletter block", () => {
  it("renders the signup when footer.showNewsletter is true", () => {
    const html = render({ showNewsletter: true });
    expect(html).toContain("Join the list");
    expect(html).toContain('type="email"');
  });

  it("hides the whole signup when footer.showNewsletter is false", () => {
    const html = render({ showNewsletter: false });
    expect(html).not.toContain("Join the list");
    expect(html).not.toContain('type="email"');
  });

  it("still hides the duplicate signup on /offers regardless of the switch", () => {
    const html = render({ showNewsletter: true }, "/offers");
    expect(html).not.toContain("Join the list");
  });

  it("ships no offer language in the signup copy", () => {
    const html = render({ showNewsletter: true });
    expect(html).not.toMatch(/offers/i);
    expect(html).not.toContain("in your inbox");
  });
});

describe("MinimalFooter default links and copy", () => {
  it("links no Offers page by default", () => {
    const html = render();
    expect(html).not.toContain('href="/offers"');
    expect(html).not.toContain(">Offers<");
  });

  it("keeps the approved default shop and help links", () => {
    const html = render();
    for (const href of ["/shop", "/shop?section=newarrivals", "/bundles", "/contact", "/account"]) {
      expect(html, `expected a link to ${href}`).toContain(`href="${href}"`);
    }
  });
});

describe("MinimalFooter contact column", () => {
  it("shows the configured phone and email as tel: and mailto: links", () => {
    const html = render({ contactPhone: "010 3579 0911", contactEmail: "hello@example.com" });
    expect(html).toContain('href="tel:01035790911"');
    expect(html).toContain(">010 3579 0911<");
    expect(html).toContain('href="mailto:hello@example.com"');
    expect(html).toContain("<address");
  });

  it("renders no address when none is configured", () => {
    const html = render({ contactPhone: "01035790911", contactEmail: "hello@example.com" });
    expect(html).not.toContain("footer-address");
    const blank = render({ contactPhone: "01035790911", contactAddress: "   ", contactAddressAr: "" });
    expect(blank).not.toContain("footer-address");
  });

  it("renders a configured address", () => {
    const html = render({ contactEmail: "hello@example.com", contactAddress: "12 Example St, Cairo" });
    expect(html).toMatch(/data-testid="footer-address"[^>]*>12 Example St, Cairo</);
  });

  it("hides the whole column when nothing is configured", () => {
    const html = render({ contactPhone: "", contactEmail: "", contactAddress: "" });
    expect(html).not.toContain("<address");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("mailto:");
  });

  it("ships no address by default", () => {
    expect(DEFAULT_LAYOUT_SETTINGS.footer.contactAddress).toBe("");
    expect(DEFAULT_LAYOUT_SETTINGS.footer.contactAddressAr).toBe("");
  });
});

describe("MinimalFooter policy links", () => {
  const returns: PublishedLegalPage = { key: "returnPolicy", href: "/return-policy", title: "Returns", titleAr: "الإرجاع" };
  const shipping: PublishedLegalPage = { key: "shippingPolicy", href: "/shipping-policy", title: "Shipping", titleAr: "الشحن" };

  function renderWith(legalPages: PublishedLegalPage[], groups = DEFAULT_LAYOUT_SETTINGS.footer.footerLinkGroups) {
    currentLegalPages = legalPages;
    try {
      return render({ footerLinkGroups: groups });
    } finally {
      currentLegalPages = undefined;
    }
  }

  it("keeps Returns and adds Shipping when both pages are live", () => {
    const html = renderWith([returns, shipping]);
    expect(html).toContain('href="/return-policy"');
    expect(html).toContain('href="/shipping-policy"');
  });

  it("never links an unpublished privacy page or a refund alias whose policy is off", () => {
    const legal = {
      id: "legal",
      title: "Legal",
      links: [
        { id: "p", label: "Privacy", url: "/privacy" },
        { id: "r", label: "Refunds", url: "/refund-policy" },
      ],
    };
    const html = renderWith([shipping], [legal]);
    expect(html).not.toContain('href="/privacy"');
    expect(html).not.toContain('href="/refund-policy"');
    expect(html).toContain('href="/shipping-policy"');
  });

  it("keeps an admin's Refund link while the return policy is live", () => {
    const help = {
      id: "help",
      title: "Help",
      links: [{ id: "r", label: "Refunds", url: "/refund-policy" }],
    };
    const html = renderWith([returns, shipping], [help]);
    expect(html).toContain('href="/refund-policy"');
    expect(html).toContain('href="/return-policy"');
  });
});

function renderIn(locale: "en" | "ar", overrides: Partial<LayoutSettings["footer"]> = {}) {
  currentPath = "/";
  const settings: LayoutSettings = {
    ...DEFAULT_LAYOUT_SETTINGS,
    footer: { ...DEFAULT_LAYOUT_SETTINGS.footer, ...overrides },
  };
  return renderToStaticMarkup(
    <MinimalI18nProvider ssrLocale={locale}>
      <LayoutSettingsContext.Provider value={settings}>
        <MinimalFooter />
      </LayoutSettingsContext.Provider>
    </MinimalI18nProvider>,
  );
}
const serviceLine = (html: string) =>
  html.match(/data-testid="footer-service-line"[^>]*>([^<]*)</)?.[1];

describe("MinimalFooter service line", () => {
  it("English: delivery to selected governorates, never 'across Egypt'", () => {
    const html = renderIn("en");
    expect(serviceLine(html)).toBe("Delivery to selected governorates · Cash on delivery");
    expect(html).not.toContain("Delivery across Egypt");
  });

  it("Arabic: the approved translation, never 'لكل مصر'", () => {
    const html = renderIn("ar");
    expect(serviceLine(html)).toBe("توصيل إلى محافظات مختارة · الدفع عند الاستلام");
    expect(html).not.toContain("توصيل لكل مصر");
  });
});

describe("MinimalFooter Arabic labels for CMS links saved without one", () => {
  const groups = [
    {
      id: "shop",
      title: "Shop",
      links: [
        { id: "a", label: "Shop all", url: "/shop" },
        { id: "n", label: "New in", url: "/shop?section=newarrivals" },
      ],
    },
    {
      id: "help",
      title: "Help",
      links: [
        { id: "c", label: "Contact", url: "/contact" },
        { id: "m", label: "My account", url: "/account" },
        { id: "w", label: "WhatsApp", url: "https://wa.me/201000000000" },
      ],
    },
  ];

  it("translates the standard labels in Arabic and keeps custom ones as written", () => {
    const html = renderIn("ar", { footerLinkGroups: groups });
    for (const ar of ["المتجر", "مساعدة", "تواصل معنا", "حسابي", "جديد"]) {
      expect(html, ar).toContain(`>${ar}<`);
    }
    expect(html).not.toMatch(/>(Shop|Help|Contact|My account|New in)</);
    // A brand / custom label is not machine-translated.
    expect(html).toContain(">WhatsApp<");
  });

  it("an admin's own Arabic label wins", () => {
    const html = renderIn("ar", {
      footerLinkGroups: [{ id: "h", title: "Help", titleAr: "الدعم", links: [{ id: "c", label: "Contact", labelAr: "راسلنا", url: "/contact" }] }],
    });
    expect(html).toContain(">الدعم<");
    expect(html).toContain(">راسلنا<");
  });

  it("English is unchanged", () => {
    const html = renderIn("en", { footerLinkGroups: groups });
    for (const en of ["Shop", "Help", "Contact", "My account", "New in"]) {
      expect(html, en).toContain(`>${en}<`);
    }
  });
});
