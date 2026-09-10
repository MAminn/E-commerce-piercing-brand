import { ServerError } from "#root/shared/error/server.js";
import { hash } from "@node-rs/argon2";
import { Effect } from "effect";

export const hashPassword = (password: string) =>
  Effect.tryPromise({
    try: async () => await hash(password),
    catch: (err) =>
      new ServerError({
        tag: "HashPasswordError",
        cause: err,
      }),
  });
