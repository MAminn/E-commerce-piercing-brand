import { useEffect, useRef, useState } from "react";
import { trpc } from "#root/shared/trpc/client";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Dialog, DialogContent, DialogTitle } from "#root/components/ui/dialog";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Loader2, X } from "lucide-react";
import { getCartSessionToken } from "#root/lib/cart-session";

const DISMISSED_AT_KEY = "synt-popup-dismissed-at";
const CLAIMED_KEY = "synt-popup-claimed";

interface PopupConfig {
  enabled: boolean;
  imageUrl: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  submitLabelEn: string;
  submitLabelAr: string;
  successMessageEn: string;
  successMessageAr: string;
  dismissLabelEn: string;
  dismissLabelAr: string;
  dismissHref: string;
  collectPhone: boolean;
  phoneRequired: boolean;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  triggerExitIntent: boolean;
  reshowAfterDays: number;
}

function shouldSuppress(reshowAfterDays: number): boolean {
  if (typeof window === "undefined") return true;
  if (localStorage.getItem(CLAIMED_KEY) === "true") return true;

  const dismissedAt = localStorage.getItem(DISMISSED_AT_KEY);
  if (!dismissedAt) return false;

  const elapsedMs = Date.now() - Number(dismissedAt);
  const reshowMs = reshowAfterDays * 24 * 60 * 60 * 1000;
  return elapsedMs < reshowMs;
}

export function EntryPopup() {
  const { locale, dir } = useMinimalI18n();
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimedCode, setClaimedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const triggeredRef = useRef(false);

  // Fetch config once, client-side only (avoids SSR flicker/hydration mismatch
  // for a below-the-fold overlay that shouldn't affect first paint).
  useEffect(() => {
    trpc.popup.getPublicConfig
      .query()
      .then((result) => {
        if (result.success) setConfig(result.result as PopupConfig);
      })
      .catch(() => {
        // Popup is a nice-to-have — a failed config fetch just means it never shows.
      });
  }, []);

  useEffect(() => {
    if (!config || !config.enabled) return;
    if (shouldSuppress(config.reshowAfterDays)) return;

    const trigger = () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      setOpen(true);
    };

    const timers: Array<() => void> = [];

    if (config.triggerDelaySeconds > 0 || config.triggerDelaySeconds === 0) {
      const timeoutId = window.setTimeout(trigger, config.triggerDelaySeconds * 1000);
      timers.push(() => window.clearTimeout(timeoutId));
    }

    if (config.triggerScrollPercent > 0) {
      const onScroll = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const scrolledPercent = (window.scrollY / scrollable) * 100;
        if (scrolledPercent >= config.triggerScrollPercent) trigger();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      timers.push(() => window.removeEventListener("scroll", onScroll));
    }

    if (config.triggerExitIntent) {
      const onMouseLeave = (e: MouseEvent) => {
        if (e.clientY <= 0) trigger();
      };
      document.addEventListener("mouseleave", onMouseLeave);
      timers.push(() => document.removeEventListener("mouseleave", onMouseLeave));
    }

    return () => {
      for (const cleanup of timers) cleanup();
    };
  }, [config]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && !claimedCode) {
      localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await trpc.popup.claim.mutate({
        email,
        phone: config.collectPhone && phone ? phone : undefined,
        cartSessionToken: getCartSessionToken(),
      });
      if (result.success) {
        setClaimedCode(result.result.code);
        localStorage.setItem(CLAIMED_KEY, "true");
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!config || !config.enabled) return null;

  const title = locale === "ar" ? config.titleAr : config.titleEn;
  const description = locale === "ar" ? config.descriptionAr : config.descriptionEn;
  const submitLabel = locale === "ar" ? config.submitLabelAr : config.submitLabelEn;
  const dismissLabel = locale === "ar" ? config.dismissLabelAr : config.dismissLabelEn;
  const successMessage = (
    locale === "ar" ? config.successMessageAr : config.successMessageEn
  ).replace("{{code}}", claimedCode ?? "");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir={dir}
        className='p-0 overflow-hidden gap-0 w-[calc(100%-2rem)] max-w-[420px] sm:max-w-[420px] [&>button]:hidden'>
        <DialogTitle className='sr-only'>{title}</DialogTitle>

        <button
          type='button'
          onClick={() => handleOpenChange(false)}
          aria-label='Close'
          className='absolute top-3 z-10 rounded-full bg-white/90 p-1.5 shadow-sm hover:bg-white transition-colors'
          style={dir === "rtl" ? { left: 12 } : { right: 12 }}>
          <X className='w-4 h-4' />
        </button>

        {config.imageUrl && (
          <img
            src={config.imageUrl}
            alt=''
            className='w-full h-48 object-cover'
          />
        )}

        <div className='p-6 space-y-4'>
          {claimedCode ? (
            <div className='text-center space-y-3'>
              <p className='text-base font-medium'>{successMessage}</p>
              <div className='inline-block border border-dashed rounded-md px-4 py-2 font-mono text-sm tracking-wider bg-muted'>
                {claimedCode}
              </div>
            </div>
          ) : (
            <>
              <div className='text-center space-y-2'>
                <h2 className='text-xl font-semibold'>{title}</h2>
                <p className='text-sm text-muted-foreground'>{description}</p>
              </div>

              <form onSubmit={handleSubmit} className='space-y-3'>
                <div>
                  <Label htmlFor='popup-email' className='sr-only'>
                    Email
                  </Label>
                  <Input
                    id='popup-email'
                    type='email'
                    required
                    placeholder='Email address'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                {config.collectPhone && (
                  <div>
                    <Label htmlFor='popup-phone' className='sr-only'>
                      Phone
                    </Label>
                    <Input
                      id='popup-phone'
                      type='tel'
                      required={config.phoneRequired}
                      placeholder='Phone number'
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                )}
                {error && <p className='text-sm text-destructive'>{error}</p>}
                <Button type='submit' disabled={submitting} className='w-full'>
                  {submitting && <Loader2 className='w-4 h-4 mr-2 animate-spin' />}
                  {submitLabel}
                </Button>
              </form>

              {dismissLabel && (
                <button
                  type='button'
                  onClick={() => {
                    if (config.dismissHref) {
                      window.location.href = config.dismissHref;
                    } else {
                      handleOpenChange(false);
                    }
                  }}
                  className='block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors'>
                  {dismissLabel}
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
