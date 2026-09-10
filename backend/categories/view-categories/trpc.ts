import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { viewCategories } from "./service.js";

export const viewCategoriesProcedure = publicProcedure.query(
	async ({ ctx }) => {
		return await runBackendEffect(
			viewCategories().pipe(provideDatabase(ctx)),
		).then(serializeBackendEffectResult);
	},
);
