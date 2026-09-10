import type { FastifyInstance } from "fastify";
import { type EmailServiceInterface } from "./service";
import { createEmailServiceFromEnv } from "./from-env";
import fp from "fastify-plugin";

declare module "fastify" {
  export interface FastifyRequest {
    emailService: EmailServiceInterface;
  }
}

export const emailServiceMiddleware = fp(async (app: FastifyInstance) => {
  const emailService = await createEmailServiceFromEnv(app.log);

  app.decorateRequest("emailService", {
    getter() {
      return emailService;
    },
  });
});
