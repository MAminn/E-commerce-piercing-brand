import { useState } from "react";
import { useData } from "vike-react/useData";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { trpc } from "#root/shared/trpc/client";
import { HeroCarousel } from "#root/components/ui/hero-carousel";
import { Link } from "#root/components/utils/Link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Data } from "./+data";

export { Page };

function Page() {
  const { homepageContent } = useData<Data>();
  const layoutSettings = useLayoutSettings();
  const { t, locale, dir } = useMinimalI18n();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isMinimal) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center'>
        <p className='text-gray-500'>Page not found</p>
      </div>
    );
  }

  const contactBanner = homepageContent.contactBanner;
  const isAr = locale === "ar";

  const heading = isAr
    ? (contactBanner?.headingAr || contactBanner?.heading || "نود أن نسمع منك")
    : (contactBanner?.heading || "We Would Love To Hear From You");

  const description = isAr
    ? (contactBanner?.descriptionAr || contactBanner?.description || "")
    : (contactBanner?.description || "");

  const directionsUrl = contactBanner?.directionsUrl;

  const bannerSlides = (contactBanner?.slides ?? [])
    .filter((s) => s.imageUrl)
    .map((s) => ({
      imageUrl: s.imageUrl,
      mobileImageUrl: s.mobileImageUrl,
      alt: s.alt,
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await trpc.contact.submit.mutate({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });

      if (result.success) {
        toast.success(
          isAr ? "تم إرسال رسالتك بنجاح!" : "Your message has been sent successfully!",
        );
        setName("");
        setEmail("");
        setMessage("");
      } else {
        toast.error(result.error || (isAr ? "فشل إرسال الرسالة" : "Failed to send message"));
      }
    } catch {
      toast.error(isAr ? "فشل إرسال الرسالة" : "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='minimal-template' dir={dir}>
      {/* ── Banner ── */}
      {bannerSlides.length > 0 && (
        <div className='w-full'>
          <HeroCarousel slides={bannerSlides} interval={6000} className='max-h-[400px]' />
        </div>
      )}

      {/* ── Contact Section ── */}
      <div className='max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20'>
          {/* ── Left Column: Heading + Description ── */}
          <div className='flex flex-col justify-center'>
            <h1 className='text-3xl sm:text-4xl lg:text-[42px] font-bold uppercase leading-tight tracking-tight'>
              {heading}
            </h1>

            {description && (
              <p className='mt-6 text-sm sm:text-base text-gray-600 leading-relaxed max-w-md'>
                {description}
              </p>
            )}

            {directionsUrl && (
              <a
                href={directionsUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1.5 mt-8 text-xs font-semibold uppercase tracking-widest hover:opacity-70 transition-opacity'>
                {isAr ? "احصل على الاتجاهات" : "Get Directions"}
                <ArrowUpRight className='w-3.5 h-3.5' />
              </a>
            )}
          </div>

          {/* ── Right Column: Form ── */}
          <div>
            <form onSubmit={handleSubmit} className='space-y-6'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
                <div>
                  <input
                    type='text'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isAr ? "الاسم" : "Name"}
                    required
                    maxLength={200}
                    className='w-full border-b border-gray-300 bg-transparent py-3 text-sm placeholder:text-gray-400 focus:border-black focus:outline-none transition-colors'
                    dir={dir}
                  />
                </div>
                <div>
                  <input
                    type='email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isAr ? "البريد الإلكتروني" : "Email"}
                    required
                    maxLength={200}
                    className='w-full border-b border-gray-300 bg-transparent py-3 text-sm placeholder:text-gray-400 focus:border-black focus:outline-none transition-colors'
                    dir={dir}
                  />
                </div>
              </div>

              <div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={isAr ? "الرسالة" : "Message"}
                  required
                  maxLength={5000}
                  rows={6}
                  className='w-full border-b border-gray-300 bg-transparent py-3 text-sm placeholder:text-gray-400 focus:border-black focus:outline-none transition-colors resize-none'
                  dir={dir}
                />
              </div>

              <div>
                <button
                  type='submit'
                  disabled={isSubmitting}
                  className='inline-flex items-center justify-center gap-2 border border-black bg-transparent px-8 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-black hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
                  {isSubmitting && <Loader2 className='w-3.5 h-3.5 animate-spin' />}
                  {isSubmitting
                    ? (isAr ? "جاري الإرسال..." : "Sending...")
                    : (isAr ? "إرسال" : "Submit")
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
