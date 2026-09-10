// TODO: Migrate MinimalCategoryPage to shared TestimonialsSection, then delete this file.
import React, { useState, useEffect } from "react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { trpc } from "#root/shared/trpc/client";
import { getStoreOwnerId } from "#root/shared/config/store";
import type { HomepageContent } from "#root/shared/types/homepage-content";

interface Testimonial {
  name: string;
  nameEn: string;
  review: string;
  reviewEn: string;
  rating: number;
}

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    name: "نورة العتيبي",
    nameEn: "Sarah Mitchell",
    review:
      "من أفضل المنتجات اللي استخدمتها وبصراحة يستاهل أضعاف سعره، جودة عالية وتوصيل سريع",
    reviewEn:
      "Absolutely love the quality! Fast shipping and the product exceeded my expectations. Will definitely order again.",
    rating: 5,
  },
  {
    name: "محمد المحسن",
    nameEn: "James Cooper",
    review:
      "تجربة شراء ممتازة من البداية للنهاية، خدمة عملاء رائعة والمنتج طلع أحلى من الصور",
    reviewEn:
      "Excellent shopping experience from start to finish. Customer service was outstanding and the product looks even better in person.",
    rating: 5,
  },
  {
    name: "فرح أحمد",
    nameEn: "Emily Chen",
    review:
      "بصراحة تميز وإتقان سواء على مستوى التقديم أو على مستوى جودة المنتجات، شكراً جزيلاً",
    reviewEn:
      "The attention to detail is remarkable. Premium quality packaging and the product itself is simply stunning. Highly recommended!",
    rating: 5,
  },
  {
    name: "مهند المري",
    nameEn: "David Wilson",
    review:
      "ممتاز! المنتج وصل بسرعة والجودة فوق الممتازة، أنصح الكل يجربه بدون تردد",
    reviewEn:
      "Top-notch product and incredibly fast delivery. The quality speaks for itself — I've already recommended it to all my friends.",
    rating: 5,
  },
  {
    name: "ريم الشمري",
    nameEn: "Olivia Taylor",
    review:
      "يجنن! كل شي كان مرتب ومغلف بشكل أنيق، والمنتج نفسه جودته عالية جداً",
    reviewEn:
      "Everything was beautifully packaged and presented. The product quality is exceptional — worth every penny!",
    rating: 5,
  },
];

export function MinimalTestimonialsSection() {
  const { t, locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const [testimonials, setTestimonials] =
    useState<Testimonial[]>(DEFAULT_TESTIMONIALS);
  const [sectionTitle, setSectionTitle] = useState("");

  /* ── Fetch CMS testimonials ── */
  useEffect(() => {
    const merchantId = getStoreOwnerId();
    trpc.homepage.getContent
      .query({ merchantId, templateId: "landing-minimal" })
      .then((res) => {
        if (res.success && res.result) {
          const c = res.result as HomepageContent;
          if (c.testimonials?.enabled && c.testimonials.items.length > 0) {
            setTestimonials(
              c.testimonials.items.map((item) => ({
                name: item.nameAr || item.name,
                nameEn: item.name,
                review: item.reviewAr || item.review,
                reviewEn: item.review,
                rating: item.rating,
              })),
            );
          }
          const title = isAr
            ? c.testimonials?.titleAr || c.testimonials?.title || ""
            : c.testimonials?.title || "";
          if (title) setSectionTitle(title);
        }
      })
      .catch(() => {});
  }, [isAr]);

  // Ensure the track is always wide enough to fill the viewport seamlessly.
  // We need each "half" of the doubled list to be at least ~viewport-wide.
  // A card is ~344px (320 + 24 margin). 8 cards ≈ 2752px > any common viewport.
  const MIN_PER_HALF = 8;
  const repeatCount = Math.ceil(
    MIN_PER_HALF / Math.max(1, testimonials.length),
  );
  const singleSet = Array.from(
    { length: repeatCount },
    () => testimonials,
  ).flat();
  // Doubled so translate(-50%) lands exactly at the start of the second copy
  const loopItems = [...singleSet, ...singleSet];

  return (
    <section className='py-14 sm:py-20 bg-stone-50 overflow-hidden'>
      <div className='max-w-[1400px] mx-auto'>
        <div className='text-center mb-10 sm:mb-14 px-4'>
          <h2 className='text-2xl sm:text-3xl font-light text-stone-900 tracking-tight inline-block relative pb-3'>
            {sectionTitle || t("testimonials")}
            <span className='absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-stone-900' />
          </h2>
        </div>

        <div
          className='relative'
          dir='ltr'
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}>
          <div
            className='flex w-max animate-marquee-half hover:[animation-play-state:paused]'
            style={
              {
                "--marquee-duration": `${singleSet.length * 10}s`,
              } as React.CSSProperties
            }>
            {loopItems.map((item, i) => (
              <div
                key={i}
                className='flex-none w-[280px] sm:w-[320px] mr-6 bg-white border border-stone-100 p-6 flex flex-col items-center text-center'>
                <div className='w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-4'>
                  <svg
                    className='w-8 h-8 text-stone-400'
                    fill='currentColor'
                    viewBox='0 0 24 24'>
                    <path d='M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z' />
                  </svg>
                </div>
                <h3 className='text-sm font-medium text-stone-900 mb-2'>
                  {isAr ? item.name : item.nameEn}
                </h3>
                <div className='flex items-center gap-0.5 mb-3'>
                  {[...Array(5)].map((_, s) => (
                    <svg
                      key={s}
                      className={`w-4 h-4 ${s < item.rating ? "text-amber-400" : "text-gray-200"}`}
                      fill='currentColor'
                      viewBox='0 0 20 20'>
                      <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                    </svg>
                  ))}
                </div>
                <p className='text-sm text-stone-600 leading-relaxed line-clamp-4'>
                  {isAr ? item.review : item.reviewEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
