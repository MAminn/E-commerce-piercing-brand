import { ShoppingBag } from "lucide-react";
import type { HomepageValuePropsContent } from "#root/shared/types/homepage-content";
import { VALUE_PROP_ICON_MAP } from "#root/components/template-system/shared/value-prop-icons";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import {
  NOIR_DISPLAY_FONT_CLASSES,
  NOIR_TEXT_SECONDARY_CLASSES,
} from "./noir-tokens";

// Icon mapping — shared with other templates
const ICON_MAP = VALUE_PROP_ICON_MAP;

interface NoirBenefitsStripProps {
  valueProps: HomepageValuePropsContent;
}

/**
 * NoirBenefitsStrip — horizontal band of icon + bold micro-label +
 * 2-line subtext items, mapped from the CMS valuePropositions items.
 * Renders nothing when disabled or empty.
 */
export function NoirBenefitsStrip({ valueProps }: NoirBenefitsStripProps) {
  const { locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.18em]";

  if (!valueProps.enabled || valueProps.items.length === 0) return null;

  return (
    <section className='bg-[#0c0c0c] border-y border-white/10'>
      <div className='mx-auto max-w-7xl px-4 md:px-8 py-12 md:py-16'>
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10'>
          {valueProps.items.map((item, index) => {
            const Icon = ICON_MAP[item.icon] ?? ShoppingBag;
            return (
              <div
                key={`${item.icon}-${item.title}`}
                className={cn(
                  "flex flex-col items-center text-center gap-3 px-2",
                  // hairline column separators on desktop (skip first)
                  index % 4 !== 0 && "lg:border-s lg:border-white/10 lg:ps-6",
                )}>
                <Icon className='w-6 h-6 text-[#E8112D] stroke-[1.5]' />
                <h3
                  className={cn(
                    "text-[11px] uppercase font-semibold text-white",
                    track,
                    NOIR_DISPLAY_FONT_CLASSES,
                  )}>
                  {item.title}
                </h3>
                {item.description && (
                  <p
                    className={cn(
                      "text-xs leading-relaxed line-clamp-2 max-w-55",
                      NOIR_TEXT_SECONDARY_CLASSES,
                    )}>
                    {item.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
