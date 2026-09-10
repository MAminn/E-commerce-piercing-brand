import type { TypographySettings } from "#root/shared/database/drizzle/schema";

/** Every role starts unset — the site keeps its current built-in fonts until the admin explicitly assigns something. */
export const DEFAULT_TYPOGRAPHY_SETTINGS: TypographySettings = {
  roles: {
    heading: null,
    body: null,
    buttons: null,
    nav: null,
    productTitle: null,
    price: null,
    formInput: null,
  },
};
