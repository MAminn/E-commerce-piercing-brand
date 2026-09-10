import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Input } from "#root/components/ui/input";
import { Link } from "#root/components/utils/Link";
import { authClient } from "#root/lib/auth-client.js";
import { toast } from "sonner";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import {
  minimalAuthT,
  type MinimalAuthKey,
} from "#root/lib/i18n/minimal-auth-translations";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type FormValues = z.infer<typeof formSchema>;

export function MinimalForgotPasswordPage() {
  const { locale } = useMinimalI18n();
  const t = useCallback(
    (key: MinimalAuthKey) => {
      const lang = locale === "ar" ? "ar" : "en";
      return minimalAuthT[lang][key] ?? key;
    },
    [locale],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/reset-password`,
      });
      if (result.error) {
        toast.error(result.error.message || "Something went wrong");
        setIsSubmitting(false);
        return;
      }
      setIsSuccess(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <section className='min-h-screen flex items-center justify-center bg-white px-4 py-12'>
      <div className='w-full max-w-[420px]'>
        {/* Card */}
        <div className='border border-stone-200 bg-white p-8 sm:p-10'>
          {isSuccess ? (
            /* Success state */
            <div className='flex flex-col items-center gap-5 text-center py-6'>
              <div className='w-14 h-14 rounded-full bg-green-50 flex items-center justify-center'>
                <CheckCircle className='w-7 h-7 text-green-600' />
              </div>
              <div className='space-y-2'>
                <h1 className='text-xl sm:text-2xl font-light text-stone-900 tracking-tight'>
                  {t("forgot.success_title")}
                </h1>
                <p className='text-sm text-stone-500 leading-relaxed max-w-xs mx-auto'>
                  {t("forgot.success_message")}
                </p>
              </div>
              <Link
                href='/login'
                className='inline-flex items-center gap-2 text-sm text-stone-900 hover:text-stone-600 transition-colors mt-4'>
                <ArrowLeft className='w-4 h-4' />
                {t("forgot.back_to_login")}
              </Link>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className='text-center mb-8'>
                <h1 className='text-2xl sm:text-[28px] font-light text-stone-900 tracking-tight mb-2'>
                  {t("forgot.title")}
                </h1>
                <p className='text-sm text-stone-500'>{t("forgot.subtitle")}</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-6'>
                {/* Email */}
                <div>
                  <label
                    htmlFor='forgot-email'
                    className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                    {t("forgot.email")}
                  </label>
                  <Input
                    {...form.register("email")}
                    id='forgot-email'
                    type='email'
                    placeholder={t("forgot.email_placeholder")}
                    className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.email && (
                    <p className='text-red-500 text-xs mt-2'>
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type='submit'
                  disabled={isSubmitting}
                  className='w-full py-3 mt-2 bg-stone-900 text-white text-sm font-medium tracking-wide uppercase hover:bg-stone-800 transition-colors disabled:opacity-40'>
                  {isSubmitting ? t("forgot.submitting") : t("forgot.submit")}
                </button>

                {/* Back to login */}
                <Link
                  href='/login'
                  className='inline-flex items-center justify-center gap-2 text-sm text-stone-900 hover:text-stone-600 transition-colors mt-2'>
                  <ArrowLeft className='w-4 h-4' />
                  {t("forgot.back_to_login")}
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
