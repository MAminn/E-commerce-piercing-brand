/**
 * One HTTP attempt to GA4 Measurement Protocol, classified for the outbox.
 * No retry loop here — retries are the outbox's job (durable, backed off,
 * survive restarts), never the request path.
 *
 *   sent      — 2xx: GA4 accepted the request
 *   retry     — 429 / 5xx, or a connection that never reached Google
 *               (refused, DNS): safe to resend
 *   ambiguous — timeout or connection dropped mid-request: GA4 MAY have
 *               the event; resending risks a duplicate (see README)
 *   permanent — any other 4xx: resending the same body cannot succeed
 *
 * The api_secret is in the URL; nothing here logs or returns the URL, and
 * any error text is scrubbed of the secret before it is stored.
 */

export const GA4_MP_COLLECT_URL = "https://www.google-analytics.com/mp/collect";
export const GA4_MP_TIMEOUT_MS = 10_000;

export type SendOutcome =
  | { kind: "sent"; statusCode: number }
  | { kind: "retry"; statusCode?: number; error: string }
  | { kind: "ambiguous"; error: string }
  | { kind: "permanent"; statusCode: number; error: string };

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; ok: boolean }>;

const NEVER_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

function scrub(text: string, secret: string): string {
  const t = text.slice(0, 200);
  return secret ? t.split(secret).join("***") : t;
}

export async function sendPurchaseToGa4(
  body: unknown,
  cfg: { measurementId: string; apiSecret: string },
  deps: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<SendOutcome> {
  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const url = `${GA4_MP_COLLECT_URL}?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? GA4_MP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 300) return { kind: "sent", statusCode: res.status };
    if (res.status === 429 || res.status >= 500) return { kind: "retry", statusCode: res.status, error: `http_${res.status}` };
    return { kind: "permanent", statusCode: res.status, error: `http_${res.status}` };
  } catch (err) {
    if (controller.signal.aborted) return { kind: "ambiguous", error: "timeout" };
    const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code ?? (err as { code?: string })?.code;
    if (code && NEVER_CONNECTED.has(code)) return { kind: "retry", error: `network_${code}` };
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "ambiguous", error: scrub(`network_${code ?? "error"}: ${message}`, cfg.apiSecret) };
  } finally {
    clearTimeout(timer);
  }
}
