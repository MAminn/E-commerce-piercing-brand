import { initTRPC, TRPCError } from "@trpc/server";
import {
	DatabaseClientService,
	type DatabaseClient,
} from "#root/shared/database/drizzle/db.js";
import { Effect } from "effect";
import superjson from "superjson";
import type { Context } from "./context.server";
import { ServerError } from "#root/shared/error/server.js";

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
export const t = initTRPC.context<Context>().create({
	transformer: superjson,
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires logged-in user
 * Blocks guest users
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.clientSession) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You must be logged in to access this resource",
		});
	}
	return next({
		ctx: {
			...ctx,
			clientSession: ctx.clientSession,
		},
	});
});

/**
 * Admin procedure - requires admin role (superadmin also passes: it's a superset of admin)
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (ctx.clientSession.role !== "admin" && ctx.clientSession.role !== "superadmin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Admin access required",
		});
	}
	return next({
		ctx: {
			...ctx,
			clientSession: ctx.clientSession,
		},
	});
});

/**
 * Superadmin procedure - requires the superadmin role specifically.
 * Reserved for the hidden prod->dev environment-sync tooling; regular
 * admins (even ones with full dashboard access) do not pass this gate.
 */
export const superadminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (ctx.clientSession.role !== "superadmin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Superadmin access required",
		});
	}
	return next({
		ctx: {
			...ctx,
			clientSession: ctx.clientSession,
		},
	});
});

export const provideDatabase = (ctx: { db: DatabaseClient }) =>
	Effect.provideService(DatabaseClientService, ctx.db);
