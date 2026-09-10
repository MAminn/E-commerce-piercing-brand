import { useEffect, useState } from "react";
import { Button } from "#root/components/ui/button";
import { Link } from "#root/components/utils/Link";
import { trpc } from "#root/shared/trpc/client";
import { AlertCircle, CheckCircle, Loader2, MailX } from "lucide-react";

function useSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

type LoadState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "loaded"; email: string; unsubscribed: boolean };

export default function Page() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid" });
      return;
    }
    trpc.emailSubscription.getStatus
      .query({ token })
      .then((result) => {
        if (!result.success) {
          setState({ status: "invalid" });
          return;
        }
        setState({
          status: "loaded",
          email: result.result.email,
          unsubscribed: result.result.unsubscribed,
        });
      })
      .catch(() => setState({ status: "invalid" }));
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token || state.status !== "loaded") return;
    setIsSubmitting(true);
    try {
      const result = await trpc.emailSubscription.unsubscribe.mutate({ token });
      if (result.success) {
        setState({ status: "loaded", email: state.email, unsubscribed: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubscribe = async () => {
    if (!token || state.status !== "loaded") return;
    setIsSubmitting(true);
    try {
      const result = await trpc.emailSubscription.resubscribe.mutate({ token });
      if (result.success) {
        setState({ status: "loaded", email: state.email, unsubscribed: false });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className='relative w-full min-h-screen flex justify-center items-center py-12 md:py-24 px-4 md:px-8 overflow-hidden'>
      <div className='absolute inset-0 bg-gradient-to-br from-[#1A1612] via-[#2B231D] to-[#1C1814]' />
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]' />

      <div className='relative w-full max-w-[440px] bg-[#F8F6F3] rounded-[20px] flex flex-col items-center gap-6 p-12 md:p-14 shadow-[0_12px_60px_rgba(0,0,0,0.08),0_4px_20px_rgba(0,0,0,0.04)] animate-in fade-in duration-700 ease-out text-center'>
        {state.status === "loading" && (
          <>
            <Loader2 className='w-8 h-8 text-[#8B7E74] animate-spin' />
            <p className='text-[14px] text-[#8B7E74]'>Loading your preferences…</p>
          </>
        )}

        {state.status === "invalid" && (
          <>
            <div className='w-16 h-16 rounded-full bg-[#FFF3E0] flex items-center justify-center'>
              <AlertCircle className='w-8 h-8 text-[#E65100]' />
            </div>
            <div className='space-y-3'>
              <h1 className='text-[24px] font-light tracking-[-0.02em] text-[#2B231D]'>
                Invalid link
              </h1>
              <p className='text-[14px] text-[#8B7E74] leading-relaxed'>
                This unsubscribe link is missing or no longer valid. If you'd
                like to stop receiving emails, please contact us directly.
              </p>
            </div>
            <Link
              href='/'
              className='text-[13px] text-[#2B231D] hover:text-[#C4A574] transition-all duration-500 tracking-[0.04em] font-light'>
              Return home
            </Link>
          </>
        )}

        {state.status === "loaded" && state.unsubscribed && (
          <>
            <div className='w-16 h-16 rounded-full bg-[#E8F5E9] flex items-center justify-center'>
              <CheckCircle className='w-8 h-8 text-[#4CAF50]' />
            </div>
            <div className='space-y-3'>
              <h1 className='text-[24px] md:text-[28px] font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                You're unsubscribed
              </h1>
              <p className='text-[14px] text-[#8B7E74] leading-relaxed max-w-[320px]'>
                {state.email} will no longer receive marketing emails from
                us. You'll still receive order confirmations and other
                account-related emails.
              </p>
            </div>
            <Button
              variant='outline'
              className='w-full border-[#D9D3CC] text-[#2B231D] font-normal text-[14px] tracking-[0.04em] py-7 rounded-[14px] uppercase'
              onClick={handleResubscribe}
              disabled={isSubmitting}>
              {isSubmitting ? "Resubscribing…" : "Resubscribe"}
            </Button>
          </>
        )}

        {state.status === "loaded" && !state.unsubscribed && (
          <>
            <div className='w-16 h-16 rounded-full bg-[#F3EFE9] flex items-center justify-center'>
              <MailX className='w-8 h-8 text-[#8B7E74]' />
            </div>
            <div className='space-y-3'>
              <h1 className='text-[24px] md:text-[28px] font-light tracking-[-0.02em] text-[#2B231D] leading-tight'>
                Email preferences
              </h1>
              <p className='text-[14px] text-[#8B7E74] leading-relaxed max-w-[320px]'>
                {state.email} is currently subscribed to our marketing
                emails. You can unsubscribe at any time — order-related
                emails will not be affected.
              </p>
            </div>
            <Button
              className='w-full bg-[#2B231D] hover:bg-[#3A3028] text-[#F8F6F3] font-normal text-[14px] tracking-[0.04em] py-7 rounded-[14px] transition-all duration-500 shadow-[0_4px_16px_rgba(43,35,29,0.12)] hover:shadow-[0_6px_24px_rgba(43,35,29,0.18)] uppercase'
              onClick={handleUnsubscribe}
              disabled={isSubmitting}>
              {isSubmitting ? "Unsubscribing…" : "Unsubscribe"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
