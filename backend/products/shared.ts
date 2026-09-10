import { z } from "zod";
import type { createProductSchema } from "./create-product/service";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";

/** Fragrance details shown on the product page (character, longevity, when to wear, notes) */
export const fragranceInfoSchema = z
  .object({
    tagline: z.string().max(200).optional(),
    taglineAr: z.string().max(200).optional(),
    about: z.string().max(1000).optional(),
    aboutAr: z.string().max(1000).optional(),
    longevity: z.string().max(200).optional(),
    longevityAr: z.string().max(200).optional(),
    whenToUse: z.string().max(200).optional(),
    whenToUseAr: z.string().max(200).optional(),
    concentration: z.string().max(50).optional(),
    scentIntensity: z.string().max(50).optional(),
    scentIntensityAr: z.string().max(50).optional(),
    gender: z.string().max(50).optional(),
    genderAr: z.string().max(50).optional(),
    topNotes: z.string().max(300).optional(),
    topNotesAr: z.string().max(300).optional(),
    middleNotes: z.string().max(300).optional(),
    middleNotesAr: z.string().max(300).optional(),
    baseNotes: z.string().max(300).optional(),
    baseNotesAr: z.string().max(300).optional(),
    ingredients: z.string().max(1500).optional(),
    ingredientsAr: z.string().max(1500).optional(),
    badges: z.array(z.string().max(50)).max(10).optional(),
  })
  .optional();

export const validateProductRules = (
  data: z.infer<typeof createProductSchema>
) =>
  Effect.gen(function* ($) {
    const { variants } = data;

    // Early return if variants is undefined or empty array
    if (!variants || variants.length === 0) return;

    // Check for duplicated variant names
    const variantNames = variants.map((variant) => variant.name);
    const variantNamesSet = new Set();

    for (const name of variantNames) {
      if (variantNamesSet.has(name)) {
        return yield* $(
          Effect.fail(
            new ServerError({
              tag: "DuplicatedVariantName",
              statusCode: 400,
              clientMessage: `Duplicated variant name: ${name}`,
            })
          )
        );
      }
      variantNamesSet.add(name);
    }

    // Check for duplicated variant values
    for (const variant of variants) {
      const variantValues = variant.values;

      if (variantValues.length === 0) {
        return yield* $(
          Effect.fail(
            new ServerError({
              tag: "MissingVariantValues",
              statusCode: 400,
              clientMessage: `Missing variant values for variant: ${variant.name}`,
            })
          )
        );
      }

      const variantValuesSet = new Set();

      for (const value of variantValues) {
        if (variantValuesSet.has(value)) {
          return yield* $(
            Effect.fail(
              new ServerError({
                tag: "DuplicatedVariantValue",
                statusCode: 400,
                clientMessage: `Duplicated variant value: ${value}, in variant ${variant.name}`,
              })
            )
          );
        }
        variantValuesSet.add(value);
      }
    }
  });
