import { t } from "#root/shared/trpc/server";
import { createPromoCodeProcedure } from "./create-promo-code/trpc";
import {
  viewPromoCodesProcedure,
  getPromoCodeByIdProcedure,
} from "./view-promo-codes/trpc";
import { updatePromoCodeProcedure } from "./update-promo-code/trpc";
import { deletePromoCodeProcedure } from "./delete-promo-code/trpc";
import { validatePromoCodeProcedure } from "./validate-promo-code/trpc";
import { listPublicPromoCodesProcedure } from "./list-public/trpc";

export const promoCodesRouter = t.router({
  create: createPromoCodeProcedure,
  list: viewPromoCodesProcedure,
  listPublic: listPublicPromoCodesProcedure,
  getById: getPromoCodeByIdProcedure,
  update: updatePromoCodeProcedure,
  delete: deletePromoCodeProcedure,
  validate: validatePromoCodeProcedure,
});
