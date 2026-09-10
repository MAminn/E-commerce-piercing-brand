import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
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
  password: z.string().min(1, "Password cannot be empty"),
});

type FormValues = z.infer<typeof formSchema>;

export function MinimalLoginPage() {
  const { locale } = useMinimalI18n();
  const t = useCallback(
    (key: MinimalAuthKey) => {
      const lang = locale === "ar" ? "ar" : "en";
      return minimalAuthT[lang][key] ?? key;
    },
    [locale],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);

  const handleOAuth = async (provider: "google" | "facebook") => {
    setOauthLoading(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: "/",
      });
    } catch {
      toast.error("OAuth sign-in failed. Please try again.");
      setOauthLoading(null);
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        const raw = result.error.message || "";
        const friendly =
          raw.toLowerCase().includes("invalid") || raw.toLowerCase().includes("password") || raw.toLowerCase().includes("credentials")
            ? "Incorrect email or password."
            : raw.toLowerCase().includes("not found") || raw.toLowerCase().includes("user")
            ? "No account found with that email."
            : "Login failed. Please try again.";
        toast.error(friendly);
        setIsSubmitting(false);
        return;
      }

      toast.success("Login successful");
      const role = (result.data?.user as { role?: string } | null)?.role;
      if (role === "admin" || role === "superadmin") {
        window.location.href = "/dashboard";
      } else {
        window.location.href = "/";
      }
    } catch {
      toast.error("Something went wrong. Please refresh the page and try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <section className='min-h-screen flex items-center justify-center bg-white px-4 py-12'>
      <div className='w-full max-w-[420px]'>
        {/* Card */}
        <div className='border border-stone-200 bg-white p-8 sm:p-10'>
          {/* Header */}
          <div className='text-center mb-8'>
            <h1 className='text-2xl sm:text-[28px] font-light text-stone-900 tracking-tight mb-2'>
              {t("login.title")}
            </h1>
            <p className='text-sm text-stone-500'>{t("login.subtitle")}</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} autoComplete='on' className='flex flex-col gap-6'>
            {/* Email */}
            <div>
              <label
                htmlFor='login-email'
                className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                {t("login.email")}
              </label>
              <Input
                {...form.register("email")}
                id='login-email'
                type='email'
                autoComplete='email'
                placeholder={t("login.email_placeholder")}
                className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                disabled={isSubmitting}
              />
              {form.formState.errors.email && (
                <p className='text-red-500 text-xs mt-2'>
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor='login-password'
                className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                {t("login.password")}
              </label>
              <div className='relative'>
                <Input
                  {...form.register("password")}
                  id='login-password'
                  type={showPassword ? "text" : "password"}
                  autoComplete='current-password'
                  placeholder={t("login.password_placeholder")}
                  className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 pe-10 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                  disabled={isSubmitting}
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute end-0 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors'
                  disabled={isSubmitting}>
                  {showPassword ? (
                    <EyeOff className='w-4 h-4' />
                  ) : (
                    <Eye className='w-4 h-4' />
                  )}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className='text-red-500 text-xs mt-2'>
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type='submit'
              disabled={isSubmitting}
              className='w-full py-3 mt-2 bg-stone-900 text-white text-sm font-medium tracking-wide uppercase hover:bg-stone-800 transition-colors disabled:opacity-40'>
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </button>

            {/* OAuth */}
            <div className='flex flex-col gap-3 -mt-1'>
              <div className='flex items-center gap-3'>
                <div className='h-px flex-1 bg-stone-200' />
                <span className='text-[11px] uppercase tracking-widest text-stone-400'>or</span>
                <div className='h-px flex-1 bg-stone-200' />
              </div>
              <button
                type='button'
                onClick={() => handleOAuth("google")}
                disabled={!!oauthLoading || isSubmitting}
                className='w-full py-2.5 border border-stone-300 flex items-center justify-center gap-3 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-40'>
                {oauthLoading === "google" ? (
                  <div className='w-4 h-4 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin' />
                ) : (
                  <svg className='w-4 h-4' viewBox='0 0 24 24' aria-hidden='true'>
                    <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/>
                    <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/>
                    <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z'/>
                    <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/>
                  </svg>
                )}
                Continue with Google
              </button>
            </div>

            {/* Forgot password */}
            <Link
              href='/forgot-password'
              className='text-center text-xs text-stone-500 hover:text-stone-900 transition-colors'>
              {t("login.forgot_password")}
            </Link>

            {/* Divider */}
            <div className='flex items-center gap-3 mt-2'>
              <div className='h-px flex-1 bg-stone-200' />
              <span className='text-xs text-stone-400'>{t("login.no_account")}</span>
              <div className='h-px flex-1 bg-stone-200' />
            </div>

            <Link
              href='/register'
              className='text-center text-sm text-stone-900 hover:text-stone-600 transition-colors font-light -mt-2'>
              {t("login.create_account")}
            </Link>
          </form>
        </div>
      </div>
    </section>
  );
}
