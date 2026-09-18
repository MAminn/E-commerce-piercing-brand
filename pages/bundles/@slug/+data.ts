import type { PageContext } from "vike/types";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { bundleCampaign } from "#root/shared/database/drizzle/schema";

export type Data = {
  /** Live campaign title/description for <title> and meta — null when not live/unknown. */
  campaign: { title: string; description: string | null } | null;
};

/**
 * SSR-only lookup so the document title can name the campaign. Mirrors the
 * liveness rule in backend/bundles/service.ts (active + inside the window);
 * the page body still loads through the public tRPC procedure.
 */
export const data = async (ctx: PageContext): Promise<Data> => {
  const slug = String(ctx.routeParams?.slug ?? "");
  if (!slug) return { campaign: null };
  try {
    const now = new Date();
    const [row] = await ctx.db
      .select({ title: bundleCampaign.title, description: bundleCampaign.description })
      .from(bundleCampaign)
      .where(
        and(
          eq(bundleCampaign.slug, slug),
          eq(bundleCampaign.isActive, true),
          or(isNull(bundleCampaign.startsAt), lte(bundleCampaign.startsAt, now)),
          or(isNull(bundleCampaign.endsAt), gte(bundleCampaign.endsAt, now)),
        ),
      )
      .limit(1);
    return { campaign: row ?? null };
  } catch {
    return { campaign: null };
  }
};
