import type { FastifyPluginAsync } from "fastify";

import { buildOrdersWorkbook, exportFileName, exportOrdersRequestSchema } from "./service";

/**
 * POST /api/admin/orders/export — the Orders page "Export" button.
 *
 * Body (JSON): { scope: "all" | "filtered", status?, dateFrom?, dateTo?,
 * paymentIssueOnly?, search?, dateLabel? }. Responds with the .xlsx file.
 *
 * A plain route rather than a tRPC procedure because the response is a
 * binary file stream. Admin/superadmin only. JSON-only body, so a cross-site
 * form cannot trigger it without a CORS preflight. Read-only: it never
 * writes to the database.
 */

/** Exports are heavy; more than this many at once get a 429. */
const MAX_CONCURRENT_EXPORTS = 2;
let running = 0;

export const ordersExportApiPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post("/export", async (request, reply) => {
    const session = request.clientSession;
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return reply.code(403).send({ success: false, error: "Admin access required" });
    }

    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return reply.code(415).send({ success: false, error: "Send the export options as JSON" });
    }

    const parsed = exportOrdersRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: "Invalid export options" });
    }

    if (running >= MAX_CONCURRENT_EXPORTS) {
      return reply
        .code(429)
        .send({ success: false, error: "Another export is still running. Try again in a moment." });
    }

    running++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        running--;
      }
    };

    const now = new Date();
    let built: Awaited<ReturnType<typeof buildOrdersWorkbook>>;
    try {
      built = await buildOrdersWorkbook(request.db, parsed.data, {
        generatedBy: session.name || session.email,
        now,
      });
    } catch (err) {
      release();
      request.log.error({ err, module: "orders-export" }, "Orders export failed");
      return reply.code(500).send({ success: false, error: "The export could not be generated. Please try again." });
    }

    const { workbook, summary } = built;
    const cleanup = () => {
      release();
      void workbook.dispose();
    };

    request.log.info(
      { module: "orders-export", userId: session.id, scope: parsed.data.scope, orders: summary.orders },
      "Orders export generated",
    );

    const archive = workbook.createArchive();
    archive.once("end", cleanup);
    archive.once("error", (err) => {
      request.log.error({ err, module: "orders-export" }, "Orders export stream failed");
      cleanup();
    });
    reply.raw.once("close", cleanup);

    return reply
      .code(200)
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${exportFileName(parsed.data.scope, now)}"`)
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Export-Order-Count", String(summary.orders))
      .header("X-Export-Item-Count", String(summary.items))
      .send(archive);
  });
};
