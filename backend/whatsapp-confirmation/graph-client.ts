/**
 * Minimal Cloud API sender. One request per call, bounded by a timeout.
 * Never logs the token, the recipient or the body.
 *
 * Outcome classes (see classifyGraphError):
 *   sent       — 2xx with a message id
 *   retry      — transient: network error before the request was accepted
 *                (connection refused / DNS), HTTP 5xx, throttling codes
 *   permanent  — will not succeed by retrying (bad number, template problem,
 *                auth/permission, invalid parameter)
 *   ambiguous  — the request may have reached Meta (timeout / reset after
 *                send). NEVER retried automatically: a retry could deliver a
 *                second confirmation. Meta echoes `biz_opaque_callback_data`
 *                in status webhooks, which lets the webhook recover the wamid.
 */

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  status: number;
  text: () => Promise<string>;
}>;

export type SendOutcome =
  | { kind: "sent"; wamid: string }
  | { kind: "retry"; code: string; message: string }
  | { kind: "permanent"; code: string; message: string }
  | { kind: "ambiguous"; code: string; message: string };

/**
 * Meta error codes that are worth retrying with backoff. Verify against
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
 * when changing this list.
 */
export const RETRYABLE_CODES = new Set(["1", "2", "4", "17", "341", "80007", "130429", "131000", "131016", "131056", "133004"]);

export function classifyGraphError(httpStatus: number, code: string | null): "retry" | "permanent" {
  if (code && RETRYABLE_CODES.has(code)) return "retry";
  if (httpStatus >= 500) return "retry";
  if (httpStatus === 429) return "retry";
  return "permanent";
}

export interface GraphSendConfig {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  timeoutMs?: number;
}

export async function sendGraphMessage(cfg: GraphSendConfig, body: Record<string, unknown>, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<SendOutcome> {
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 15_000);
  let status: number;
  let text: string;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } };
    const code = e.cause?.code ?? e.code ?? e.name ?? "network";
    // Failed before any byte left (DNS / refused): safe to retry.
    if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "EAI_AGAIN") {
      return { kind: "retry", code, message: "network error before send" };
    }
    return { kind: "ambiguous", code, message: "no response from Graph API (timeout or connection lost)" };
  } finally {
    clearTimeout(timer);
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (status >= 200 && status < 300) {
    const messages = Array.isArray(json?.messages) ? (json?.messages as Array<{ id?: string }>) : [];
    const wamid = messages[0]?.id;
    if (wamid) return { kind: "sent", wamid };
    return { kind: "ambiguous", code: String(status), message: "2xx without a message id" };
  }
  const error = (json?.error ?? {}) as { code?: number | string; message?: string; error_data?: { details?: string } };
  const code = error.code !== undefined ? String(error.code) : String(status);
  const message = `${error.message ?? "Graph API error"}${error.error_data?.details ? ` — ${error.error_data.details}` : ""}`.slice(0, 300);
  return { kind: classifyGraphError(status, error.code !== undefined ? String(error.code) : null), code, message };
}
