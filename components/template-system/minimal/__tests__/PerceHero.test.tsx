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

  it("keeps the same CSS-sized frame (no layout change) with and without a video", () => {
    expect(render({ slides: [slide] })).toContain("perce-hero-frame");
    expect(render({ slides: [slide], video })).toContain("perce-hero-frame");
  });

  it("overlays the copy on the media inside one full-bleed section — no split column", () => {
    const html = render({ slides: [slide], video });
    // One section holds media, scrim and copy; the old two-column grid is gone.
    expect(html.match(/<section/g)).toHaveLength(1);
    expect(html).not.toContain("md:grid-cols-12");
    expect(html).not.toContain("md:col-span-7");
    const media = html.indexOf("hero-a.webp");
    const scrim = html.indexOf("perce-hero-scrim");
    const heading = html.indexOf("<h1");
    expect(media).toBeGreaterThan(-1);
    expect(scrim).toBeGreaterThan(media);
    expect(heading).toBeGreaterThan(scrim);
  });

  it("lets clicks through the overlay except on the copy and CTA", () => {
    const html = render({ slides: [slide] });
    expect(html).toMatch(/perce-hero-scrim pointer-events-none/);
    expect(html).toMatch(/pointer-events-none absolute inset-x-0 bottom-0/);
    expect(html).toMatch(/perce-hero-copy pointer-events-auto/);
  });

  it("drops the scrim when there is no copy, so bare media stays clean", () => {
    const html = render({ hero: { ...hero, title: "", subtitle: "" }, slides: [slide] });
    expect(html).toContain("hero-a.webp");
    expect(html).not.toContain("perce-hero-scrim");
    expect(html).not.toContain("<h1");
  });

  it("crops the poster image with the same responsive position as the video", () => {
    // PerceHeroVideo carries the same class, so the fade from poster to video never jumps.
    expect(render({ slides: [slide], video })).toMatch(/<img[^>]*class="perce-hero-media /);
  });

  it("moves carousel dots clear of the lower-left copy", () => {
    const slides = [slide, { imageUrl: "/b.webp" }];
    expect(render({ slides })).toContain("right-(--perce-gutter)");
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
    expect(html).toContain("perce-hero-frame");
    expect(html).not.toContain("min-h-[58vh]");
  });

  it("renders nothing when the hero is disabled, video or not", () => {
    expect(render({ hero: { ...hero, enabled: false }, slides: [slide], video })).toBe("");
  });
});
