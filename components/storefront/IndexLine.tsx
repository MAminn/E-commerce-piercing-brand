import type { ReactNode } from "react";
import { cn } from "#root/lib/utils";
import { formatMoney, type MoneyLocale } from "#root/shared/pricing/format-money";
import { formatCatalogueNo, splitMeasures } from "#root/shared/products/index-line";

/**
 * The Object Index line — Percé's signature. Numbers and measures are muted
 * and tabular; the name and the price are ink. Parts are joined by a muted
 * " · ", and only parts that exist are drawn, so a product with no catalogue
 * number or no measure gets a shorter line, never a dangling separator or a
 * placeholder. No badges, no colour, no decoration.
 *
 *   section  01 · Placement
 *   short    014 · Clicker            (card: name line)
 *            10 mm · EGP 210          (card: detail line)
 *   full     014 · 10 mm · 16G · Ear · Daith      (PDP, beside the title)
 */

type Part = { key: string; text: ReactNode; ink?: boolean };

function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && (
            <span aria-hidden className='text-ink-2'>
              {" · "}
            </span>
          )}
          <span className={p.ink ? "text-ink" : "tabular-nums text-ink-2"}>{p.text}</span>
        </span>
      ))}
    </>
  );
}

/** The fields an index line is built from. Every one is optional except the name. */
export interface IndexLineProduct {
  name: string;
  catalogueNo?: number | null;
  /** The price paid (already resolved; never a compare-at price). */
  price?: number | null;
  /** Extra verified attributes, e.g. material. Rendered as given. */
  attributes?: (string | null | undefined)[];
  /** Placement names, e.g. ["Ear", "Daith"]. */
  placement?: (string | null | undefined)[];
}

/** Catalogue number, title and measures — the name split as stored (see splitMeasures). */
export function indexFields(product: Pick<IndexLineProduct, "name" | "catalogueNo">) {
  const { title, measures } = splitMeasures(product.name);
  return { no: formatCatalogueNo(product.catalogueNo), title, measures };
}

const clean = (xs: (string | null | undefined)[] | undefined) =>
  [...new Set((xs ?? []).map((x) => x?.trim()).filter((x): x is string => !!x))];

type SectionProps = {
  variant: "section";
  /** 1 → "01". */
  index: number;
  label: string;
  as?: "h2" | "h3" | "p";
  id?: string;
  className?: string;
};

type ShortProps = {
  variant: "short";
  product: IndexLineProduct;
  locale?: MoneyLocale;
  /** Links the name line (the card's one link in the tab order). */
  href?: string;
  /** Element for the name line; cards use h3. */
  nameAs?: "h2" | "h3" | "p";
  className?: string;
};

type FullProps = {
  variant: "full";
  product: IndexLineProduct;
  locale?: MoneyLocale;
  /** Include the product name (off on the PDP, whose h1 sits right there). */
  showName?: boolean;
  /** Include the price (off on the PDP, whose price sits right there). */
  showPrice?: boolean;
  className?: string;
};

export type IndexLineProps = SectionProps | ShortProps | FullProps;

export function IndexLine(props: IndexLineProps) {
  if (props.variant === "section") {
    const Tag = props.as ?? "h2";
    return (
      <Tag id={props.id} className={cn("t-h2", props.className)} data-index-line='section'>
        <Parts
          parts={[
            { key: "n", text: String(props.index).padStart(2, "0") },
            { key: "l", text: props.label, ink: true },
          ]}
        />
      </Tag>
    );
  }

  const { product, locale = "en" } = props;
  const { no, title, measures } = indexFields(product);
  const price = typeof product.price === "number" && Number.isFinite(product.price)
    ? formatMoney(product.price, { locale })
    : null;
  const attributes = clean(product.attributes);
  const placement = clean(product.placement);

  if (props.variant === "short") {
    const NameTag = props.nameAs ?? "h3";
    const nameParts: Part[] = [
      ...(no ? [{ key: "no", text: no }] : []),
      { key: "name", text: title, ink: true },
    ];
    const detailParts: Part[] = [
      ...measures.map((m) => ({ key: `m-${m}`, text: m })),
      ...attributes.map((a) => ({ key: `a-${a}`, text: a })),
      ...(price ? [{ key: "price", text: price, ink: true }] : []),
    ];
    const name = (
      <NameTag
        style={{ fontFamily: "var(--font-product-title)" }}
        className='line-clamp-2 t-card-title text-ink'>
        <Parts parts={nameParts} />
      </NameTag>
    );
    return (
      <div className={props.className} data-index-line='short'>
        {props.href ? (
          <a href={props.href} className='block hover:underline hover:decoration-1 hover:underline-offset-4'>
            {name}
          </a>
        ) : (
          name
        )}
        {detailParts.length > 0 && (
          <p className='mt-1 t-card-price' style={{ fontFamily: "var(--font-price)" }}>
            <Parts parts={detailParts} />
          </p>
        )}
      </div>
    );
  }

  const parts: Part[] = [
    ...(no ? [{ key: "no", text: no }] : []),
    ...(props.showName ? [{ key: "name", text: title, ink: true }] : []),
    ...measures.map((m) => ({ key: `m-${m}`, text: m })),
    ...attributes.map((a) => ({ key: `a-${a}`, text: a })),
    ...placement.map((p) => ({ key: `p-${p}`, text: p })),
    ...(props.showPrice && price ? [{ key: "price", text: price, ink: true }] : []),
  ];
  if (parts.length === 0) return null;
  return (
    <p className={cn("t-small", props.className)} data-index-line='full'>
      <Parts parts={parts} />
    </p>
  );
}
