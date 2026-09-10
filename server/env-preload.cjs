/**
 * Environment variable preload script.
 * Loaded via --require BEFORE any ESM modules are imported.
 *
 * Coolify (and some other PaaS) sometimes inject a leading '='
 * into environment variable values, e.g. NODE_ENV becomes "=production".
 * This breaks Node.js/React bundle selection which checks
 * process.env.NODE_ENV === "production" at module-load time.
 */
for (const key of Object.keys(process.env)) {
  const val = process.env[key];
  if (val && val.startsWith("=")) {
    process.env[key] = val.slice(1).trim();
  }
}
