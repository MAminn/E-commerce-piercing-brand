import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";

export const getAdminOverviewSchema = z.object({});

export const getAdminOverview = (
	_input: z.infer<typeof getAdminOverviewSchema>,
	session?: ClientSession,
) =>
	Effect.gen(function* ($) {
		if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
			return yield* $(
				Effect.fail(
					new ServerError({
						tag: "Unauthorized",
						statusCode: 401,
						clientMessage: "Unauthorized",
					}),
				),
			);
		}
		return yield* $(
			query(async (db) => {
				// Single-shop mode: No vendor metrics
				return {
					vendors: {
						total: 0,
						new: 0,
						pending: 0,
					},
				};
			}),
		);
	});
