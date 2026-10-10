import { describe, expect, it } from "vitest";
import { parseByteRange } from "../byte-range";

describe("parseByteRange", () => {
  const size = 1000;

  it("serves the full file without a Range header", () => {
    expect(parseByteRange(undefined, size)).toEqual({ kind: "full" });
  });

  it("parses the open-ended probe Safari sends first", () => {
    expect(parseByteRange("bytes=0-1", size)).toEqual({ kind: "partial", start: 0, end: 1 });
    expect(parseByteRange("bytes=0-", size)).toEqual({ kind: "partial", start: 0, end: 999 });
  });

  it("clamps an end past the file and handles suffix ranges", () => {
    expect(parseByteRange("bytes=500-5000", size)).toEqual({ kind: "partial", start: 500, end: 999 });
    expect(parseByteRange("bytes=-100", size)).toEqual({ kind: "partial", start: 900, end: 999 });
    expect(parseByteRange("bytes=-5000", size)).toEqual({ kind: "partial", start: 0, end: 999 });
  });

  it("is unsatisfiable when the range starts past the end", () => {
    expect(parseByteRange("bytes=1000-", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRange("bytes=-0", size)).toEqual({ kind: "unsatisfiable" });
  });

  it("falls back to the full file for malformed or multi-range headers", () => {
    expect(parseByteRange("bytes=0-1,5-9", size)).toEqual({ kind: "full" });
    expect(parseByteRange("items=0-1", size)).toEqual({ kind: "full" });
    expect(parseByteRange("bytes=9-3", size)).toEqual({ kind: "full" });
    expect(parseByteRange("bytes=-", size)).toEqual({ kind: "full" });
  });
});
