import { useData } from "vike-react/useData";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { ReturnPolicyPage } from "#root/components/template-system/minimal/ReturnPolicyPage";
import type { Data } from "./+data";

export { Page };

function Page() {
  const { homepageContent } = useData<Data>();
  const layoutSettings = useLayoutSettings();
  const { locale, dir } = useMinimalI18n();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";
  const isAr = locale === "ar";

  if (!isMinimal) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>Page not found</p>
      </div>
    );
  }

  const returnPolicy = homepageContent.returnPolicy;

  if (!returnPolicy?.enabled) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>
          {isAr ? "هذه الصفحة غير متاحة حالياً" : "This page is not available yet"}
        </p>
      </div>
    );
  }

  return (
    <ReturnPolicyPage content={returnPolicy} locale={locale} dir={dir} />
  );
}
