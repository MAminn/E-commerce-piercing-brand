import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { deleteCategory, deleteCategorySchema } from "./service";

export const deleteCategoryProcedure = adminProcedure
	.input(deleteCategorySchema)
	.mutation(async ({ ctx, input }) => {
		return await runBackendEffect(
			deleteCategory(input, ctx.clientSession).pipe(provideDatabase(ctx)),
		).then(serializeBackendEffectResult);
	});
