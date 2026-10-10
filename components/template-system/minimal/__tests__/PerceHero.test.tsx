import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";
import { PerceHero, type PerceHeroProps } from "../PerceHero";

const hero = DEFAULT_HOMEPAGE_CONTENT.hero;
const slide = {
  imageUrl: "/uploads/homepage/hero-a.webp",
  mobileImageUrl: "/uploads/homepage/hero-mobile-a.webp",
  linkUrl: "/shop",
};
const video = { src: "/uploads/homepage/hero-video-a.mp4" };

const render = (props: Partial<PerceHeroProps>) =>
  renderToStaticMarkup(createElement(PerceHero, { hero, slides: [], ...props }));

describe("PerceHero media", () => {
  it("renders the image-only hero exactly as before when no video is set", () => {
    const html = render({ slides: [slide] });
    expect(html).toContain('src="/uploads/homepage/hero-a.webp"');
    expect(html).toContain('srcSet="/uploads/homepage/hero-mobile-a.webp"');
    expect(html).toContain("Small pieces. Made to mix.");
    expect(html).not.toContain("<video");
  });

  it("server-renders the hero image as the poster and leaves the video to the client", () => {
    const html = render({ slides: [slide], video });
    // The still image is in the SSR markup (LCP, fallback, reduced motion)…
    expect(html).toContain('src="/uploads/homepage/hero-a.webp"');
    expect(html).toContain('fetchPriority="high"');
    // …and the video is not, so it can never block first paint.
    expect(html).not.toContain("<video");
    expect(html).not.toContain("hero-video-a.mp4");
    // Copy and CTA are untouched.
    expect(html).toContain("Small pieces. Made to mix.");
    expect(html).toContain("Piercing jewellery, delivered across Egypt.");
    expect(html).toContain(">Shop all</a>");
  });

  it("keeps the same frame (no layout change) with and without a video", () => {
    const frame = 'aspect-[4/5] sm:aspect-[3/4] md:aspect-[16/9]';
    expect(render({ slides: [slide] })).toContain(frame);
    expect(render({ slides: [slide], video })).toContain(frame);
  });

  it("shows only the first slide as a still when a video is set — no carousel underneath", () => {
    const slides = [slide, { imageUrl: "/b.webp" }, { imageUrl: "/c.webp" }];
    const withoutVideo = render({ slides });
    expect(withoutVideo).toContain('aria-roledescription="carousel"');
    expect(withoutVideo).toContain("/b.webp");

    const withVideo = render({ slides, video });
    expect(withVideo).not.toContain('aria-roledescription="carousel"');
    expect(withVideo).not.toContain("/b.webp");
    expect(withVideo).not.toContain("Show highlight");
  });

  it("renders the media frame, not the typographic hero, for a video with no image", () => {
    const html = render({ video });
    expect(html).toContain("aspect-[4/5]");
    expect(html).not.toContain("min-h-[58vh]");
  });

  it("renders nothing when the hero is disabled, video or not", () => {
    expect(render({ hero: { ...hero, enabled: false }, slides: [slide], video })).toBe("");
  });
});
