import { Console, Effect, pipe } from "effect";
import type { ServerError } from "../error/server";

export const runBackendEffect = <A, E extends ServerError<string>>(
  effect: Effect.Effect<A, E>
) =>
  pipe(
    effect,
    Effect.map(
      (result) =>
        ({
          success: true,
          result,
        } as const)
    ),
    Effect.catchAll((error) =>
      Effect.succeed({ success: false, error } as const).pipe(
        Effect.tap(() => Console.log(error))
      )
    ),
    Effect.runPromise
  );

export const serializeBackendEffectResult = <A, E extends ServerError<string>>(
  result: Awaited<ReturnType<typeof runBackendEffect<A, E>>>
) => {
  if (result.success) {
    return result;
  }

  return {
    success: false,
    error: result.error.clientMessage,
  } as const;
};
