import type { user, session } from "#root/shared/database/drizzle/schema.js";

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type NewSession = typeof session.$inferInsert;
