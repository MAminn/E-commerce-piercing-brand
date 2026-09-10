import { Effect } from "effect";
import { validateSessionToken } from "../session";

export const me = (token: string) =>
  Effect.gen(function* ($) {
    const clientSession = yield* $(validateSessionToken(token));

    return clientSession;
  });
