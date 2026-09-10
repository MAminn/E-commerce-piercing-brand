import { z } from "zod";
import { Effect } from "effect";
import { adminProcedure, provideDatabase, router } from "#root/shared/trpc/server";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { uploadFontFile } from "./font-upload";
import {
  listCustomFonts,
  addCustomFontFile,
  deleteCustomFontFileById,
  getTypographySettings,
  updateTypographySettings,
} from "./service";

const typographyRoleKeys = [
  "heading",
  "body",
  "buttons",
  "nav",
  "productTitle",
  "price",
  "formInput",
] as const;

const roleAssignmentSchema = z
  .object({
    familyName: z.string().min(1),
    weight: z.number().int().min(100).max(900),
  })
  .nullable();

const typographySettingsSchema = z.object({
  roles: z.object(
    Object.fromEntries(typographyRoleKeys.map((key) => [key, roleAssignmentSchema])) as Record<
      (typeof typographyRoleKeys)[number],
      typeof roleAssignmentSchema
    >,
  ),
});

export const typographyRouter = router({
  listFonts: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(listCustomFonts().pipe(provideDatabase(ctx))).then(
      serializeBackendEffectResult,
    );
  }),

  uploadFontFile: adminProcedure
    .input(
      z.object({
        file: z.object({
          name: z.string(),
          type: z.string(),
          buffer: z.instanceof(Uint8Array),
        }),
        familyName: z.string().min(1).max(60),
        weight: z.number().int().min(100).max(900),
        style: z.enum(["normal", "italic"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        Effect.gen(function* ($) {
          const uploaded = yield* $(
            uploadFontFile({
              buffer: input.file.buffer,
              filename: input.file.name,
              familyName: input.familyName,
              weight: input.weight,
              style: input.style,
            }),
          );
          return yield* $(
            addCustomFontFile({
              familyName: input.familyName,
              weight: input.weight,
              style: input.style,
              fileUrl: uploaded.fileUrl,
              format: uploaded.format,
            }),
          );
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  deleteFontFile: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        deleteCustomFontFileById(input.id).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  getSettings: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getTypographySettings().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  updateSettings: adminProcedure
    .input(typographySettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return runBackendEffect(
        updateTypographySettings(input).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
