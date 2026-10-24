import { useEffect, useRef, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { trpc } from "#root/shared/trpc/client";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { Dialog, DialogContent, DialogTitle } from "#root/components/ui/dialog";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Check, Copy, Loader2, X } from "lucide-react";
import { getCartSessionToken } from "#root/lib/cart-session";

const DISMISSED_AT_KEY = "store-popup-dismissed-at";
const CLAIMED_KEY = "store-popup-claimed";

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

/**
 * Routes where the popup never opens: the shopper is already buying, and an
 * interruption there costs more than an email address is worth. Only WHERE it
 * may appear changes — offer, fields, timing and reshow rules are untouched.
 * A trigger that fires on one of these routes waits: the popup opens once the
 * shopper is on an ordinary page again (the dialog's `open` is gated, the
 * trigger itself is not re-armed or dropped).
 */
const SUPPRESSED_PATHS = ["/cart", "/checkout"];

export function isPopupSuppressedPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return SUPPRESSED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Touch-first devices (phones, in-app browsers): focusing the email field on
 * open raises the on-screen keyboard over the popup before the shopper has
 * read it. There the dialog itself takes focus instead, so the keyboard opens
 * only when they tap a field. Mouse/keyboard devices keep the field focused.
 */
function isTouchPrimary(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

/** Copies text, falling back to a hidden textarea where the async Clipboard API is missing or blocked (some in-app browsers). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
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
  const { locale, dir, t } = useMinimalI18n();
  const { urlPathname } = usePageContext();
  const suppressedHere = isPopupSuppressedPath(urlPathname);
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimedCode, setClaimedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
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

  const handleCopy = async () => {
    if (!claimedCode) return;
    setCopyState((await copyText(claimedCode)) ? "copied" : "failed");
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
    <Dialog open={open && !suppressedHere} onOpenChange={handleOpenChange}>
      <DialogContent
        dir={dir}
        onOpenAutoFocus={(event) => {
          if (!isTouchPrimary()) return;
          event.preventDefault();
          // Keep focus inside the dialog (screen readers still land on it),
          // just not on a text field.
          (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
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
              {/* select-all: a long-press selects the whole code, the fallback
                  when the Copy action cannot reach the clipboard. */}
              <div
                data-testid='popup-claimed-code'
                className='inline-block select-all border border-dashed rounded-md px-4 py-2 font-mono text-sm tracking-wider bg-muted'>
                {claimedCode}
              </div>
              <div>
                <Button type='button' variant='outline' onClick={handleCopy} className='min-h-11 gap-2'>
                  {copyState === "copied" ? (
                    <Check className='w-4 h-4' aria-hidden />
                  ) : (
                    <Copy className='w-4 h-4' aria-hidden />
                  )}
                  {copyState === "copied" ? t("popup.copied") : t("popup.copy_code")}
                </Button>
              </div>
              <p aria-live='polite' className='min-h-4 text-xs text-muted-foreground'>
                {copyState === "failed" ? t("popup.copy_failed") : ""}
              </p>
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
