import AnimatedContent from "#root/components/utils/AnimatedContent";
import { Button } from "#root/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "#root/components/ui/input";
import { Link } from "#root/components/utils/Link";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import { MinimalLoginPage } from "#root/components/template-system/minimal/MinimalLoginPage";
import { authClient } from "#root/lib/auth-client.js";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password cannot be empty"),
});

type FormValues = z.infer<typeof formSchema>;

export default function Page() {
  const layoutSettings = useLayoutSettings();
  const isMinimal = layoutSettings.header.navbarStyle === "minimal";

  if (isMinimal) {
    return <MinimalLoginPage />;
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
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

      // Redirect based on role
      const role = (result.data?.user as { role?: string } | null)?.role;
      if (role === "admin" || role === "superadmin") {
        window.location.href = "/dashboard";
      } else {
        window.location.href = "/";
      }
    } catch (error) {
      toast.error("Something went wrong. Please refresh the page and try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <section className='relative w-full h-screen flex justify-center items-center py-12 md:py-24 px-4 md:px-8 overflow-hidden'>
      {/* DARK IDENTITY: Ritual / Night - Cinematic gradient background */}
      <div className='absolute inset-0 bg-gradient-to-br from-[#1A1612] via-[#2B231D] to-[#1C1814]' />

      {/* Subtle grain texture for tactile, non-digital feeling */}
      <div
        className='absolute inset-0 opacity-[0.015]'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Deep vignette for cinematic depth */}
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]' />

      {/* LIGHT IDENTITY: Atelier / Day - Floating login card with gentle fade-in */}
      <div className='relative w-full max-w-[420px] h-auto bg-[#F8F6F3] rounded-[20px] flex flex-col gap-10 p-12 md:p-14 shadow-[0_12px_60px_rgba(0,0,0,0.08),0_4px_20px_rgba(0,0,0,0.04)] animate-in fade-in duration-700 ease-out'>
        {/* Soft inner glow for depth */}
        <div className='absolute inset-0 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]' />

        <div className='relative space-y-3'>
          <h1 className='text-[28px] md:text-[32px] text-center font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
            Enter Percé
          </h1>
          <p className='text-center text-[13px] text-[#8B7E74] tracking-wide leading-relaxed'>
            Access your private atelier
          </p>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete='on'
          className='relative flex flex-col gap-8 w-full'>
          {/* Email input */}
          <div className='relative'>
            <label
              htmlFor='email'
              className='block text-[10px] uppercase tracking-[0.12em] text-[#8B7E74] mb-3 font-medium'>
              Email
            </label>
            <div className='relative'>
              <Input
                {...form.register("email")}
                id='email'
                type='email'
                autoComplete='email'
                placeholder='your@email.com'
                className='border-0 border-b border-[#D9D3CC] bg-transparent rounded-none px-0 py-3 w-full text-[15px] focus:outline-none focus:ring-0 focus:border-[#C4A574] transition-all duration-500 placeholder:text-[#BFB5AA] text-[#2B231D] font-light'
                disabled={isSubmitting}
              />
            </div>
            {form.formState.errors.email && (
              <p className='text-[#9D6B6B] text-[11px] mt-2.5 tracking-wide'>
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Password input */}
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
                autoComplete='current-password'
                placeholder='Enter password'
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

          {/* Primary CTA - Calm, confident, not attention-seeking */}
          <Button
            className='w-full bg-[#2B231D] hover:bg-[#3A3028] text-[#F8F6F3] font-normal text-[14px] tracking-[0.04em] mt-4 py-7 rounded-[14px] transition-all duration-500 shadow-[0_4px_16px_rgba(43,35,29,0.12)] hover:shadow-[0_6px_24px_rgba(43,35,29,0.18)] uppercase'
            type='submit'
            disabled={isSubmitting}>
            {isSubmitting ? "Entering..." : "Login"}
          </Button>

          {/* Forgot password link */}
          <Link
            href='/forgot-password'
            className='text-center text-[12px] text-[#9C918A] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light'>
            Forgot password?
          </Link>

          {/* Secondary action - understated and elegant */}
          <div className='flex items-center justify-center gap-2 mt-4'>
            <div className='h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#D9D3CC] to-transparent opacity-40' />
            <p className='text-center text-[12px] text-[#9C918A] tracking-[0.04em] px-4'>
              New to Percé?
            </p>
            <div className='h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#D9D3CC] to-transparent opacity-40' />
          </div>

          <Link
            href='/register'
            className='text-center text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light opacity-80 hover:opacity-100 -mt-4'>
            Create an account
          </Link>
        </form>
      </div>
    </section>
  );
}
