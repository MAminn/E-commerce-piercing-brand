import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { Input } from "#root/components/ui/input";
import { Link } from "#root/components/utils/Link";
import { authClient } from "#root/lib/auth-client.js";
import { toast } from "sonner";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import {
  minimalAuthT,
  type MinimalAuthKey,
} from "#root/lib/i18n/minimal-auth-translations";

const formSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    phone: z
      .string()
      .regex(/^(\+201|01|00201)[0-2,5]{1}[0-9]{8}/, "Invalid phone number"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

export function MinimalRegisterPage() {
  const { locale } = useMinimalI18n();
  const t = useCallback(
    (key: MinimalAuthKey) => {
      const lang = locale === "ar" ? "ar" : "en";
      return minimalAuthT[lang][key] ?? key;
    },
    [locale],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.name,
        phone: values.phone,
      } as Parameters<typeof authClient.signUp.email>[0]);

      if (result.error) {
        toast.error(result.error.message || "Registration failed");
        setIsSubmitting(false);
        return;
      }
      setIsRegistered(true);
      toast.success("Registration successful!");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during registration";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className='min-h-screen flex items-center justify-center bg-white px-4 py-12'>
      <div className='w-full max-w-[480px]'>
        {/* Card */}
        <div className='border border-stone-200 bg-white p-8 sm:p-12'>
          {isRegistered ? (
            /* Success state */
            <div className='flex flex-col items-center gap-5 text-center py-6'>
              <div className='w-14 h-14 rounded-full bg-green-50 flex items-center justify-center'>
                <CheckCircle className='w-7 h-7 text-green-600' />
              </div>
              <div className='space-y-2'>
                <h1 className='text-xl sm:text-2xl font-light text-stone-900 tracking-tight'>
                  {t("register.success_title")}
                </h1>
                <p className='text-sm text-stone-500 leading-relaxed max-w-xs mx-auto'>
                  {t("register.success_message")}
                </p>
              </div>
              <Link
                href='/login'
                className='inline-flex items-center gap-2 text-sm text-stone-900 hover:text-stone-600 transition-colors mt-4'>
                <ArrowLeft className='w-4 h-4' />
                {t("register.go_to_login")}
              </Link>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className='text-center mb-10'>
                <h1 className='text-2xl sm:text-[28px] font-light text-stone-900 tracking-tight mb-3'>
                  {t("register.title")}
                </h1>
                <p className='text-sm text-stone-500'>{t("register.subtitle")}</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-7'>
                {/* Name + Email side-by-side on sm+ */}
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-7'>
                  {/* Name */}
                  <div>
                    <label
                      htmlFor='reg-name'
                      className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                      {t("register.name")}
                    </label>
                    <Input
                      {...form.register("name")}
                      id='reg-name'
                      type='text'
                      placeholder={t("register.name_placeholder")}
                      className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                      disabled={isSubmitting}
                    />
                    {form.formState.errors.name && (
                      <p className='text-red-500 text-xs mt-2'>
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label
                      htmlFor='reg-email'
                      className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                      {t("register.email")}
                    </label>
                    <Input
                      {...form.register("email")}
                      id='reg-email'
                      type='email'
                      placeholder={t("register.email_placeholder")}
                      className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                      disabled={isSubmitting}
                    />
                    {form.formState.errors.email && (
                      <p className='text-red-500 text-xs mt-2'>
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor='reg-phone'
                    className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                    {t("register.phone")}
                  </label>
                  <Input
                    {...form.register("phone")}
                    id='reg-phone'
                    type='tel'
                    placeholder={t("register.phone_placeholder")}
                    className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.phone && (
                    <p className='text-red-500 text-xs mt-2'>
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>

                {/* Password + Confirm side-by-side on sm+ */}
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-7'>
                  {/* Password */}
                  <div>
                    <label
                      htmlFor='reg-password'
                      className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                      {t("register.password")}
                    </label>
                    <div className='relative'>
                      <Input
                        {...form.register("password")}
                        id='reg-password'
                        type={showPassword ? "text" : "password"}
                        placeholder={t("register.password_placeholder")}
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

                  {/* Confirm Password */}
                  <div>
                    <label
                      htmlFor='reg-confirm'
                      className='block text-xs uppercase tracking-widest text-stone-500 mb-2 font-medium'>
                      {t("register.confirm_password")}
                    </label>
                    <div className='relative'>
                      <Input
                        {...form.register("confirmPassword")}
                        id='reg-confirm'
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder={t("register.confirm_password_placeholder")}
                        className='border-0 border-b border-stone-300 bg-transparent rounded-none px-0 py-3 pe-10 text-sm focus:outline-none focus:ring-0 focus:border-stone-900 transition-colors placeholder:text-stone-400 text-stone-900'
                        disabled={isSubmitting}
                      />
                      <button
                        type='button'
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className='absolute end-0 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors'
                        disabled={isSubmitting}>
                        {showConfirmPassword ? (
                          <EyeOff className='w-4 h-4' />
                        ) : (
                          <Eye className='w-4 h-4' />
                        )}
                      </button>
                    </div>
                    {form.formState.errors.confirmPassword && (
                      <p className='text-red-500 text-xs mt-2'>
                        {form.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Submit */}
                <button
                  type='submit'
                  disabled={isSubmitting}
                  className='w-full py-3 mt-2 bg-stone-900 text-white text-sm font-medium tracking-wide uppercase hover:bg-stone-800 transition-colors disabled:opacity-40'>
                  {isSubmitting ? t("register.submitting") : t("register.submit")}
                </button>

                {/* Divider */}
                <div className='flex items-center gap-3 mt-2'>
                  <div className='h-px flex-1 bg-stone-200' />
                  <span className='text-xs text-stone-400'>{t("register.has_account")}</span>
                  <div className='h-px flex-1 bg-stone-200' />
                </div>

                <Link
                  href='/login'
                  className='text-center text-sm text-stone-900 hover:text-stone-600 transition-colors font-light -mt-2'>
                  {t("register.sign_in")}
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
