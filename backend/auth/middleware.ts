import { auth } from "./auth.server.js";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { ClientSession } from "./shared/entities";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    clientSession?: ClientSession | undefined;
  }
}

export const authFasitfyMiddleware = fp((app: FastifyInstance) => {
  app.decorateRequest("clientSession", undefined);
  app.addHook("onRequest", async (req) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.raw.headers),
      });

      if (!session || !session.user) {
        req.clientSession = undefined;
        return;
      }

      const user = session.user as typeof session.user & {
        phone?: string;
        role?: string;
        profilePicture?: string | null;
      };

      req.clientSession = {
        id: user.id,
        token: session.session.token,
        email: user.email,
        name: user.name,
        phone: user.phone ?? "",
        expiresAt: session.session.expiresAt,
        role: (user.role as "admin" | "vendor" | "user" | "superadmin") ?? "user",
        emailVerified: user.emailVerified,
        profilePicture: user.profilePicture ?? user.image,
      };
    } catch {
      req.clientSession = undefined;
    }
  });
});
