import { viewCategories } from "#root/backend/categories/view-categories/service";
import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { DatabaseClientService } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import type { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
	const categoryType = "men";

	const fetchSubcategories = await runBackendEffect(
		viewCategories().pipe(Effect.provideService(DatabaseClientService, ctx.db)),
	).then(serializeBackendEffectResult);

	if (!fetchSubcategories.success) {
		return fetchSubcategories;
	}

	const subcategories = fetchSubcategories.result.filter(
		(s) => s.type === categoryType,
	);

	return {
		success: true,
		categoryType,
		subcategories,
	} as const;
};

export type Data = Awaited<ReturnType<typeof data>>;
