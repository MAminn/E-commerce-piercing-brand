"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useCart } from "#root/lib/context/CartContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { trpc } from "#root/shared/trpc/client";
import { Link } from "#root/components/utils/Link";
import { Check, ChevronRight, Copy, Loader2, Send, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "#root/lib/utils";
import type {
  OfferCondition,
  OfferReward,
} from "#root/shared/database/drizzle/schema";
import { AuthContext } from "#root/context/AuthContext.js";
import { formatMoney } from "#root/shared/pricing/format-money";
import { OFFERS_PAGE_EMPTY_COPY, offersPageState } from "#root/components/offers/offersPageState";
import type { BundleCardCampaign } from "#root/components/bundles/BundleCampaignCard";
import { SetOfferCard } from "#root/components/bundles/SetOfferCard";
import { builderForCode } from "#root/components/bundles/set-offer";
import { bundleHref } from "#root/components/bundles/bundle-ui";


interface ActiveOffer {
  id: string;
  name: string;
  description: string | null;
  condition: OfferCondition;
  reward: OfferReward;
}

interface PublicPromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  minPurchaseAmount: number | null;
  freeShipping?: boolean;
  eligibleMinQuantity?: number | null;
  eligibleMaxQuantity?: number | null;
}

/** "exactly 6 pieces" / "6 قطع بالضبط" — the code's eligible-quantity rule, or "". */
function quantityRuleText(pc: PublicPromoCode, isAr: boolean): string {
  const min = pc.eligibleMinQuantity ?? null;
  const max = pc.eligibleMaxQuantity ?? null;
  if (min === null && max === null) return "";
  if (min !== null && max !== null && min === max) return isAr ? ` — عند اختيار ${min} قطع بالضبط` : ` — exactly ${min} pieces`;
  if (min !== null && max !== null) return isAr ? ` — من ${min} إلى ${max} قطع` : ` — ${min}–${max} pieces`;
  if (min !== null) return isAr ? ` — ${min} قطع على الأقل` : ` — at least ${min} pieces`;
  return isAr ? ` — حتى ${max} قطع` : ` — up to ${max} pieces`;
}

/**
 * Offer cards used to show 1/2/3-bottle photographs of a previous brand's
 * perfume — complete with that brand's logo on the label. Those assets are
 * not ours to show, so the card now renders a neutral quantity chip until
 * artwork for this brand exists.
 */
function offerQuantityFor(condition: OfferCondition): number | null {
  if (condition.type === "quantity_threshold") {
    return Math.max(1, condition.minQuantity);
  }
  return null;
}

/**
 * Public Offers page — open to every visitor.
 *
 * It used to hide the promo codes behind "Sign in to reveal active promo
 * codes". That gate protected nothing (promoCode.listPublic is a public
 * endpoint that only ever returns codes the merchant marked "show on offers
 * page") and the same PICK3/PICK6 value was already visible on the homepage
 * and in the builders. Signed-in and signed-out visitors now see the same
 * offers; an account stays useful for the wishlist and order history.
 */
