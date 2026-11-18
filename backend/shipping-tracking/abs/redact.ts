/**
 * Every string that can reach a log line or abs_sync_run.error goes through
 * here: the API key (by value and by header shape) becomes `***`, and any run
 * of 7+ digits (a phone number) keeps only its last 4 digits.
 */
export function redact(text: unknown, secrets: Array<string | null | undefined> = [], maxLength = 500): string {
  let out = text instanceof Error ? text.message : typeof text === "string" ? text : safeStringify(text);
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("***");
  }
  out = out
    // Drizzle's "Failed query: … params: …" carries row values (names, raw rows): never keep them.
    .replace(/\bparams:[\s\S]*$/i, "params: [redacted]")
    .replace(/(x-api-key["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, "$1***")
    .replace(/(authorization["']?\s*[:=]\s*["']?)[^"',;}]+/gi, "$1***")
    .replace(/\+?\d[\d ]{5,}\d/g, (run) => {
      const digits = run.replace(/\D/g, "");
      return digits.length >= 7 ? `***${digits.slice(-4)}` : run;
    });
  return out.length > maxLength ? `${out.slice(0, maxLength - 1)}…` : out;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
