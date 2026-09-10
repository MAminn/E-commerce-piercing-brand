import vikeReact from "vike-react/config";
import type { Config } from "vike/types";
import Layout from "../layouts/LayoutDefault.js";
import { STORE_NAME, STORE_DESCRIPTION } from "#root/shared/config/branding";

// Default config (can be overridden by pages)
// https://vike.dev/config

export default {
  // https://vike.dev/Layout
  Layout,

  // https://vike.dev/head-tags
  // title is handled dynamically by +title.ts (reads from layout settings)
  description: STORE_DESCRIPTION,

  extends: vikeReact,

  // Enable pre-rendering for better performance
  // Using the new format required by Vike
  clientRouting: true,
  hydrationCanBeAborted: true,

  // Pass client session, pixel configs, and template selection to the client side
  passToClient: [
    "clientSession",
    "templateSelection",
    "layoutSettingsData",
    "brandName",
    "ssrLocale",
    "typographySettings",
    "customFonts",
    "activeGA4PixelId",
  ],
} satisfies Config;
