import { useState } from "react";
import { z } from "zod";
import { CheckCircle } from "lucide-react";
import { Input } from "#root/components/ui/input";
import { Button } from "#root/components/ui/button";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";
import { useLayoutSettings } from "#root/frontend/contexts/LayoutSettingsContext";
import soonImage from "#root/assets/soon-website-v2.jpg.jpeg";

const emailSchema = z.string().email();

export function MinimalComingSoonPage() {
  const layoutSettings = useLayoutSettings();
  const storeName = layoutSettings.siteTitle || "Our Store";

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    setSubmitting(true);
    try {
      await trpc.settings.subscribeComingSoon.mutate({ email, phone: phone.trim() || undefined });
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="max-w-md w-full text-center space-y-6 py-16">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-stone-700" />
          </div>
          <h1 className="text-2xl font-light tracking-tight text-stone-900">You're on the list!</h1>
          <p className="text-sm text-stone-500 leading-relaxed max-w-xs mx-auto">
            Check your inbox — we've sent you something. See you soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        {/* <p className="text-xs tracking-[0.25em] uppercase text-stone-400 mb-4">Coming Soon</p>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tight text-stone-900 mb-10">
          {storeName}
        </h1> */}

        {/* Hero image */}
        <div className="w-full max-w-[460px]">
          <img
            src={soonImage}
            alt={storeName}
            className="w-full object-cover"
          />
          <p className="text-xs text-stone-600 mb-7">Drop your email — be the first to know when we launch.</p>
        </div>

        {/* Email capture card */}
        <div className="w-full max-w-[460px] border border-stone-200 bg-white p-8 sm:p-10 text-left">

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-stone-600 mb-2">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                disabled={submitting}
                className="border-0 border-b border-stone-300 rounded-none px-0 py-2.5 text-sm bg-transparent focus-visible:ring-0 focus-visible:border-stone-900 placeholder:text-stone-300"
              />
              {emailError && (
                <p className="text-red-500 text-xs mt-1">{emailError}</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-stone-600 mb-2">
                WhatsApp Number <span className="normal-case text-stone-400">(optional)</span>
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="WhatsApp number"
                disabled={submitting}
                className="border-0 border-b border-stone-300 rounded-none px-0 py-2.5 text-sm bg-transparent focus-visible:ring-0 focus-visible:border-stone-900 placeholder:text-stone-300"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white text-xs tracking-widest uppercase py-3 rounded-none h-auto mt-1">
              {submitting ? "Submitting…" : "Notify Me at Launch"}
            </Button>
          </form>
        </div>
      </div>

      {/* Footer strip */}
      <div className="border-t border-stone-100 py-4 text-center">
        <p className="text-xs text-stone-400">© {new Date().getFullYear()} {storeName}</p>
      </div>
    </div>
  );
}
