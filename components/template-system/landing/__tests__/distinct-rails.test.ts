import { describe, expect, it } from "vitest";
import { distinctRails } from "../distinct-rails";

const p = (id: string) => ({ id });

describe("distinctRails — each homepage SKU in one rail only", () => {
  it("an earlier rail keeps a product; later rails drop it", () => {
    const [featured, newIn, sale] = distinctRails([
      [p("a"), p("b")],
      [p("b"), p("c"), p("a"), p("d")],
      [p("d"), p("e"), p("c")],
    ]);
    expect(featured!.map((x) => x.id)).toEqual(["a", "b"]);
    expect(newIn!.map((x) => x.id)).toEqual(["c", "d"]);
    expect(sale!.map((x) => x.id)).toEqual(["e"]);
  });

  it("caps each rail after de-duplication; a product cut by an earlier cap may still show later", () => {
    const featured = ["a", "b", "c"].map(p);
    const newIn = ["a", "b", "c", "d", "e", "f"].map(p);
    const [shown, kept] = distinctRails([featured, newIn], 2);
    expect(shown!.map((x) => x.id)).toEqual(["a", "b"]);
    // "c" never made it into the first rail, so it is free for the second.
    expect(kept!.map((x) => x.id)).toEqual(["c", "d"]);
  });

  it("no product id appears twice across all rails", () => {
    const rails = distinctRails([
      ["a", "b", "c"].map(p),
      ["c", "b", "x"].map(p),
      ["x", "a", "y"].map(p),
    ]);
    const ids = rails.flat().map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
