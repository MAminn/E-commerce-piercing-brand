import { t } from "#root/shared/trpc/server";
import { createOrderProcedure } from "./create-order/trpc";
import { deleteOrderProcedure } from "./delete-order/trpc";
import { orderStatsProcedure } from "./order-stats/trpc";
import { updateOrderStatusProcedure } from "./update-order-status/trpc";
import { viewOrdersProcedure } from "./view-orders/trpc";
import { editOrderProcedure } from "./edit-order/trpc";
import { bostaRouter } from "./bosta/trpc";
import { getOrderActivityProcedure } from "./get-order-activity/trpc";

export const orderRouter = t.router({
  view: viewOrdersProcedure,
  create: createOrderProcedure,
  updateStatus: updateOrderStatusProcedure,
  edit: editOrderProcedure,
  stats: orderStatsProcedure,
  delete: deleteOrderProcedure,
  bosta: bostaRouter,
  activity: getOrderActivityProcedure,
});
