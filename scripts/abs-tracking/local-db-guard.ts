/**
 * Local-only guard for the ABS tracking scripts: DATABASE_URL must point at
 * localhost / 127.0.0.1 / ::1 or the docker-compose service name `postgres`,
 * unless --i-know-this-is-not-local is passed. Prints the host only, never
 * the credentials.
 */
export const NOT_LOCAL_FLAG = "--i-know-this-is-not-local";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

export function requireLocalDatabase(argv: string[], env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (point it at a local / docker Postgres).");
    process.exit(2);
  }
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("DATABASE_URL is not a valid URL.");
    process.exit(2);
  }
  if (!LOCAL_HOSTS.has(host.toLowerCase()) && !argv.includes(NOT_LOCAL_FLAG)) {
    console.error(`Refusing to run: DATABASE_URL host "${host}" is not local. These tools are for local databases only.`);
    process.exit(2);
  }
  return url;
}
