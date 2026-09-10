/**
 * Replaces `[Label]` placeholders — e.g. `[Discount Code]` or its Arabic
 * label `[كود الخصم]` — with the matching entry from `tokens` (keyed by the
 * exact label text, see render.ts). Deliberately not `{{camelCase}}`: this
 * is meant to be typed and read by non-technical admins directly, no syntax
 * to learn. Unmatched labels are left as-is rather than silently blanked,
 * so a typo or a genuinely missing value is visible/debuggable instead of
 * producing "Hi ," in a live email.
 */
export function substituteTokens(
  text: string,
  tokens: Record<string, string>,
): string {
  return text.replace(/\[([^[\]]+)\]/g, (match, label: string) => {
    const key = label.trim();
    return key in tokens ? tokens[key]! : match;
  });
}
