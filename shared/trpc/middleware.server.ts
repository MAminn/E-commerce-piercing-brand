import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { createContext } from "./context.server.js";
import { appRouter, type AppRouter } from "./router.js";
import fp from "fastify-plugin";

export const fastifyTRPCMiddleware = fp((app) => {
  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    maxBodySize: 100 * 1024 * 1024, // 100MB max request size
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        // Safe error logging - avoid circular references and undefined properties
        const errorInfo = {
          path,
          message: error.message,
          code: error.code,
          cause: error.cause ? String(error.cause) : undefined,
          stack: error.stack?.split("\n").slice(0, 5).join("\n"), // First 5 lines of stack
        };
        console.error("[tRPC Error]", JSON.stringify(errorInfo, null, 2));
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });
});