export default function OffersPage() {
  const layoutSettings = useLayoutSettings();
  const { locale, t } = useMinimalI18n();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";
  const isAr = locale === "ar";

  const { appliedOffers } = useCart();
  const { session } = useContext(AuthContext);
  const isSignedIn = !!session;

  const [sets, setSets] = useState<BundleCardCampaign[]>([]);
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const [promoCodes, setPromoCodes] = useState<PublicPromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Track which offers just flipped from locked → unlocked so we can play a
  // one-time "you qualified!" flash instead of animating on every re-render.
  const prevUnlockedRef = useRef<Set<string>>(new Set());
  const [justUnlocked, setJustUnlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentlyUnlocked = new Set(appliedOffers.map((o) => o.name));
    const newlyUnlocked = new Set<string>();
    for (const name of currentlyUnlocked) {
      if (!prevUnlockedRef.current.has(name)) newlyUnlocked.add(name);
    }
    prevUnlockedRef.current = currentlyUnlocked;
    if (newlyUnlocked.size > 0) {
      setJustUnlocked(newlyUnlocked);
      const timer = setTimeout(() => setJustUnlocked(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [appliedOffers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Independent requests: one failing must not blank the others.
      const [setsRes, offersRes, codesRes] = await Promise.allSettled([
        trpc.bundle.listLive.query({ type: "build_your_stack" }),
        trpc.offer.listActive.query(),
        trpc.promoCode.listPublic.query(),
      ]);
      if (cancelled) return;
      if (setsRes.status === "fulfilled" && setsRes.value.success && setsRes.value.result) {
        setSets(setsRes.value.result);
      }
      if (offersRes.status === "fulfilled" && offersRes.value.success && offersRes.value.result) {
        setOffers(offersRes.value.result as ActiveOffer[]);
      }
      if (codesRes.status === "fulfilled" && codesRes.value.success && codesRes.value.result) {
        setPromoCodes(codesRes.value.result as PublicPromoCode[]);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pageState = offersPageState({ sets: sets.length, offers: offers.length, promoCodes: promoCodes.length });

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success(isAr ? "تم نسخ الكود" : `Copied "${code}"`);
    } catch {
      toast.error(isAr ? "تعذر نسخ الكود" : "Couldn't copy code");
    }
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!email) return;
    setIsSubscribing(true);
    try {
      const result = await trpc.settings.subscribeNewsletter.mutate({ email });
      if (result.success) {
        toast.success(isAr ? "تم الاشتراك بنجاح!" : "You're subscribed!");
        setNewsletterEmail("");
      } else {
        toast.error(
          result.error || (isAr ? "فشل الاشتراك" : "Failed to subscribe"),
        );
      }
    } catch {
      toast.error(isAr ? "فشل الاشتراك" : "Failed to subscribe");
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!isMinimal) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-perce-ink-muted'>Page not found</p>
      </div>
    );
  }

  return (
    <div className='bg-perce-bg pb-24 lg:pb-12 overflow-x-hidden'>
      <div className='perce-container max-w-5xl py-8 sm:py-12 lg:py-14'>
        {/* Heading */}
        <header className='mb-7 lg:mb-10'>
          <p className='perce-eyebrow'>{isAr ? "العروض" : "Offers"}</p>
          <h1 className='perce-section-title mt-1.5 text-[1.75rem] sm:text-[2rem]'>{t("offers.title")}</h1>
          <p className='mt-2 max-w-prose text-sm text-perce-ink-muted lg:text-base'>{t("offers.intro")}</p>
        </header>

        {isLoading ? (
          <div className='flex items-center justify-center py-16'>
            <Loader2 className='w-6 h-6 animate-spin text-perce-ink-subtle' />
          </div>
        ) : pageState.showGlobalEmpty ? (
          <p className='text-sm text-perce-ink-subtle py-8' data-testid='offers-empty'>
            {isAr ? OFFERS_PAGE_EMPTY_COPY.ar : OFFERS_PAGE_EMPTY_COPY.en}
          </p>
        ) : (
          <>
            {/* Pick Your Set — the main offer, straight into the builder. */}
            {pageState.showSets && (
              <section aria-labelledby='offers-sets' className='mb-10 lg:mb-14' data-testid='offers-sets'>
                <h2 id='offers-sets' className='sr-only'>
                  {t("sets.eyebrow")}
                </h2>
                <div className={cn("grid gap-3 sm:gap-4", sets.length > 1 && "md:grid-cols-2")}>
                  {sets.map((campaign, index) => (
                    <SetOfferCard key={campaign.id} campaign={campaign} ctaLabel={t("sets.build_this")} eager={index < 2} />
                  ))}
                </div>
              </section>
            )}

            {/* Public promo codes — visible to everyone. */}
            {pageState.showPromoCodes && (
              <section aria-labelledby='offers-codes' className='mb-10 lg:mb-14' data-testid='offers-codes'>
                <h2 id='offers-codes' className='text-base font-medium text-perce-ink lg:text-lg'>
                  {t("offers.codes_heading")}
                </h2>
                <p className='mt-1 mb-4 text-xs text-perce-ink-muted lg:text-sm'>{t("offers.codes_intro")}</p>
                <ul className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {promoCodes.map((pc) => {
                    const builder = builderForCode(pc, sets);
                    return (
                      <li
                        key={pc.id}
                        className='flex flex-col border border-dashed border-perce-line-strong bg-perce-surface p-4'
                        data-promo-code={pc.code}>
                        <div className='flex items-start justify-between gap-3'>
                          <p className='text-base font-semibold tracking-wider text-perce-ink'>{pc.code}</p>
                          <button
                            type='button'
                            onClick={() => handleCopyCode(pc.code)}
                            className='inline-flex min-h-9 shrink-0 items-center gap-1.5 border border-perce-line-strong px-3 text-xs font-medium text-perce-ink-secondary transition-colors hover:text-perce-ink'
                            aria-label={`${t("offers.copy")} ${pc.code}`}>
                            {copiedCode === pc.code ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
                            {copiedCode === pc.code ? t("offers.copied") : t("offers.copy")}
                          </button>
                        </div>
                        <p className='mt-1.5 flex-1 text-[13px] leading-snug text-perce-ink-secondary'>
                          {pc.discountType === "percentage"
                            ? isAr
                              ? `خصم ${pc.discountValue}%`
                              : `${pc.discountValue}% off`
                            : isAr
                              ? `خصم ${formatMoney(pc.discountValue, { locale: "ar" })}`
                              : `${formatMoney(pc.discountValue)} off`}
                          {pc.freeShipping ? (isAr ? " + شحن مجاني" : " + free shipping") : ""}
                          {quantityRuleText(pc, isAr)}
                          {pc.minPurchaseAmount
                            ? isAr
                              ? ` — بحد أدنى ${formatMoney(pc.minPurchaseAmount, { locale: "ar" })}`
                              : ` on orders above ${formatMoney(pc.minPurchaseAmount)}`
                            : ""}
                        </p>
                        <Link
                          href={builder ? bundleHref(builder.slug) : "/shop"}
                          className='mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 bg-perce-cta px-4 text-[13px] font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover'>
                          {builder ? t("sets.build_this") : t("offers.shop_now")}
                          <ChevronRight className='h-4 w-4 rtl:rotate-180' aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Automatic cart offers */}
            {pageState.showOffers && (
              <section aria-labelledby='offers-running' className='mb-10 lg:mb-14'>
                <h2 id='offers-running' className='mb-4 text-base font-medium text-perce-ink lg:text-lg'>
                  {t("offers.running_heading")}
                </h2>
                <div className='space-y-3 lg:space-y-4'>
                  {offers.map((offer) => {
                    const isUnlocked = appliedOffers.some((a) => a.name === offer.name);
                    const isFlashing = justUnlocked.has(offer.name);
                    return (
                      <div
                        key={offer.id}
                        className={cn(
                          "relative border p-4 lg:p-6 flex flex-row items-start gap-4 lg:gap-6 transition-colors duration-500",
                          isUnlocked
                            ? "border-emerald-400 bg-emerald-50/60 animate-offer-card-glow"
                            : "border-perce-line bg-perce-bg",
                          isFlashing && "animate-offer-card-flash",
                        )}>
                        <div
                          aria-hidden='true'
                          className='w-16 h-16 sm:w-20 sm:h-20 bg-perce-surface border border-perce-line shrink-0 flex flex-col items-center justify-center text-perce-ink-subtle'>
                          <Tag className='w-5 h-5' />
                          {offerQuantityFor(offer.condition) !== null && (
                            <span className='mt-1 text-[11px] font-semibold tracking-wide'>
                              {offerQuantityFor(offer.condition)}+
                            </span>
                          )}
                        </div>
                        <div className='flex-1 min-w-0'>
                          {isUnlocked && (
                            <span
                              className={cn(
                                "mb-1.5 inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[11px] font-medium px-2 py-1 rounded-full",
                                isFlashing && "animate-offer-check-pop",
                              )}>
                              <Check className='w-3 h-3' />
                              {isAr ? "لقد فتحت هذا العرض!" : "You have unlocked this offer!"}
                            </span>
                          )}
                          <h3 className='text-[15px] font-medium text-perce-ink lg:text-lg'>{offer.name}</h3>
                          {offer.description && (
                            <p className='mt-0.5 mb-3 text-[13px] text-perce-ink-secondary lg:text-sm'>
                              {offer.description}
                            </p>
                          )}
                          <Link
                            href='/shop'
                            className='inline-flex min-h-10 items-center gap-1.5 bg-perce-cta px-4 text-xs font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover'>
                            {t("offers.shop_now")}
                            <ChevronRight className='h-3.5 w-3.5 rtl:rotate-180' aria-hidden />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* An account is a convenience here, never a gate. */}
        {!isSignedIn && (
          <p className='mb-6 text-[13px] text-perce-ink-muted' data-testid='offers-account-note'>
            {t("offers.account_note")}{" "}
            <Link href='/login' className='font-medium text-perce-ink underline underline-offset-2'>
              {t("offers.sign_in")}
            </Link>
          </p>
        )}

        {/* Newsletter */}
        <div className='border border-perce-line p-4 sm:p-5 lg:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-6'>
          <div className='flex items-start gap-2 lg:gap-3 flex-1'>
            <Send className='w-4 h-4 lg:w-5 lg:h-5 text-perce-ink-secondary mt-0.5 shrink-0' />
            <div>
              <h2 className='text-sm lg:text-lg font-medium text-perce-ink'>
                {isAr ? "اشترك لتصلك أحدث العروض" : "Subscribe to receive the latest offers"}
              </h2>
              <p className='text-xs lg:text-sm text-perce-ink-muted mt-0.5'>
                {isAr
                  ? "كن أول من يعرف عن المنتجات الجديدة والعروض."
                  : "Be the first to hear about new pieces and offers."}
              </p>
            </div>
          </div>
          <form
            onSubmit={handleNewsletterSubmit}
            className='flex flex-col sm:flex-row w-full sm:w-auto gap-2'>
            <input
              type='email'
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder={isAr ? "بريدك الإلكتروني" : "Enter your email"}
              className='w-full sm:w-56 lg:w-72 px-3 py-2.5 lg:py-3 text-sm lg:text-base border border-perce-line-strong outline-none focus:border-perce-ink transition-colors bg-perce-bg'
            />
            <button
              type='submit'
              disabled={isSubscribing}
              className='w-full sm:w-auto min-h-11 px-4 bg-perce-cta hover:bg-perce-cta-hover text-perce-ink-inverse text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0'>
              {isSubscribing ? (
                <Loader2 className='w-4 h-4 animate-spin mx-auto' />
              ) : isAr ? (
                "اشتراك"
              ) : (
                "Subscribe"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
