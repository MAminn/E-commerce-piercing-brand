import { t } from "#root/shared/trpc/server";
import { createCategoryProcedure } from "./create-category/trpc";
import { deleteCategoryProcedure } from "./delete-category/trpc";
import { editCategoryProcedure } from "./edit-category/trpc";
import { viewCategoriesProcedure } from "./view-categories/trpc";
import { viewMainCategoriesProcedure } from "./view-main-categories/trpc";
import { getCategoryContentProcedure } from "./get-category-content/trpc";
import { updateCategoryContentProcedure } from "./update-category-content/trpc";
import {
  createMainCategoryProcedure,
  renameMainCategoryProcedure,
  deleteMainCategoryProcedure,
  toggleCategoryLandingProcedure,
} from "./main-category-crud/trpc";
import {
  reorderCategoriesProcedure,
  setCategoryVisibilityProcedure,
  viewCategoryAdminTreeProcedure,
} from "./category-admin/trpc";
import {
  assignProductsProcedure,
  listCategoryProductsProcedure,
  moveProductsProcedure,
  removeProductsProcedure,
} from "./subcategory-products/trpc";

export const categoriesRouter = t.router({
  create: createCategoryProcedure,
  view: viewCategoriesProcedure,
  viewMain: viewMainCategoriesProcedure,
  delete: deleteCategoryProcedure,
  edit: editCategoryProcedure,
  getContent: getCategoryContentProcedure,
  updateContent: updateCategoryContentProcedure,
  // Main category CRUD (admin-only)
  createMain: createMainCategoryProcedure,
  renameMain: renameMainCategoryProcedure,
  deleteMain: deleteMainCategoryProcedure,
  toggleLanding: toggleCategoryLandingProcedure,
  // Hierarchy management + bulk product assignment (admin-only)
  adminTree: viewCategoryAdminTreeProcedure,
  reorder: reorderCategoriesProcedure,
  setVisibility: setCategoryVisibilityProcedure,
  products: listCategoryProductsProcedure,
  assignProducts: assignProductsProcedure,
  removeProducts: removeProductsProcedure,
  moveProducts: moveProductsProcedure,
});
