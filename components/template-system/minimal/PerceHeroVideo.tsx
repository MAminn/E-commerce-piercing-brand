import { useEffect, useRef, useState } from "react";
import { cn } from "#root/lib/utils";
import {
  HERO_MOBILE_MEDIA_QUERY,
  selectHeroVideoSource,
} from "#root/shared/homepage/hero-video";

export interface PerceHeroVideoProps {
  src: string;
  /** Used below the mobile breakpoint; falls back to `src`. */
  mobileSrc?: string;
}

/**
 * The hero's background video, layered over the hero image.
 *
 * The image underneath is the poster and the fallback, so this is built to
 * fail invisibly:
 *
 * - Nothing renders on the server. The video mounts after hydration, so it
 *   never delays first paint or competes with the hero image for LCP, and the
 *   frame's aspect-ratio box means mounting it shifts nothing.
 * - It stays transparent until frames are actually playing. A blocked
 *   autoplay (iOS Low Power Mode, browser policy), a 404, or an unsupported
 *   codec simply leaves the image showing.
 * - Reduced motion and Save-Data skip the video entirely.
 * - It is decorative and inert: muted, no controls, no PiP/cast, hidden from
 *   assistive tech, and `pointer-events: none` so a click lands on whatever is
 *   underneath (the slide link).
 * - It pauses while scrolled out of view.
 */
export function PerceHeroVideo({ src, mobileSrc }: PerceHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Pick the source for this viewport and these preferences, and follow
  // changes (rotating a tablet across the breakpoint, toggling reduced motion).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mobileQuery = window.matchMedia(HERO_MOBILE_MEDIA_QUERY);
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;

    const update = () =>
      setActiveSrc(
        selectHeroVideoSource({
          desktopSrc: src,
          mobileSrc,
          isMobile: mobileQuery.matches,
          prefersReducedMotion: motionQuery.matches,
          saveData: connection?.saveData === true,
        }),
      );

    update();
    mobileQuery.addEventListener?.("change", update);
    motionQuery.addEventListener?.("change", update);
    return () => {
      mobileQuery.removeEventListener?.("change", update);
      motionQuery.removeEventListener?.("change", update);
    };
  }, [src, mobileSrc]);

  const renderSrc = activeSrc && activeSrc !== failedSrc ? activeSrc : null;

  // Start playback explicitly. `muted` is set as a property first: React does
  // not reliably reflect it as an attribute, and browsers only allow
  // autoplay for muted media.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !renderSrc) return;
    video.muted = true;
    video.defaultMuted = true;
    video.play()?.catch(() => {
      // Autoplay refused — the image underneath stays visible.
    });

    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) {
        video.play()?.catch(() => {});
      } else {
        video.pause();
      }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [renderSrc]);

  if (!renderSrc) return null;

  return (
    <video
      // A new element per source, so a breakpoint change never shows the
      // previous video's last frame stretched into the new crop.
      key={renderSrc}
      ref={videoRef}
      src={renderSrc}
      autoPlay
      muted
      loop
      playsInline
      preload='metadata'
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden='true'
      tabIndex={-1}
      onPlaying={() => setPlayingSrc(renderSrc)}
      onError={() => setFailedSrc(renderSrc)}
      className={cn(
        "pointer-events-none absolute inset-0 z-15 h-full w-full",
        "object-cover object-center",
        "transition-opacity duration-700 ease-out",
        playingSrc === renderSrc ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

PerceHeroVideo.displayName = "PerceHeroVideo";
