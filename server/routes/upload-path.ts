import path from "node:path";

/**
 * Resolves a requested `/uploads/*` path to a file inside `uploadsRoot`, or
 * null when it would escape it.
 *
 * The router hands over the wildcard already URL-decoded, so `%2e%2e%2f`
 * arrives as `../`; resolving and then checking containment catches every
 * spelling of traversal (`..`, encoded slashes, backslashes on Windows)
 * instead of trying to blacklist them. Dot-segments (`.env`, the hero video
 * upload's `.upload-*.tmp`) are never served: nothing public is stored under
 * a dot name.
 */
export function resolveUploadPath(uploadsRoot: string, requested: string): string | null {
  if (!requested || requested.includes("\0")) return null;
  const segments = requested.split(/[\\/]+/);
  if (segments.some((s) => s.startsWith("."))) return null;

  const root = path.resolve(uploadsRoot);
  const full = path.resolve(root, requested);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}
