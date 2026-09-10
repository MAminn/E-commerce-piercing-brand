import { Effect } from "effect";
import { getEmailBranding } from "#root/backend/emails/branding";
import { renderEmailTemplate } from "#root/shared/email/service";
import { toAbsoluteUrl } from "#root/shared/config/site-url";

/** Product/upload images are stored as relative paths — an email client has no page to resolve them against, so absolutize (same reason the logo needed the fix in backend/emails/branding.ts). Cache-bust for the same reason as the logo — see the comment there. */
function absolutizeImage(url: string | undefined): string | undefined {
  if (!url || url.startsWith("data:")) return undefined;
  return `${toAbsoluteUrl(url)}?cb=corp-fix-20260811`;
}
import type { ScheduledEmailRow } from "#root/shared/database/drizzle/schema";
import {
  registerEmailRenderer,
  type RenderedScheduledEmail,
} from "../render";
import { getEffectiveTemplate } from "./service";
import { substituteTokens } from "./substitute";
import { EMAIL_TOKENS } from "#root/shared/email-tokens";
import {
  MarketingEmailLayout,
  type MarketingEmailFeaturedItem,
} from "./MarketingEmailLayout";
import type { EmailAutomationType } from "../queue/service";

function readString(
  payload: unknown,
  key: string,
  fallback = "",
): string {
  if (!payload || typeof payload !== "object") return fallback;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

function readFeaturedItem(payload: unknown): MarketingEmailFeaturedItem | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;

  // abandoned_cart: payload.items is an array; feature the first item and
  // note how many more there are rather than trying to lay out a full grid.
  if (Array.isArray(p.items) && p.items.length > 0) {
    const first = p.items[0] as Record<string, unknown>;
    const extra = p.items.length - 1;
    return {
      imageUrl: absolutizeImage(typeof first.imageUrl === "string" ? first.imageUrl : undefined),
      name: typeof first.name === "string" ? first.name : "",
      subtitle:
        extra > 0
          ? `+ ${extra} more item${extra > 1 ? "s" : ""}`
          : typeof first.subtitle === "string"
            ? first.subtitle
            : undefined,
      priceLabel: typeof first.priceLabel === "string" ? first.priceLabel : undefined,
    };
  }

  // review_check / abandoned_browse / new_drops: single named product.
  const productName = readString(payload, "productName");
  if (!productName) return undefined;
  return {
    imageUrl: absolutizeImage(readString(payload, "productImageUrl") || undefined),
    name: productName,
    subtitle: readString(payload, "productSubtitle") || undefined,
    priceLabel: readString(payload, "priceLabel") || undefined,
  };
}

async function renderGeneric(
  row: ScheduledEmailRow,
  unsubscribeUrl: string,
  stepKey: string,
): Promise<RenderedScheduledEmail> {
  const [template, branding] = await Promise.all([
    getEffectiveTemplate(row.automationType, stepKey),
    getEmailBranding(),
  ]);

  if (!template.enabled) {
    throw new Error(
      `Template ${row.automationType}:${stepKey} is disabled by the admin`,
    );
  }

  const locale = row.locale;
  // Always the real code attached via emailTemplate.promoCodeId (set from
  // the admin's Promo Codes page) — never anything from the send payload,
  // so nothing outside that page can generate/invent a code.
  const tokenValues: Record<string, string> = {
    storeName: branding.storeName,
    discountCode: template.promoCode?.code ?? "",
    productName: readString(row.payload, "productName"),
    customerName: readString(row.payload, "customerName"),
    cartTotal: readString(row.payload, "cartTotal"),
  };
  // Both the English and Arabic bracketed label resolve to the same value,
  // since a single template's fields can mix which language's tokens they
  // use (e.g. an English subject with an Arabic body).
  const tokens: Record<string, string> = {};
  for (const t of EMAIL_TOKENS) {
    const value = tokenValues[t.key] ?? "";
    tokens[t.labelEn] = value;
    tokens[t.labelAr] = value;
  }

  const subject = substituteTokens(
    locale === "ar" ? template.subjectAr : template.subjectEn,
    tokens,
  );
  const preheader = substituteTokens(
    locale === "ar" ? template.preheaderAr : template.preheaderEn,
    tokens,
  );
  const headline = substituteTokens(
    locale === "ar" ? template.content.headlineAr : template.content.headlineEn,
    tokens,
  );
  const body = substituteTokens(
    locale === "ar" ? template.content.bodyAr : template.content.bodyEn,
    tokens,
  );
  const ctaLabel = substituteTokens(
    locale === "ar" ? template.content.ctaLabelAr : template.content.ctaLabelEn,
    tokens,
  );
  const discountBadgeText = template.content.showDiscountCode
    ? substituteTokens(
        locale === "ar"
          ? template.content.discountBadgeTextAr
          : template.content.discountBadgeTextEn,
        tokens,
      )
    : undefined;

  const html = await Effect.runPromise(
    renderEmailTemplate(
      MarketingEmailLayout({
        storeName: branding.storeName,
        logoUrl: branding.logoUrl,
        preheader,
        headline,
        body,
        ctaLabel: ctaLabel || undefined,
        ctaHref: template.content.ctaHref
          ? toAbsoluteUrl(template.content.ctaHref)
          : undefined,
        featuredItem: template.content.showFeaturedItem
          ? readFeaturedItem(row.payload)
          : undefined,
        showReviewStars: template.content.showReviewStars,
        discountBadgeText,
        socialLinks: branding.socialLinks,
        unsubscribeUrl,
        contactEmail: branding.contactEmail,
        dir: locale === "ar" ? "rtl" : "ltr",
      }),
    ),
  );

  return { subject, html };
}

function registerSingleStep(automationType: EmailAutomationType): void {
  registerEmailRenderer(automationType, (row, unsubscribeUrl) =>
    renderGeneric(row, unsubscribeUrl, "default"),
  );
}

/**
 * Registers the HTML renderer for every marketing automation type. Import
 * this module once (for its side effect) before the worker or the
 * admin "send test" endpoint might need to render anything — worker.ts and
 * the templates tRPC router both do `import "./register"` for this reason.
 */
export function registerAllEmailRenderers(): void {
  registerSingleStep("welcome");
  registerSingleStep("review_check");
  registerSingleStep("abandoned_browse");
  registerSingleStep("win_back");
  registerSingleStep("new_drops");
  registerSingleStep("flash_offer");
  registerSingleStep("retention");

  // abandoned_cart is the one multi-step automation: which of the 3 templates
  // to use is carried in row.payload.step (set by whatever enqueues it),
  // defaulting to step1 if missing rather than throwing — a malformed
  // payload should degrade to the first-touch email, not fail the send.
  registerEmailRenderer("abandoned_cart", (row, unsubscribeUrl) => {
    const step = readString(row.payload, "step") || "step1";
    return renderGeneric(row, unsubscribeUrl, step);
  });
}

let registered = false;
/** Idempotent — safe to import this module from multiple places. */
function registerOnce(): void {
  if (registered) return;
  registered = true;
  registerAllEmailRenderers();
}
registerOnce();
