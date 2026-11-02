export interface Product {
  id: string;
  /** URL slug, kept on cart lines so the bag links to /shop/<slug>. Absent on older saved carts. */
  slug?: string | null;
  name: string;
  vendor?: string;
  vendorId?: string;
  variants?: {
    name: string;
    values: string[];
  }[];
  price: number;
  stock: number;
  sold?: number;
  sales?: number;
  revenue?: number;
  category?: string;
  status?: string;
  threshold?: number;
  sku?: string;
  imageUrl?: string;
  dateAdded?: Date;
  categoryName?: string;
  available?: boolean;
  categoryId?: string;
  vendorName?: string;
  /** Original price before any discount (used to show strikethrough in cart) */
  originalPrice?: number;
}

export interface Variant {
  name: string;
  values: string[];
}
