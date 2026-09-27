import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import type { HomepageLegalPageContent } from "#root/shared/types/homepage-content";

export interface LegalPageProps {
  content: HomepageLegalPageContent;
  locale: "en" | "ar";
  dir: "ltr" | "rtl";
}

/**
 * Terms / Privacy document, in the same Percé shell and type scale as
 * ReturnPolicyPage: title + intro block, then the sections as one readable
 * column. Arabic falls back to the English text wherever it is empty.
 */
export function LegalPage({ content, locale, dir }: LegalPageProps) {
  const isAr = locale === "ar";
  const pick = (en: string | undefined, ar: string | undefined) =>
    (isAr && ar) || en || "";

  const lastUpdated = pick(content.lastUpdated, content.lastUpdatedAr);
  const intro = pick(content.intro, content.introAr);

  return (
    <div className='minimal-template' dir={dir}>
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24'>
        <section className='pb-12 sm:pb-16 border-b border-perce-line'>
          <h1 className='text-3xl sm:text-4xl lg:text-[42px] font-bold leading-tight tracking-tight'>
            {pick(content.title, content.titleAr)}
          </h1>
          {lastUpdated && (
            <p className='mt-4 text-xs text-perce-ink-secondary'>{lastUpdated}</p>
          )}
          {intro && (
            <p className='mt-6 text-sm sm:text-base text-perce-ink-secondary leading-relaxed max-w-3xl'>
              {intro}
            </p>
          )}
        </section>

        {content.sections.length > 0 && (
          <section className='py-12 sm:py-16 max-w-3xl space-y-10'>
            {content.sections.map((section, index) => {
              const title = pick(section.title, section.titleAr);
              return (
                <div key={`${title}-${index}`}>
                  {title && (
                    <h2 className='text-xs sm:text-sm font-bold text-perce-ink mb-4'>
                      {title}
                    </h2>
                  )}
                  <p className='text-sm text-perce-ink-secondary leading-relaxed whitespace-pre-line'>
                    {pick(section.body, section.bodyAr)}
                  </p>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Route body shared by /terms and /privacy — the same three states as
 * /return-policy: outside the Percé shell the page does not exist, an
 * unpublished page says so, a published one renders.
 */
export function LegalPageRoute({
  content,
}: {
  content: HomepageLegalPageContent | null;
}) {
  const layoutSettings = useLayoutSettings();
  const { locale, dir } = useMinimalI18n();

  if (layoutSettings.header.navbarStyle !== "minimal") {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>Page not found</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>
          {locale === "ar" ? "هذه الصفحة غير متاحة حالياً" : "This page is not available yet"}
        </p>
      </div>
    );
  }

  return <LegalPage content={content} locale={locale} dir={dir} />;
}
