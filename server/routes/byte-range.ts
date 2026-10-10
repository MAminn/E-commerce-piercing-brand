export type ByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

/**
 * Parses a single-range `Range: bytes=…` header against a file of `size` bytes
 * (RFC 9110 §14.1.2). Multi-range and malformed headers fall back to the full
 * file, which is always a valid response; a well-formed range that starts past
 * the end of the file is unsatisfiable (416).
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange {
  if (!header) return { kind: "full" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "full" };
  const [, rawStart = "", rawEnd = ""] = match;
  if (!rawStart && !rawEnd) return { kind: "full" };

  // Suffix range: the last N bytes.
  if (!rawStart) {
    const length = Number(rawEnd);
    if (length === 0) return { kind: "unsatisfiable" };
    if (size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return { kind: "unsatisfiable" };
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (end < start) return { kind: "full" };
  return { kind: "partial", start, end };
}
