import {
	runBackendEffect,
	serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { createProduct, createProductSchema } from "./service";

export const createProductProcedure = adminProcedure
	.input(createProductSchema)
	.mutation(async ({ ctx, input }) => {
		return await runBackendEffect(
			createProduct(input, ctx.clientSession).pipe(provideDatabase(ctx)),
		).then(serializeBackendEffectResult);
	});
