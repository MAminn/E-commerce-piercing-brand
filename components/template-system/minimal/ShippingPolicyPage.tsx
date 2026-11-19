import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { formatMoney } from "#root/shared/pricing/format-money";
import type { ShippingPolicyFacts } from "#root/shared/shipping/shipping-policy";

export interface ShippingPolicyPageProps {
  facts: ShippingPolicyFacts;
  locale: "en" | "ar";
  dir: "ltr" | "rtl";
}

/**
 * /shipping-policy. Every statement is a sentence about a live setting
 * (shared/shipping/shipping-policy.ts) — a section whose setting says nothing
 * is left out rather than filled with a generic promise.
 */
export function ShippingPolicyPage({ facts, locale, dir }: ShippingPolicyPageProps) {
  const isAr = locale === "ar";
  const money = (amount: number) => formatMoney(amount, { locale });

  const sections: Array<{ id: string; title: string; body: React.ReactNode }> = [];

  // ── Fees ──
  const feeLines: string[] = [];
  if (facts.fee.kind === "free") {
    feeLines.push(isAr ? "التوصيل مجاني." : "Delivery is free.");
  } else if (facts.fee.kind === "single") {
    feeLines.push(
      isAr
        ? `رسوم التوصيل ${money(facts.fee.amount)} للطلب، وتظهر عند إتمام الطلب قبل تأكيده.`
        : `Delivery costs ${money(facts.fee.amount)} per order. It is shown at checkout before you place your order.`,
    );
  } else {
    feeLines.push(
      isAr
        ? "تختلف رسوم التوصيل حسب المحافظة، وتظهر عند إتمام الطلب بعد اختيار المحافظة وقبل تأكيد الطلب."
        : "The delivery fee depends on your governorate. It is shown at checkout once you choose your governorate, before you place your order.",
    );
  }
  if (facts.freeShippingMinimum !== null) {
    feeLines.push(
      isAr
        ? `التوصيل مجاني عندما يبلغ إجمالي المنتجات بعد الخصومات ${money(facts.freeShippingMinimum)} أو أكثر.`
        : `Delivery is free when your items total, after discounts, is ${money(facts.freeShippingMinimum)} or more.`,
    );
  }
  sections.push({
    id: "fees",
    title: isAr ? "رسوم التوصيل" : "Delivery fees",
    body: feeLines.map((line) => <p key={line}>{line}</p>),
  });

  // ── Where we deliver ──
  sections.push({
    id: "destinations",
    title: isAr ? "مناطق التوصيل" : "Where we deliver",
    body:
      facts.unavailableGovernorates.length === 0 ? (
        <p>{isAr ? "نوصّل إلى جميع محافظات مصر." : "We deliver to every governorate in Egypt."}</p>
      ) : (
        <>
          <p>
            {isAr
              ? "التوصيل غير متاح حالياً إلى المحافظات التالية:"
              : "Delivery is currently unavailable to the following governorates:"}
          </p>
          <ul className='list-disc ps-5 space-y-1' data-testid='unavailable-governorates'>
            {facts.unavailableGovernorates.map((g) => (
              <li key={g.code}>{isAr ? g.nameAr : g.nameEn}</li>
            ))}
          </ul>
        </>
      ),
  });

  // ── Delivery times (admin text, verbatim) ──
  if (facts.deliveryText) {
    sections.push({
      id: "times",
      title: isAr ? "مدة التوصيل" : "Delivery times",
      body: (
        <p className='whitespace-pre-line'>
          {isAr ? facts.deliveryText.ar : facts.deliveryText.en}
        </p>
      ),
    });
  }

  // ── Payment ──
  if (facts.cashOnDelivery) {
    sections.push({
      id: "payment",
      title: isAr ? "الدفع" : "Payment",
      body: (
        <p>
          {isAr
            ? "الدفع عند الاستلام متاح: تدفع عند وصول طلبك."
            : "Cash on delivery is available: you pay when your order arrives."}
        </p>
      ),
    });
  }

  return (
    <div className='minimal-template' dir={dir}>
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24'>
        <section className='pb-12 sm:pb-16 border-b border-perce-line'>
          <h1 className='text-3xl sm:text-4xl lg:text-[42px] font-medium leading-tight tracking-tight'>
            {isAr ? "سياسة الشحن" : "Shipping policy"}
          </h1>
          <p className='mt-6 text-sm sm:text-base text-perce-ink-secondary leading-relaxed max-w-3xl'>
            {isAr ? "كيف يتم توصيل طلبات Percé." : "How delivery works for Percé orders."}
          </p>
        </section>

        <section className='py-12 sm:py-16 max-w-3xl space-y-10 border-b border-perce-line'>
          {sections.map((section) => (
            <div key={section.id} data-section={section.id}>
              <h2 className='text-xs sm:text-sm font-medium text-perce-ink mb-4'>
                {section.title}
              </h2>
              <div className='text-sm text-perce-ink-secondary leading-relaxed space-y-3'>
                {section.body}
              </div>
            </div>
          ))}
        </section>

        <section className='pt-12 sm:pt-16'>
          <p className='text-sm text-perce-ink-secondary leading-relaxed'>
            {isAr ? "لديك سؤال عن التوصيل؟" : "Questions about delivery?"}{" "}
            <Link
              href='/contact'
              className='underline underline-offset-2 hover:opacity-70 transition-opacity'>
              {isAr ? "تواصل معنا" : "Contact us"}
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

/**
 * Route body for /shipping-policy — the same states as /terms and /privacy:
 * outside the Percé shell the page does not exist; if the settings could not
 * be read it says so rather than guessing.
 */
export function ShippingPolicyRoute({ facts }: { facts: ShippingPolicyFacts | null }) {
  const layoutSettings = useLayoutSettings();
  const { locale, dir } = useMinimalI18n();

  if (layoutSettings.header.navbarStyle !== "minimal") {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-ink-2'>Page not found</p>
      </div>
    );
  }

  if (!facts) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-ink-2'>
          {locale === "ar" ? "هذه الصفحة غير متاحة حالياً" : "This page is not available yet"}
        </p>
      </div>
    );
  }

  return <ShippingPolicyPage facts={facts} locale={locale} dir={dir} />;
}
