import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, adminProcedure } from "#root/shared/trpc/server";
import { editCategory, editCategorySchema } from "./service";

export const editCategoryProcedure = adminProcedure
	.input(editCategorySchema)
	.mutation(async ({ ctx, input }) => {
		return await runBackendEffect(
			editCategory(input, ctx.clientSession).pipe(provideDatabase(ctx)),
		).then(serializeBackendEffectResult);
	});
