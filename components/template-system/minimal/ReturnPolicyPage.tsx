import { Link } from "#root/components/utils/Link";
import { ValuePropIcon } from "#root/components/template-system/shared/value-prop-icons";
import type { HomepageReturnPolicyContent } from "#root/shared/types/homepage-content";

export interface ReturnPolicyPageProps {
  content: HomepageReturnPolicyContent;
  locale: "en" | "ar";
  dir: "ltr" | "rtl";
}

export function ReturnPolicyPage({ content, locale, dir }: ReturnPolicyPageProps) {
  const isAr = locale === "ar";

  const title = isAr ? (content.titleAr || content.title) : content.title;
  const intro = isAr ? (content.introAr || content.intro) : content.intro;

  const footerPrefix = isAr
    ? (content.footerPrefixAr || content.footerPrefix)
    : content.footerPrefix;
  const footerMiddle = isAr
    ? (content.footerMiddleAr || content.footerMiddle)
    : content.footerMiddle;
  const contactLinkLabel = isAr
    ? (content.contactLinkLabelAr || content.contactLinkLabel)
    : content.contactLinkLabel;

  return (
    <div className='minimal-template' dir={dir}>
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24'>
        {/* Title + intro */}
        <section className='pb-12 sm:pb-16 border-b border-gray-200'>
          <h1 className='text-3xl sm:text-4xl lg:text-[42px] font-bold uppercase leading-tight tracking-tight'>
            {title}
          </h1>
          {intro && (
            <p className='mt-6 text-sm sm:text-base text-gray-600 leading-relaxed max-w-3xl'>
              {intro}
            </p>
          )}
        </section>

        {/* Steps grid */}
        {content.steps.length > 0 && (
          <section className='py-12 sm:py-16 border-b border-gray-200'>
            <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-10 xl:gap-8'>
              {content.steps.map((step, index) => {
                const stepTitle = isAr
                  ? (step.titleAr || step.title)
                  : step.title;
                const stepDescription = isAr
                  ? (step.descriptionAr || step.description)
                  : step.description;

                return (
                  <div key={`${stepTitle}-${index}`} className='flex flex-col'>
                    <ValuePropIcon
                      icon={step.icon}
                      className='w-9 h-9 stroke-[1.25] text-gray-900 mb-6'
                    />
                    <h2 className='text-xs sm:text-sm font-bold uppercase tracking-wide text-gray-900 mb-3'>
                      {stepTitle}
                    </h2>
                    <p className='text-sm text-gray-600 leading-relaxed'>
                      {stepDescription}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Detail sections */}
        {content.detailSections.length > 0 && (
          <section className='py-12 sm:py-16 border-b border-gray-200'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16'>
              {content.detailSections.map((section, index) => {
                const sectionTitle = isAr
                  ? (section.titleAr || section.title)
                  : section.title;
                const sectionBody = isAr
                  ? (section.bodyAr || section.body)
                  : section.body;

                return (
                  <div key={`${sectionTitle}-${index}`}>
                    <h2 className='text-xs sm:text-sm font-bold uppercase tracking-wide text-gray-900 mb-4'>
                      {sectionTitle}
                    </h2>
                    <p className='text-sm text-gray-600 leading-relaxed'>
                      {sectionBody}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Footer help line */}
        <section className='pt-12 sm:pt-16'>
          <p className='text-sm text-gray-600 leading-relaxed'>
            {footerPrefix}{" "}
            <a
              href={`mailto:${content.supportEmail}`}
              className='underline underline-offset-2 hover:opacity-70 transition-opacity'>
              {content.supportEmail}
            </a>{" "}
            {footerMiddle}{" "}
            <Link
              href={content.contactLinkUrl}
              className='underline underline-offset-2 hover:opacity-70 transition-opacity'>
              {contactLinkLabel}
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
