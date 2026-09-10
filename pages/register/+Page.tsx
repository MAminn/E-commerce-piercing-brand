import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Eye, EyeOff } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { MinimalRegisterPage } from "#root/components/template-system/minimal/MinimalRegisterPage";
import { authClient } from "#root/lib/auth-client.js";

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

export default function Page() {
  const layoutSettings = useLayoutSettings();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  if (isMinimal) {
    return <MinimalRegisterPage />;
  }

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
      toast.success(
        "Registration successful! Please check your email to verify your account.",
      );
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
    <section className='relative w-full min-h-screen flex justify-center items-center py-12 md:py-24 px-4 md:px-8 overflow-hidden'>
      {/* Background — matches login page */}
      <div className='absolute inset-0 bg-gradient-to-br from-[#1A1612] via-[#2B231D] to-[#1C1814]' />

      {/* Subtle grain texture */}
      <div
        className='absolute inset-0 opacity-[0.015]'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Cinematic vignette */}
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]' />

      {/* Card */}
      <div className='relative w-full max-w-[460px] h-auto bg-[#F8F6F3] rounded-[20px] flex flex-col gap-8 p-10 md:p-12 shadow-[0_12px_60px_rgba(0,0,0,0.08),0_4px_20px_rgba(0,0,0,0.04)] animate-in fade-in duration-700 ease-out'>
        {/* Soft inner glow */}
        <div className='absolute inset-0 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]' />

        {isRegistered ? (
          /* ── Success state ── */
          <div className='relative flex flex-col items-center gap-6 text-center'>
            <div className='w-16 h-16 rounded-full bg-[#E8F5E9] flex items-center justify-center'>
              <CheckCircle className='w-8 h-8 text-[#4CAF50]' />
            </div>
            <div className='space-y-3'>
              <h1 className='text-[24px] md:text-[28px] font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                You're all set
              </h1>
              <p className='text-[14px] text-[#8B7E74] leading-relaxed max-w-[320px]'>
                Please check your email to verify your account. Once verified,
                you can log in to access all features.
              </p>
            </div>
            <Link
              href='/login'
              className='inline-flex items-center gap-2 text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light mt-4'>
              <ArrowLeft className='w-4 h-4' />
              Go to login
            </Link>
          </div>
        ) : (
          /* ── Registration form ── */
          <>
            <div className='relative space-y-3'>
              <h1 className='text-[28px] md:text-[32px] text-center font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                Create account
              </h1>
              <p className='text-center text-[13px] text-[#8B7E74] tracking-wide leading-relaxed'>
                Join us — it only takes a moment
              </p>
            </div>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='relative flex flex-col gap-6 w-full'>
              {/* Name + Email — side by side on md+ */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Name */}
                <div className='relative'>
                  <label
                    htmlFor='name'
                    className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
                    Full name
                  </label>
                  <Input
                    {...form.register("name")}
                    id='name'
                    type='text'
                    placeholder='Jane Doe'
                    className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                    disabled={isSubmitting}
                  />
                  {form.formState.errors.name && (
                    <p className='text-[#9D6B6B] text-[11px] mt-2.5 tracking-wide'>
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                {/* Email */}
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
              </div>

              {/* Phone */}
              <div className='relative'>
                <label
                  htmlFor='phone'
                  className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
                  Phone
                </label>
                <Input
                  {...form.register("phone")}
                  id='phone'
                  type='tel'
                  placeholder='+201xxxxxxxxx'
                  className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                  disabled={isSubmitting}
                />
                {form.formState.errors.phone && (
                  <p className='text-[#9D6B6B] text-[11px] mt-2.5 tracking-wide'>
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>

              {/* Password + Confirm — side by side on md+ */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Password */}
                <div className='relative'>
                  <label
                    htmlFor='password'
                    className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
                    Password
                  </label>
                  <div className='relative'>
                    <Input
                      {...form.register("password")}
                      id='password'
                      type={showPassword ? "text" : "password"}
                      placeholder='Min. 8 characters'
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
                    Confirm password
                  </label>
                  <div className='relative'>
                    <Input
                      {...form.register("confirmPassword")}
                      id='confirmPassword'
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder='Repeat password'
                      className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full pr-10 text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                      disabled={isSubmitting}
                    />
                    <button
                      type='button'
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className='absolute right-0 top-1/2 transform -translate-y-1/2 text-[#9C918A] hover:text-[#C4A574] transition-colors duration-500 opacity-60 hover:opacity-100'
                      disabled={isSubmitting}>
                      {showConfirmPassword ? (
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
              </div>

              {/* Submit button */}
              <Button
                className='w-full bg-[#2B231D] hover:bg-[#3A3028] text-[#F8F6F3] font-normal text-[14px] tracking-[0.04em] mt-4 py-7 rounded-[14px] transition-all duration-500 shadow-[0_4px_16px_rgba(43,35,29,0.12)] hover:shadow-[0_6px_24px_rgba(43,35,29,0.18)] uppercase'
                type='submit'
                disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Create account"}
              </Button>

              {/* Divider + login link */}
              <div className='flex items-center justify-center gap-2 mt-2'>
                <div className='h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#D9D3CC] to-transparent opacity-40' />
                <p className='text-center text-[12px] text-[#9C918A] tracking-[0.04em] px-4'>
                  Already have an account?
                </p>
                <div className='h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#D9D3CC] to-transparent opacity-40' />
              </div>

              <Link
                href='/login'
                className='text-center text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light opacity-80 hover:opacity-100 -mt-2'>
                Sign in instead
              </Link>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
