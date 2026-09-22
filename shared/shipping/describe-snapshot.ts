import type { ShippingSnapshot } from "./quote";

/**
 * A one-line admin explanation of how an order's shipping was priced. Reads
 * only the frozen snapshot — never the current rules — so it stays true after
 * rates are edited. A missing snapshot is a legacy order priced by the flat
 * fee before zone shipping existed.
 */
export function describeShippingSnapshot(snapshot: ShippingSnapshot | null | undefined): string {
  if (!snapshot) return "Flat fee (legacy order)";

  let base: string;
  switch (snapshot.rateSource) {
    case "governorate_rate":
      base = `Zone rate · ${snapshot.governorateName ?? snapshot.governorateCode ?? "governorate"}`;
      break;
    case "fallback":
      base = `Other-governorates rate · ${snapshot.governorateName ?? snapshot.governorateCode ?? "governorate"}`;
      break;
    default:
      base = "Flat fee";
  }

  if (snapshot.freeShippingApplied) {
    return `${base} · ${snapshot.ruleFee.toFixed(2)} EGP waived by a free-shipping offer`;
  }
  return base;
}
