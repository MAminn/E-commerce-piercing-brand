/**
 * Noir (Demo 5) — design tokens.
 *
 * Single source of truth for the Noir design language: dark luxury
 * storefront (black canvas, signal-red accent, condensed uppercase
 * typography, dark glass cards). Every Noir component imports from here
 * so styling stays consistent across phases.
 */

export const NOIR_COLORS = {
  bgBase: "#000000",
  bgElevated: "#101010",
  card: "#141414",
  border: "rgba(255,255,255,0.10)",
  textPrimary: "#FFFFFF",
  textSecondary: "#A3A3A3",
  textMuted: "#6B6B6B",
  accent: "#E8112D",
  accentHover: "#C40E26",
} as const;

/* ------------------------------------------------------------------ */
/*  Reusable Tailwind arbitrary-value class strings                    */
/* ------------------------------------------------------------------ */

/** Dark glass card surface. */
export const NOIR_CARD_CLASSES =
  "bg-[#141414] border border-white/10 rounded-lg";

/** Card surface with a subtle vertical gradient (image-dominant cards). */
export const NOIR_CARD_GRADIENT_CLASSES =
  "bg-linear-to-b from-[#181818] to-[#101010] border border-white/10 rounded-lg";

/** Hairline border used on dividers and outlined elements. */
export const NOIR_BORDER_CLASSES = "border border-white/10";

/** Card hover treatment: border brightens + slight lift. */
export const NOIR_CARD_HOVER_CLASSES =
  "transition-all duration-300 hover:border-white/25 hover:-translate-y-1";

/** Secondary body text. */
export const NOIR_TEXT_SECONDARY_CLASSES = "text-[#A3A3A3]";

/** Muted/tertiary text. */
export const NOIR_TEXT_MUTED_CLASSES = "text-[#6B6B6B]";

/** Signal-red accent text. */
export const NOIR_ACCENT_TEXT_CLASSES = "text-[#E8112D]";

/** Signal-red accent surface with hover darkening. */
export const NOIR_ACCENT_BG_CLASSES = "bg-[#E8112D] hover:bg-[#C40E26]";

/** Dark form input: elevated surface, hairline border, red focus. */
export const NOIR_INPUT_CLASSES =
  "bg-[#101010] border border-white/15 text-white placeholder:text-[#6B6B6B] rounded-md focus:outline-none focus:border-[#E8112D] transition-colors duration-300";

/* ------------------------------------------------------------------ */
/*  Section rhythm — 3 vertical tiers applied across all Noir sections */
/* ------------------------------------------------------------------ */

/** Standard horizontal gutter + centered max width for a section body. */
export const NOIR_CONTAINER = "mx-auto max-w-7xl px-4 md:px-8";

/** Tight vertical rhythm — thin bands (benefits strip). */
export const NOIR_SECTION_Y_SM = "py-12 md:py-16";
/** Standard vertical rhythm — most content sections. */
export const NOIR_SECTION_Y = "py-16 md:py-24";
/** Generous vertical rhythm — hero-adjacent / closing statement bands. */
export const NOIR_SECTION_Y_LG = "py-20 md:py-32";

/** Elevated band surface (composed dark band vs pure-black void). */
export const NOIR_BAND_CLASSES = "bg-[#0c0c0c]";

/** Card hover: hairline brighten + lift + faint red glow (subtle luxury). */
export const NOIR_CARD_HOVER_GLOW =
  "transition-all duration-300 hover:border-white/25 hover:-translate-y-1 hover:shadow-[0_18px_50px_-24px_rgba(232,17,45,0.45)]";

/** Small red over-line accent used above section headings. */
export const NOIR_ACCENT_LINE = "w-10 h-0.5 bg-[#E8112D]";

/** Condensed display font (Oswald) — variable defined in the scoped Noir CSS block. */
export const NOIR_DISPLAY_FONT_CLASSES =
  "[font-family:var(--noir-font-display)]";

/** Mono font (IBM Plex Mono) — variable defined in the scoped Noir CSS block. */
export const NOIR_MONO_FONT_CLASSES = "[font-family:var(--noir-font-mono)]";
