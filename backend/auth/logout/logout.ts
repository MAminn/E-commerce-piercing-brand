import { Effect } from "effect";
import { invalidateSessionByHash, validateSessionToken } from "../session";

export const logout = (token: string) =>
  Effect.gen(function* ($) {
    const clientSession = yield* $(validateSessionToken(token));

    // clientSession.token is the *hashed* token from the DB.
    // Use invalidateSessionByHash so it is NOT hashed a second time.
    yield* $(invalidateSessionByHash(clientSession.token));

    return clientSession;
  });
