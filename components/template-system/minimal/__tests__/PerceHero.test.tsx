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

  it("sets the copy over the media's lower edge, in one section, with one way in", () => {
    const html = render({ slides: [slide], video });
    expect(html.match(/<section/g)).toHaveLength(1);
    const frame = html.indexOf("perce-hero-frame");
    const media = html.indexOf("hero-a.webp");
    const heading = html.indexOf("<h1");
    expect(media).toBeGreaterThan(frame);
    expect(heading).toBeGreaterThan(media);
    // A soft fade behind the type, and stone type on it.
    expect(html).toContain("bg-gradient-to-t");
    expect(html).toMatch(/<h1[^>]*text-bg/);
    expect(html.match(/>Shop all<\/a>/g)).toHaveLength(1);
  });

  it("the slide's own link still works under the copy: only the CTA takes the pointer", () => {
    const html = render({ slides: [slide] });
    expect(html).toMatch(/<a[^>]*pointer-events-auto[^>]*>Shop all<\/a>/);
    expect(html).toContain("pointer-events-none absolute inset-x-0 bottom-0 z-40");
  });

  it("a hero with copy and no media is plain type on stone", () => {
    const html = render({ slides: [] });
    expect(html).toMatch(/<h1[^>]*text-ink/);
    expect(html).not.toContain("bg-gradient-to-t");
  });

  it("bare media with no copy renders no heading", () => {
    const html = render({ hero: { ...hero, title: "", subtitle: "" }, slides: [slide] });
    expect(html).toContain("hero-a.webp");
    expect(html).not.toContain("<h1");
  });

  it("crops the poster image with the same responsive position as the video", () => {
    // PerceHeroVideo carries the same class, so the fade from poster to video never jumps.
    expect(render({ slides: [slide], video })).toMatch(/<img[^>]*class="perce-hero-media /);
  });

  it("indexes several slides with numbers, not dots", () => {
    const slides = [slide, { imageUrl: "/b.webp" }];
    const html = render({ slides });
    expect(html).toContain(">01</button>");
    expect(html).toContain(">02</button>");
    expect(html).not.toContain("rounded-full");
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
