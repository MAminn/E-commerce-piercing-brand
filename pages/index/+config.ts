import type { Config } from "vike/types";

// Index page specific config
// Pre-rendering is disabled because +data.ts requires database access (ctx.db)
// for SSR CMS content injection — the DB isn't available at build time.
export default {
  prerender: false,
} satisfies Config;
