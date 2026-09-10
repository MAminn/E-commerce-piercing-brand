import { useData } from "vike-react/useData";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import type { Data } from "./+data";

export { Page };

function Page() {
  const { homepageContent } = useData<Data>();
  const layoutSettings = useLayoutSettings();
  const { locale } = useMinimalI18n();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  if (!isMinimal) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>Page not found</p>
      </div>
    );
  }

  const aboutUs = homepageContent.aboutUs;
  const isAr = locale === "ar";

  if (!aboutUs?.enabled) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>
          {isAr ? "هذه الصفحة غير متاحة حالياً" : "This page is not available yet"}
        </p>
      </div>
    );
  }

  const title = isAr ? (aboutUs.titleAr || aboutUs.title) : aboutUs.title;
  const description = isAr
    ? (aboutUs.descriptionAr || aboutUs.description)
    : aboutUs.description;

  const imageUrl = aboutUs.imageUrl
    ? aboutUs.imageUrl.startsWith("http") || aboutUs.imageUrl.startsWith("/")
      ? aboutUs.imageUrl
      : `/uploads/${aboutUs.imageUrl}`
    : null;

  return (
    <div className='min-h-[60vh]'>
      <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24'>
        <div
          className={`flex flex-col ${imageUrl ? "lg:flex-row" : ""} gap-10 lg:gap-16 items-center`}>
          {/* Image */}
          {imageUrl && (
            <div className='w-full lg:w-1/2 flex-shrink-0'>
              <div className='aspect-[4/5] sm:aspect-[3/4] overflow-hidden'>
                <img
                  src={imageUrl}
                  alt={title}
                  className='w-full h-full object-cover'
                />
              </div>
            </div>
          )}

          {/* Text Content */}
          <div className={`w-full ${imageUrl ? "lg:w-1/2" : "max-w-2xl mx-auto text-center"}`}>
            <h1 className='text-3xl sm:text-4xl lg:text-5xl font-light tracking-wide text-gray-900 mb-6 sm:mb-8'>
              {title}
            </h1>
            <div className='space-y-4'>
              {description.split("\n").map((paragraph, idx) => (
                <p
                  key={idx}
                  className='text-base sm:text-lg text-gray-600 leading-relaxed font-light'>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
