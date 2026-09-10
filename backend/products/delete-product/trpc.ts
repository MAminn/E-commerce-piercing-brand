import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { deleteProduct, deleteProductSchema } from "./service";

export const deleteProductProcedure = adminProcedure
	.input(deleteProductSchema)
	.mutation(async ({ ctx, input }) => {
		return await runBackendEffect(
			deleteProduct(input, ctx.clientSession).pipe(provideDatabase(ctx)),
		).then(serializeBackendEffectResult);
	});
