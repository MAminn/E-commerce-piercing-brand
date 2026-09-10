"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useCart } from "#root/lib/context/CartContext";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { trpc } from "#root/shared/trpc/client";
import { Link } from "#root/components/utils/Link";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import { Check, Copy, Loader2, Lock, Percent, Send, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "#root/lib/utils";
import type {
  OfferCondition,
  OfferReward,
} from "#root/shared/database/drizzle/schema";
import { AuthContext } from "#root/context/AuthContext.js";

import oneBottle from "#root/assets/1-bottles.jpg.jpeg";
import twoBottles from "#root/assets/2-bottles.jpg.jpeg";
import threeBottles from "#root/assets/3-bottles.jpg.jpeg";

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
}

const BADGE_LABELS = ["BEST DEAL", "MOST LOVED", "EVERYDAY DEAL"];

/**
 * Picks the bottle illustration for an offer card based on the quantity it
 * needs. 1 bottle → 1-bottles.jpg, 2 → 2-bottles.jpg, 3+ → 3-bottles.jpg —
 * this way any future offer requiring 4+ items still gets a sensible image
 * without needing new assets.
 */
function bottleImageFor(condition: OfferCondition): string {
  if (condition.type === "quantity_threshold") {
    if (condition.minQuantity <= 1) return oneBottle;
    if (condition.minQuantity === 2) return twoBottles;
    return threeBottles;
  }
  return oneBottle;
}

