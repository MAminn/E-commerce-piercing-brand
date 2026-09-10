import { query } from "#root/shared/database/drizzle/db";
import { file } from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { z } from "zod";

export const createFileSchema = z.object({
	diskname: z.string().nonempty(),
});

export const createFile = (data: z.infer<typeof createFileSchema>) =>
	Effect.gen(function* ($) {
		return yield* $(
			query(async (db) => {
				return await db
					.insert(file)
					.values({
						diskname: data.diskname,
					})
					.returning()
					.then((data) => data[0]);
			}),
		);
	});
