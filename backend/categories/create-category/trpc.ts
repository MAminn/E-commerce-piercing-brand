import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { createCategory, createCategorySchema } from "./create-category";

export const createCategoryProcedure = adminProcedure
	.input(createCategorySchema)
	.mutation(async ({ ctx, input }) => {
		return await runBackendEffect(
			createCategory(input, ctx.clientSession).pipe(provideDatabase(ctx)),
		).then(serializeBackendEffectResult);
	});