export default function OffersPage() {
  const layoutSettings = useLayoutSettings();
  const { locale } = useMinimalI18n();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";
  const isAr = locale === "ar";

  const { appliedOffers } = useCart();
  const { session } = useContext(AuthContext);
  const isSignedIn = !!session;

  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const [promoCodes, setPromoCodes] = useState<PublicPromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      try {
        const [offersRes, codesRes] = await Promise.all([
          trpc.offer.listActive.query(),
          trpc.promoCode.listPublic.query(),
        ]);
        if (cancelled) return;
        if (offersRes.success && offersRes.result) {
          setOffers(offersRes.result as ActiveOffer[]);
        }
        if (codesRes.success && codesRes.result) {
          setPromoCodes(codesRes.result as PublicPromoCode[]);
        }
      } catch {
        /* ignore — page still renders with whatever loaded */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
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
        <p className='text-gray-500'>Page not found</p>
      </div>
    );
  }

  return (
    <div className='bg-white pb-24 lg:pb-12 overflow-x-hidden'>
      <div className='max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16'>
        {/* Heading */}
        <div className='mb-8 lg:mb-12'>
          <h1 className='text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 inline-block relative pb-2'>
            {isAr ? "العروض" : "Offers"}
            <span className='absolute bottom-0 start-0 w-12 h-[3px] bg-gray-900' />
          </h1>
          <p className='text-sm lg:text-base text-gray-500 mt-3'>
            {isAr
              ? "عروض حصرية على عطورك المفضلة."
              : "Exclusive deals on your favorite scents."}
          </p>
        </div>

        {isLoading ? (
          <div className='flex items-center justify-center py-16'>
            <Loader2 className='w-6 h-6 animate-spin text-gray-400' />
          </div>
        ) : offers.length === 0 ? (
          <p className='text-sm text-gray-400 py-8'>
            {isAr ? "لا توجد عروض نشطة حالياً." : "No active offers right now."}
          </p>
        ) : (
          <div className='space-y-4 lg:space-y-5'>
            {offers.map((offer, idx) => {
              const isUnlocked = appliedOffers.some((a) => a.name === offer.name);
              const isFlashing = justUnlocked.has(offer.name);
              const badge = BADGE_LABELS[idx] ?? null;
              return (
                <div
                  key={offer.id}
                  className={cn(
                    "relative border rounded-lg p-3 sm:p-4 lg:p-6 flex flex-row items-start gap-3 sm:gap-4 lg:gap-6 transition-colors duration-500",
                    isUnlocked
                      ? "border-emerald-400 bg-emerald-50/60 animate-offer-card-glow"
                      : "border-gray-200 bg-white",
                    isFlashing && "animate-offer-card-flash",
                  )}>
                  <img
                    src={bottleImageFor(offer.condition)}
                    alt=''
                    className='w-16 h-16 sm:w-24 sm:h-24 lg:w-40 lg:h-40 object-cover rounded-md bg-gray-50 shrink-0 self-start'
                  />
                  <div className='flex-1 min-w-0'>
                    <div className='flex flex-wrap items-center gap-1.5 lg:gap-3 mb-1.5 lg:mb-3'>
                      {badge && (
                        <span className='inline-block bg-black text-white text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wide px-2 py-0.5 lg:px-3 lg:py-1.5 rounded'>
                          {badge}
                        </span>
                      )}
                      {isUnlocked && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] lg:text-sm font-bold px-2 py-1 lg:px-3 lg:py-1.5 rounded-full",
                            isFlashing && "animate-offer-check-pop",
                          )}>
                          <Check className='w-3 h-3 lg:w-4 lg:h-4' />
                          {isAr ? "لقد فتحت هذا العرض!" : "You have unlocked this offer!"}
                        </span>
                      )}
                    </div>
                    <h3 className='text-sm sm:text-base lg:text-2xl font-bold text-gray-900 uppercase'>
                      {offer.name}
                    </h3>
                    {offer.description && (
                      <p className='text-xs sm:text-sm lg:text-base text-gray-600 mt-0.5 lg:mt-2 mb-2.5 lg:mb-5'>
                        {offer.description}
                      </p>
                    )}
                    <Link
                      href='/shop'
                      className='inline-flex items-center gap-1.5 bg-black hover:bg-gray-900 text-white text-[11px] sm:text-xs lg:text-sm font-semibold uppercase tracking-wide px-3 py-2 lg:px-6 lg:py-3 rounded-md transition-colors'>
                      {isAr ? "تسوق الآن" : "Shop Now"} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active promo codes */}
        {promoCodes.length > 0 && (
          <div className='mt-10 lg:mt-14 border border-gray-200 rounded-lg bg-gray-50 p-4 sm:p-5 lg:p-8'>
            <div className='flex items-center gap-2 mb-1'>
              <Tag className='w-4 h-4 lg:w-5 lg:h-5 text-gray-700' />
              <h4 className='text-sm lg:text-lg font-bold text-gray-900'>
                {isAr ? "أكواد الخصم النشطة" : "Active Promo Codes"}
              </h4>
            </div>
            <p className='text-xs lg:text-sm text-gray-500 mb-4 lg:mb-6'>
              {isAr ? "استخدم هذه الأكواد عند الدفع." : "Use these codes at checkout."}
            </p>
            {isSignedIn ? (
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-5'>
                {promoCodes.map((pc) => (
                  <div
                    key={pc.id}
                    className='bg-white border border-dashed border-gray-300 rounded-lg p-3 text-center'>
                    <p className='text-sm font-bold tracking-wider text-gray-900'>
                      {pc.code}
                    </p>
                    <p className='text-xs text-gray-500 mt-1 mb-3'>
                      {pc.discountType === "percentage"
                        ? `${pc.discountValue}% OFF`
                        : `${pc.discountValue.toFixed(0)} ${STORE_CURRENCY} OFF`}
                      {pc.minPurchaseAmount
                        ? isAr
                          ? ` — بحد أدنى ${pc.minPurchaseAmount.toFixed(0)} ${STORE_CURRENCY}`
                          : ` on orders above ${pc.minPurchaseAmount.toFixed(0)} ${STORE_CURRENCY}`
                        : ""}
                    </p>
                    <button
                      type='button'
                      onClick={() => handleCopyCode(pc.code)}
                      className='inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-black border border-gray-300 rounded-md px-3 py-1.5 transition-colors'>
                      <Copy className='w-3 h-3' />
                      {isAr ? "نسخ" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className='animate-reveal-overlay-in flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3 sm:p-4'>
                <div className='flex items-center gap-3 min-w-0'>
                  <span className='animate-reveal-lock-pulse flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-emerald-50 text-emerald-600 shrink-0'>
                    <Percent className='w-4 h-4 sm:w-5 sm:h-5' />
                  </span>
                  <div className='min-w-0'>
                    <p className='text-sm sm:text-base font-bold text-gray-900'>
                      {isAr
                        ? "سجّل الدخول لكشف أكواد الخصم النشطة"
                        : "Sign in to reveal active promo codes"}
                    </p>
                    <p className='text-xs sm:text-sm text-gray-500 mt-0.5'>
                      {isAr
                        ? "أنشئ حسابًا مجانيًا لعرض ونسخ أكواد الخصم الحصرية."
                        : "Create a free account to view and copy exclusive discount codes."}
                    </p>
                  </div>
                </div>
                <Link
                  href='/login'
                  className='shrink-0 inline-flex items-center gap-1.5 bg-black hover:bg-gray-900 text-white text-xs sm:text-sm font-semibold uppercase tracking-wide px-3 py-2 sm:px-4 sm:py-2.5 rounded-md transition-colors'>
                  <Lock className='w-3.5 h-3.5' />
                  {isAr ? "دخول" : "Sign In"}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Newsletter */}
        <div className='mt-8 lg:mt-8 border border-gray-200 rounded-lg p-4 sm:p-5 lg:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-6'>
          <div className='flex items-start gap-2 lg:gap-3 flex-1'>
            <Send className='w-4 h-4 lg:w-5 lg:h-5 text-gray-700 mt-0.5 shrink-0' />
            <div>
              <h4 className='text-sm lg:text-lg font-bold text-gray-900'>
                {isAr ? "اشترك لتصلك أحدث العروض" : "Subscribe to receive the latest offers"}
              </h4>
              <p className='text-xs lg:text-sm text-gray-500 mt-0.5'>
                {isAr
                  ? "كن أول من يعرف عن العطور الجديدة والعروض الحصرية."
                  : "Be the first to know about new scents and exclusive deals."}
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
              className='w-full sm:w-56 lg:w-72 px-3 py-2.5 lg:py-3 text-sm lg:text-base rounded-md border border-gray-300 outline-none focus:border-gray-900 transition-colors bg-white'
            />
            <button
              type='submit'
              disabled={isSubscribing}
              className='w-full sm:w-auto px-4 py-2.5 rounded-md bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0'>
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
