import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { authClient } from "#root/lib/auth-client.js";

function useSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

const formSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(255),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

export default function Page() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: FormValues) => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: values.password,
        token,
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to reset password");
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  // No token in URL
  if (!token) {
    return (
      <section className='relative w-full h-screen flex justify-center items-center py-12 md:py-24 px-4 md:px-8 overflow-hidden'>
        <div className='absolute inset-0 bg-gradient-to-br from-[#1A1612] via-[#2B231D] to-[#1C1814]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]' />
        <div className='relative w-full max-w-[420px] bg-[#F8F6F3] rounded-[20px] flex flex-col items-center gap-6 p-12 md:p-14 shadow-[0_12px_60px_rgba(0,0,0,0.08)] animate-in fade-in duration-700 ease-out'>
          <div className='w-16 h-16 rounded-full bg-[#FFF3E0] flex items-center justify-center'>
            <AlertCircle className='w-8 h-8 text-[#E65100]' />
          </div>
          <div className='space-y-3 text-center'>
            <h1 className='text-[24px] font-light tracking-[-0.02em] text-[#2B231D]'>
              Invalid link
            </h1>
            <p className='text-[14px] text-[#8B7E74] leading-relaxed'>
              This password reset link is missing or invalid. Please request a
              new one.
            </p>
          </div>
          <Link
            href='/forgot-password'
            className='text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light'>
            Request a new reset link
          </Link>
        </div>
      </section>
    );
  }

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
                Password updated
              </h1>
              <p className='text-[14px] text-[#8B7E74] leading-relaxed max-w-[300px]'>
                Your password has been successfully reset. You can now log in
                with your new password.
              </p>
            </div>
            <Button
              className='w-full bg-[#2B231D] hover:bg-[#3A3028] text-[#F8F6F3] font-normal text-[14px] tracking-[0.04em] py-7 rounded-[14px] transition-all duration-500 shadow-[0_4px_16px_rgba(43,35,29,0.12)] hover:shadow-[0_6px_24px_rgba(43,35,29,0.18)] uppercase mt-2'
              onClick={() => { window.location.href = "/login"; }}>
              Go to Login
            </Button>
          </div>
        ) : (
          <>
            <div className='relative space-y-3'>
              <h1 className='text-[28px] md:text-[32px] text-center font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                New password
              </h1>
              <p className='text-center text-[13px] text-[#8B7E74] tracking-wide leading-relaxed'>
                Choose a strong password for your account
              </p>
            </div>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='relative flex flex-col gap-8 w-full'>
              {/* Password */}
              <div className='relative'>
                <label
                  htmlFor='password'
                  className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
                  New Password
                </label>
                <div className='relative'>
                  <Input
                    {...form.register("password")}
                    id='password'
                    type={showPassword ? "text" : "password"}
                    placeholder='At least 8 characters'
                    className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full pr-10 text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                    disabled={isSubmitting}
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword(!showPassword)}
                    className='absolute right-0 top-1/2 transform -translate-y-1/2 text-[#9C918A] hover:text-[#C4A574] transition-colors duration-500 opacity-60 hover:opacity-100'
                    disabled={isSubmitting}>
                    {showPassword ? (
                      <EyeOff className='h-[15px] w-[15px]' />
                    ) : (
                      <Eye className='h-[15px] w-[15px]' />
                    )}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className='text-[#9D6B6B] text-[11px] mt-2.5 tracking-wide'>
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div className='relative'>
                <label
                  htmlFor='confirmPassword'
                  className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
                  Confirm Password
                </label>
                <div className='relative'>
                  <Input
                    {...form.register("confirmPassword")}
                    id='confirmPassword'
                    type={showConfirm ? "text" : "password"}
                    placeholder='Repeat your password'
                    className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full pr-10 text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                    disabled={isSubmitting}
                  />
                  <button
                    type='button'
                    onClick={() => setShowConfirm(!showConfirm)}
                    className='absolute right-0 top-1/2 transform -translate-y-1/2 text-[#9C918A] hover:text-[#C4A574] transition-colors duration-500 opacity-60 hover:opacity-100'
                    disabled={isSubmitting}>
                    {showConfirm ? (
                      <EyeOff className='h-[15px] w-[15px]' />
                    ) : (
                      <Eye className='h-[15px] w-[15px]' />
                    )}
                  </button>
                </div>
                {form.formState.errors.confirmPassword && (
                  <p className='text-[#9D6B6B] text-[11px] mt-2.5 tracking-wide'>
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                className='w-full bg-[#2B231D] hover:bg-[#3A3028] text-[#F8F6F3] font-normal text-[14px] tracking-[0.04em] mt-4 py-7 rounded-[14px] transition-all duration-500 shadow-[0_4px_16px_rgba(43,35,29,0.12)] hover:shadow-[0_6px_24px_rgba(43,35,29,0.18)] uppercase'
                type='submit'
                disabled={isSubmitting}>
                {isSubmitting ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
