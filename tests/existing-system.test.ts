import { describe, it, expect } from "vitest";

describe("Existing system baseline", () => {
  it("should import the schema module without errors", async () => {
    const schema = await import("#root/shared/database/drizzle/schema.js");
    expect(schema).toBeDefined();
    expect(schema.user).toBeDefined();
    expect(schema.product).toBeDefined();
    expect(schema.order).toBeDefined();
  });

  it("should import the ServerError class", async () => {
    const { ServerError } = await import("#root/shared/error/server.js");
    expect(ServerError).toBeDefined();
    const err = new ServerError({ tag: "Test", message: "test error" });
    expect(err._tag).toBe("Test");
  });

  it("should import tRPC server utilities", async () => {
    const trpcServer = await import("#root/shared/trpc/server.js");
    expect(trpcServer.t).toBeDefined();
    expect(trpcServer.router).toBeDefined();
    expect(trpcServer.publicProcedure).toBeDefined();
    expect(trpcServer.protectedProcedure).toBeDefined();
    expect(trpcServer.adminProcedure).toBeDefined();
  });

  it(
    "should import the app router",
    async () => {
      // Cold-imports the entire backend transitively (every feature router) —
      // routinely exceeds vitest's 5s default under concurrent test-file load
      // even though it resolves in ~1-2s in isolation. Not a regression signal
      // on its own; only worth investigating if this climbs much further.
      const { appRouter } = await import("#root/shared/trpc/router.js");
      expect(appRouter).toBeDefined();
    },
    15000,
  );
});
