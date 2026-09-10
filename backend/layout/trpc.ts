import { z } from "zod";
import {
  publicProcedure,
  adminProcedure,
  router,
} from "#root/shared/trpc/server";
import { getLayoutSettings } from "./get-layout-settings";
import { updateLayoutSettings } from "./update-layout-settings";
import { uploadLayoutImage } from "./upload-layout-image";
import { Effect } from "effect";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const NavigationLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  labelAr: z.string().optional(),
  url: z.string(),
  openInNewTab: z.boolean().optional(),
  isDropdown: z.boolean().optional(),
  categoryIds: z.array(z.string()).optional(),
});

const SocialLinkSchema = z.object({
  id: z.string(),
  platform: z.enum([
    "facebook",
    "instagram",
    "tiktok",
    "twitter",
    "youtube",
    "pinterest",
    "linkedin",
  ]),
  url: z.string(),
});

const FooterLinkGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleAr: z.string().optional(),
  links: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      labelAr: z.string().optional(),
      url: z.string(),
    }),
  ),
});

const LogoSizeSchema = z.object({
  desktopWidth: z.number().min(20).max(600),
  desktopMaxHeight: z.number().min(16).max(200),
  mobileWidth: z.number().min(20).max(400),
  mobileMaxHeight: z.number().min(16).max(120),
});

const LayoutSettingsSchema = z.object({
  siteTitle: z.string().optional(),
  faviconUrl: z.string().optional(),
  shareImageUrl: z.string().optional(),
  translationOverrides: z.object({
    en: z.record(z.string(), z.string()).optional(),
    ar: z.record(z.string(), z.string()).optional(),
  }).optional(),
  header: z.object({
    logoUrl: z.string(),
    logoSize: LogoSizeSchema,
    logoText: z.string(),
    tagline: z.string(),
    announcementBarEnabled: z.boolean(),
    announcementBarText: z.string(),
    marqueeEnabled: z.boolean().optional(),
    marqueeText: z.string().optional(),
    marqueeTextAr: z.string().optional(),
    marqueeBackgroundColor: z.string().optional(),
    marqueeTextColor: z.string().optional(),
    promoText: z.string().optional(),
    promoTextAr: z.string().optional(),
    contactEmail: z.string().optional(),
    navigationLinks: z.array(NavigationLinkSchema),
    navbarStyle: z.enum(["default", "editorial", "minimal"]),
  }),
  footer: z.object({
    logoUrl: z.string(),
    logoText: z.string(),
    logoTextAr: z.string().optional(),
    logoSize: LogoSizeSchema,
    description: z.string(),
    descriptionAr: z.string().optional(),
    copyright: z.string(),
    copyrightAr: z.string().optional(),
    showNewsletter: z.boolean(),
    footerStyle: z.enum(["default", "editorial"]),
    footerLinkGroups: z.array(FooterLinkGroupSchema),
    socialLinks: z.array(SocialLinkSchema),
    contactPhone: z.string().optional(),
    contactEmail: z.string().optional(),
  }),
});

// ─── Router ──────────────────────────────────────────────────────────────────

export const layoutRouter = router({
  getSettings: publicProcedure
    .input(z.object({ merchantId: z.string().uuid(), templateId: z.string().optional() }))
    .query(async ({ input }) => {
      const settings = await getLayoutSettings(input.merchantId, input.templateId);
      return { success: true, result: settings };
    }),

  updateSettings: adminProcedure
    .input(
      z.object({
        merchantId: z.string().uuid(),
        templateId: z.string().optional(),
        content: LayoutSettingsSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const settings = await updateLayoutSettings(
        input.merchantId,
        input.content,
        input.templateId,
      );
      return { success: true, result: settings };
    }),

  uploadImage: adminProcedure
    .input(
      z.object({
        file: z.object({
          name: z.string(),
          type: z.string(),
          buffer: z.instanceof(Uint8Array),
        }),
        prefix: z.enum(["header-logo", "footer-logo", "favicon", "share-image", "popup", "email-logo"]),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await Effect.runPromise(
          uploadLayoutImage({
            buffer: input.file.buffer,
            mimeType: input.file.type,
            prefix: input.prefix,
          }),
        );
        return { success: true as const, data: result };
      } catch (error) {
        console.error("Layout image upload error:", error);
        return {
          success: false as const,
          error:
            error instanceof Error ? error.message : "Failed to upload image",
        };
      }
    }),
});
