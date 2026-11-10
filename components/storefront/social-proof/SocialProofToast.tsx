import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { SocialProofCard } from "./SocialProofCard";
import { trpc } from "#root/shared/trpc/client";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { fillTemplate } from "#root/components/bundles/bundle-ui";
import {
  displayedNameKey,
  getSocialProofStorage,
  isSocialProofSuppressed,
  readShownCount,
  readShownNameKeys,
  rememberShownName,
  relativeTimeBucket,
  suppressSocialProof,
  writeShownCount,
} from "#root/lib/social-proof-session";
import {
  isProductDetailRoute,
  isSocialProofExcludedRoute,
} from "#root/lib/social-proof-routes";

/**
 * Recent-order toast — ported from Mach's `MachSocialProofToast`.
 *
 * A small bottom-corner card naming a real, already-placed order: who (first
 * name plus one initial), roughly where, what, and how long ago. Everything
 * it renders was sanitised on the server — this component receives no order
 * id, email, phone or address, and could not display one if it tried.
 *
 * This file owns *when* a card appears: the feed fetch, the route gate, the
 * per-session budget and the timers — all exactly as in Mach. What changed
 * for Percé is only placement (it clears Percé's own fixed bars, below, and
 * from 640px sits bottom-END rather than Mach's bottom-start, because Percé's
 * homepage hero puts its primary "Shop all pieces" button in the bottom-start
 * corner, which a bottom-start card would cover) and
 * copy (the storefront's EN/AR translation table instead of English
 * literals). How it looks belongs to `SocialProofCard`, which the admin
 * preview mounts with demo copy so the two can never drift apart.
 */

interface SocialProofEvent {
  eventKey: string;
  displayName: string;
  location: string | null;
  productId: string;
  productSlug: string | null;
  productName: string;
  productImageUrl: string | null;
  occurredAt: Date | string;
}

interface SocialProofClientConfig {
  enabled: boolean;
  firstDelaySeconds: number;
  displayDurationSeconds: number;
  intervalSeconds: number;
  maxPerSession: number;
  showRelativeTime: boolean;
}

interface SocialProofFeed {
  config: SocialProofClientConfig;
  events: SocialProofEvent[];
}

/**
 * Where the card sits above the viewport's bottom edge.
 *
 * Percé has three bars fixed to the bottom of the screen, and the card has
 * to stay clear of each one rather than cover it:
 *  - the desktop bag/offer bar (StickyCartBar) publishes its live height as
 *    `--perce-sticky-bar-h` while it is on screen;
 *  - Pick Your Set's action bar publishes `--perce-set-bar-h`;
 *  - the PDP's sticky Add to bag (below 768px) publishes nothing, so the
 *    product route reserves a fixed 88px for it — the bar is a 52px button
 *    inside 12px padding plus a hairline, so 88px leaves a clear gap.
 * All of these are 0 / unset when their bar is not on screen.
 */
const PDP_MOBILE_CLEARANCE_PX = 88;
/** Inset from the bottom edge: 12px on phones, 24px from 768px (as Mach). */
const EDGE_PHONE_PX = 12;
const EDGE_WIDE_PX = 24;

/** Matches the CSS transition below, so the node unmounts after it finishes. */
const EXIT_MS = 300;
/** One frame's grace so the entering card transitions instead of snapping in. */
const ENTER_FRAME_MS = 24;

