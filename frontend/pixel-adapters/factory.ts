import { PixelPlatform } from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";
import { MetaPixelAdapter } from "./meta-pixel-adapter";
import { GoogleGA4Adapter } from "./google-ga4-adapter";
import { TikTokPixelAdapter } from "./tiktok-pixel-adapter";
import { SnapchatPixelAdapter } from "./snapchat-pixel-adapter";
import { PinterestTagAdapter } from "./pinterest-tag-adapter";
import { ClarityAdapter } from "./clarity-adapter";

/**
 * Creates the appropriate adapter instance for a given platform.
 * Returns undefined for platforms that don't have an adapter yet.
 */
export function createAdapterForPlatform(
  platform: PixelPlatform,
): PixelAdapter | undefined {
  switch (platform) {
    case PixelPlatform.META:
      return new MetaPixelAdapter();
    case PixelPlatform.GOOGLE_GA4:
      return new GoogleGA4Adapter();
    case PixelPlatform.TIKTOK:
      return new TikTokPixelAdapter();
    case PixelPlatform.SNAPCHAT:
      return new SnapchatPixelAdapter();
    case PixelPlatform.PINTEREST:
      return new PinterestTagAdapter();
    case PixelPlatform.CLARITY:
      return new ClarityAdapter();
    case PixelPlatform.CUSTOM:
      return undefined;
    default:
      return undefined;
  }
}
