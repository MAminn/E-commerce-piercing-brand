import { describe, expect, it } from "vitest";
import {
  heroVideoFormatFromFilename,
  heroVideoFormatFromMime,
  isAllowedHeroVideoUrl,
  selectHeroVideoSource,
} from "#root/shared/homepage/hero-video";
import { HomepageContentSchema } from "#root/backend/homepage/trpc";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";

const desktopSrc = "/uploads/homepage/hero-video-a.mp4";
const mobileSrc = "/uploads/homepage/hero-video-mobile-b.mp4";
const env = { isMobile: false, prefersReducedMotion: false };

describe("selectHeroVideoSource", () => {
  it("plays the desktop video on desktop/tablet", () => {
    expect(selectHeroVideoSource({ ...env, desktopSrc, mobileSrc })).toBe(desktopSrc);
  });

  it("plays the mobile video on mobile when one is set", () => {
    expect(selectHeroVideoSource({ ...env, isMobile: true, desktopSrc, mobileSrc })).toBe(
      mobileSrc,
    );
  });

  it("falls back to the desktop video on mobile when no mobile video is set", () => {
    expect(selectHeroVideoSource({ ...env, isMobile: true, desktopSrc })).toBe(desktopSrc);
    expect(
      selectHeroVideoSource({ ...env, isMobile: true, desktopSrc, mobileSrc: "  " }),
    ).toBe(desktopSrc);
  });

  it("keeps the still image for reduced motion", () => {
    expect(
      selectHeroVideoSource({ ...env, prefersReducedMotion: true, desktopSrc, mobileSrc }),
    ).toBeNull();
    expect(
      selectHeroVideoSource({
        ...env,
        isMobile: true,
        prefersReducedMotion: true,
        desktopSrc,
        mobileSrc,
      }),
    ).toBeNull();
  });

  it("keeps the still image under Save-Data", () => {
    expect(selectHeroVideoSource({ ...env, saveData: true, desktopSrc })).toBeNull();
  });

  it("returns null when no video is configured", () => {
    expect(selectHeroVideoSource({ ...env })).toBeNull();
    expect(selectHeroVideoSource({ ...env, desktopSrc: null, isMobile: true })).toBeNull();
  });
});

describe("isAllowedHeroVideoUrl", () => {
  it.each(["", "/uploads/homepage/hero-video-x.mp4", "https://cdn.example.com/hero.webm"])(
    "accepts %j",
    (url) => expect(isAllowedHeroVideoUrl(url)).toBe(true),
  );

  it.each([
    "javascript:alert(1)",
    "data:video/mp4;base64,AAAA",
    "//evil.example.com/hero.mp4",
    "http://example.com/hero.mp4",
    "uploads/hero.mp4",
  ])("rejects %j", (url) => expect(isAllowedHeroVideoUrl(url)).toBe(false));
});

describe("hero video format helpers", () => {
  it("maps MP4 and WebM MIME types and extensions", () => {
    expect(heroVideoFormatFromMime("video/mp4")).toBe("mp4");
    expect(heroVideoFormatFromMime("VIDEO/WEBM; codecs=vp9")).toBe("webm");
    expect(heroVideoFormatFromFilename("Launch Reel.MP4")).toBe("mp4");
    expect(heroVideoFormatFromFilename("loop.webm")).toBe("webm");
  });

  it("rejects everything else", () => {
    expect(heroVideoFormatFromMime("video/quicktime")).toBeNull();
    expect(heroVideoFormatFromMime("application/x-msdownload")).toBeNull();
    expect(heroVideoFormatFromFilename("reel.mov")).toBeNull();
    expect(heroVideoFormatFromFilename("payload.mp4.exe")).toBeNull();
    expect(heroVideoFormatFromFilename("mp4")).toBeNull();
  });
});

describe("HomepageContentSchema hero video fields", () => {
  const withHero = (hero: Record<string, unknown>) => ({
    ...DEFAULT_HOMEPAGE_CONTENT,
    hero: { ...DEFAULT_HOMEPAGE_CONTENT.hero, ...hero },
  });

  it("still accepts stored content saved before the video fields existed", () => {
    const { backgroundVideo, mobileBackgroundVideo, ...legacyHero } =
      DEFAULT_HOMEPAGE_CONTENT.hero;
    expect(() =>
      HomepageContentSchema.parse({ ...DEFAULT_HOMEPAGE_CONTENT, hero: legacyHero }),
    ).not.toThrow();
  });

  it("round-trips desktop and mobile video URLs", () => {
    const parsed = HomepageContentSchema.parse(
      withHero({ backgroundVideo: desktopSrc, mobileBackgroundVideo: mobileSrc }),
    );
    expect(parsed.hero.backgroundVideo).toBe(desktopSrc);
    expect(parsed.hero.mobileBackgroundVideo).toBe(mobileSrc);
  });

  it("accepts a removed (null/undefined) video", () => {
    expect(() =>
      HomepageContentSchema.parse(withHero({ backgroundVideo: null, mobileBackgroundVideo: undefined })),
    ).not.toThrow();
  });

  it("rejects a script or protocol-relative URL", () => {
    expect(() => HomepageContentSchema.parse(withHero({ backgroundVideo: "javascript:alert(1)" }))).toThrow();
    expect(() => HomepageContentSchema.parse(withHero({ mobileBackgroundVideo: "//evil.example/x.mp4" }))).toThrow();
  });
});
