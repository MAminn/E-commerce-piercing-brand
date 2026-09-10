import "dotenv/config";
import { Hono } from "hono";
import { vikeHonoMiddleware } from "./server/vike-handler";
import { dbHonoMiddleware } from "./shared/database/middleware";
import { trpcHonoMiddleware } from "./shared/trpc/middleware";

const app = new Hono();

app.use(dbHonoMiddleware);

app.use("/api/trpc/*", trpcHonoMiddleware({ endpoint: "/api/trpc" }));

app.all("*", vikeHonoMiddleware);

export default app;