export function SocialProofToast() {
  const { urlPathname } = usePageContext();
  const { t } = useMinimalI18n();
  const excluded = isSocialProofExcludedRoute(urlPathname);
  const isPdp = isProductDetailRoute(urlPathname);

  const [feed, setFeed] = useState<SocialProofFeed | null>(null);
  const [active, setActive] = useState<SocialProofEvent | null>(null);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  const mountedRef = useRef(true);
  const fetchedRef = useRef(false);

  // Declared first so its cleanup runs before the scheduler's — that ordering
  // is what guarantees the scheduler's teardown can't setState after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The PDP's sticky bar exists only below 768px (`md:hidden`).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Client-side fetch, once. Deliberately not SSR data: this is a decorative
  // overlay that must not touch first paint, and rendering nothing on the
  // server means there is no hydration mismatch to have.
  useEffect(() => {
    if (excluded || fetchedRef.current) return;
    fetchedRef.current = true;
    trpc.socialProof.getPublicFeed
      .query()
      .then((result) => {
        if (!mountedRef.current) return;
        if (result.success) setFeed(result.result as SocialProofFeed);
      })
      .catch(() => {
        // A feed that fails to load simply never shows — never a console error
        // on a storefront page for a decorative widget.
      });
  }, [excluded]);

  const dismiss = useCallback(() => {
    suppressSocialProof(getSocialProofStorage());
    setDismissed(true);
    setShown(false);
    setActive(null);
  }, []);

  /**
   * The whole timing engine, in one effect so there is exactly one owner of
   * the timer set. Every `setTimeout` id lands in `timers` and every exit path
   * — unmount, route change, config change, dismissal — runs the same cleanup.
   */
  useEffect(() => {
    if (excluded || dismissed) return;
    if (!feed?.config.enabled) return;

    const { events, config } = feed;
    if (events.length === 0) return;

    const storage = getSocialProofStorage();
    if (isSocialProofSuppressed(storage)) return;

    const reservedNames = new Set(readShownNameKeys(storage));
    const queuedEvents = events.filter((event) => {
      const key = displayedNameKey(event.displayName);
      if (!key || reservedNames.has(key)) return false;
      reservedNames.add(key);
      return true;
    });

    // The cap is session-wide. Fewer unseen real names means fewer cards,
    // never a repeated name to fill the configured allowance.
    let shownCount = readShownCount(storage);
    const total = Math.min(config.maxPerSession - shownCount, queuedEvents.length);
    if (total <= 0) return;
    let cursor = 0;

    const timers: number[] = [];
    const wait = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const show = () => {
      if (!mountedRef.current) return;
      // Re-checked here rather than only up front: a dismissal could have
      // landed in this tab while the cycle was waiting.
      if (isSocialProofSuppressed(storage)) return;
      const event = queuedEvents[cursor];
      if (!event) return;

      cursor += 1;
      shownCount += 1;
      writeShownCount(storage, shownCount);
      rememberShownName(storage, event.displayName);
      setActive(event);
      wait(() => {
        if (mountedRef.current) setShown(true);
      }, ENTER_FRAME_MS);
      wait(hide, config.displayDurationSeconds * 1000);
    };

    function hide() {
      if (!mountedRef.current) return;
      setShown(false);
      wait(() => {
        if (!mountedRef.current) return;
        setActive(null);
        if (cursor < total) wait(show, config.intervalSeconds * 1000);
      }, EXIT_MS);
    }

    wait(show, config.firstDelaySeconds * 1000);

    return () => {
      for (const id of timers) window.clearTimeout(id);
      if (!mountedRef.current) return;
      setShown(false);
      setActive(null);
    };
  }, [feed, excluded, dismissed]);

  // Escape dismisses, matching the X. Bound only while a card is on screen so
  // the storefront carries no idle global key listener.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, dismiss]);

  const relativeTime = useMemo(() => {
    if (!active || !feed?.config.showRelativeTime) return "";
    const bucket = relativeTimeBucket(active.occurredAt);
    if (!bucket) return "";
    switch (bucket.unit) {
      case "now":
        return t("social_proof.just_now");
      case "minute":
        return fillTemplate(t("social_proof.minutes_ago"), { count: bucket.count });
      case "hour":
        return fillTemplate(t("social_proof.hours_ago"), { count: bucket.count });
      case "day":
        return bucket.count === 1
          ? t("social_proof.day_ago")
          : fillTemplate(t("social_proof.days_ago"), { count: bucket.count });
    }
  }, [active, feed?.config.showRelativeTime, t]);

  if (excluded || dismissed || !active) return null;

  const href = getProductUrl({ id: active.productId, slug: active.productSlug });
  const reserved = isPdp && isPhone ? PDP_MOBILE_CLEARANCE_PX : 0;
  const edge = isPhone ? EDGE_PHONE_PX : EDGE_WIDE_PX;

  return (
    <div
      // `pointer-events-none` on the positioner so the empty column beside a
      // narrow card never eats clicks on the page behind it.
      className='pointer-events-none fixed start-3 end-3 flex justify-end sm:start-auto sm:end-6'
      style={{
        zIndex: "var(--perce-z-sticky)",
        bottom: `calc(env(safe-area-inset-bottom, 0px) + var(--perce-sticky-bar-h, 0px) + var(--perce-set-bar-h, 0px) + ${reserved + edge}px)`,
      }}
      role='status'
      aria-live='polite'>
      <SocialProofCard
        // Keyed on the event so each notification is a fresh node — the enter
        // transition can never inherit the previous card's transform.
        key={active.eventKey}
        eyebrow={t("social_proof.eyebrow")}
        displayName={active.displayName}
        location={active.location}
        orderedTemplate={t("social_proof.ordered")}
        orderedInTemplate={t("social_proof.ordered_in")}
        productName={active.productName}
        productImageUrl={active.productImageUrl}
        relativeTime={relativeTime}
        href={href}
        linkSuffix={t("social_proof.view_product")}
        onDismiss={dismiss}
        dismissLabel={t("social_proof.dismiss")}
        className={`pointer-events-auto transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      />
    </div>
  );
}
