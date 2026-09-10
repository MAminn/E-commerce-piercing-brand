import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { MinimalForgotPasswordPage } from "#root/components/template-system/minimal/MinimalForgotPasswordPage";
import { authClient } from "#root/lib/auth-client.js";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type FormValues = z.infer<typeof formSchema>;

export default function Page() {
  const layoutSettings = useLayoutSettings();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  if (isMinimal) {
    return <MinimalForgotPasswordPage />;
  }

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
    <section className='relative w-full h-screen flex justify-center items-center py-12 md:py-24 px-4 md:px-8 overflow-hidden'>
      {/* Background */}
      <div className='absolute inset-0 bg-gradient-to-br from-[#1A1612] via-[#2B231D] to-[#1C1814]' />
      <div
        className='absolute inset-0 opacity-[0.015]'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]' />

      {/* Card */}
      <div className='relative w-full max-w-[420px] h-auto bg-[#F8F6F3] rounded-[20px] flex flex-col gap-10 p-12 md:p-14 shadow-[0_12px_60px_rgba(0,0,0,0.08),0_4px_20px_rgba(0,0,0,0.04)] animate-in fade-in duration-700 ease-out'>
        <div className='absolute inset-0 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]' />

        {isSuccess ? (
          <div className='relative flex flex-col items-center gap-6 text-center'>
            <div className='w-16 h-16 rounded-full bg-[#E8F5E9] flex items-center justify-center'>
              <CheckCircle className='w-8 h-8 text-[#4CAF50]' />
            </div>
            <div className='space-y-3'>
              <h1 className='text-[24px] md:text-[28px] font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                Check your email
              </h1>
              <p className='text-[14px] text-[#8B7E74] leading-relaxed max-w-[300px]'>
                If an account exists with that email, we've sent a password
                reset link. Please check your inbox and spam folder.
              </p>
            </div>
            <Link
              href='/login'
              className='inline-flex items-center gap-2 text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light mt-4'>
              <ArrowLeft className='w-4 h-4' />
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <div className='relative space-y-3'>
              <h1 className='text-[28px] md:text-[32px] text-center font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                Forgot password?
              </h1>
              <p className='text-center text-[13px] text-[#8B7E74] tracking-wide leading-relaxed'>
                Enter your email and we'll send you a reset link
              </p>
            </div>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='relative flex flex-col gap-8 w-full'>
              <div className='relative'>
                <label
                  htmlFor='email'
                  className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
                  Email
                </label>
                <Input
                  {...form.register("email")}
                  id='email'
                  type='email'
                  placeholder='your@email.com'
                  className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                  disabled={isSubmitting}
                />
                {form.formState.errors.email && (
                  <p className='text-[#9D6B6B] text-[11px] mt-2.5 tracking-wide'>
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <Button
                className='w-full bg-[#2B231D] hover:bg-[#3A3028] text-[#F8F6F3] font-normal text-[14px] tracking-[0.04em] mt-4 py-7 rounded-[14px] transition-all duration-500 shadow-[0_4px_16px_rgba(43,35,29,0.12)] hover:shadow-[0_6px_24px_rgba(43,35,29,0.18)] uppercase'
                type='submit'
                disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Reset Link"}
              </Button>

              <Link
                href='/login'
                className='inline-flex items-center justify-center gap-2 text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light mt-2'>
                <ArrowLeft className='w-4 h-4' />
                Back to login
              </Link>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
