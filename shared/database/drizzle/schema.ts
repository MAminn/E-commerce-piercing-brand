import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import type { ShippingSnapshot } from "#root/shared/shipping/quote";
import type { ShippingRulesConfig } from "#root/shared/shipping/rules";
import type { UpsellSettings } from "#root/shared/upsell/config";

export const userRole = pgEnum("user_role", ["admin", "vendor", "user", "superadmin"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  passwordDigest: text("password"),
  phone: text("phone").notNull().default(""),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
  vendorId: uuid("vendor_id").references(() => vendor.id, {
    onDelete: "restrict",
    onUpdate: "cascade",
  }),
  role: userRole("role").notNull().default("user"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationExpiry: timestamp("verification_expiry", {
    withTimezone: true,
    mode: "date",
  }),
  profilePicture: text("profile_picture"),
  image: text("image"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).defaultNow(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

/** better-auth: OAuth accounts / credential account (password stored here) */
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/** better-auth: Email verification tokens */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const passwordResetToken = pgTable("password_reset_token", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  token: text("token").unique().notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const vendorStatus = pgEnum("vendor_status", [
  "pending",
  "rejected",
  "active",
  "inactive",
  "suspended",
  "archived",
]);

export const vendor = pgTable("vendor", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  name: text("name").notNull(),
  status: vendorStatus("status").notNull().default("pending"),
  description: text("description"),
  logoId: uuid("logo_id").references(() => file.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  socialLinks: jsonb("social_links").default([]),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const vendorLogAction = pgEnum("vendor_log_action", [
  "created",
  "updated",
  "approved",
  "rejected",
  "activated",
  "deactivated",
  "suspended",
  "archived",
]);

export const vendorLog = pgTable("vendor_log", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendor.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  note: text("note"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  action: vendorLogAction("action").notNull(),
});

export const file = pgTable("file", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  diskname: text("name").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

// Legacy enum - kept for reference but not used in single-shop mode
export const categoryType = pgEnum("category_type", ["men", "women"]);

export const category = pgTable("category", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  imageId: uuid("image_id")
    .references(() => file.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .unique(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
  type: text("type").notNull().default("general"), // Changed from enum to text for dynamic categories
  deleted: boolean("deleted").notNull().default(false),
  /** Featured in the homepage "Shop by placement" strip. */
  showOnLanding: boolean("show_on_landing").notNull().default(true),
  /**
   * The main category this row is a subcategory of; NULL for a main category.
   *
   * Before this column the hierarchy was implicit: the oldest live row of a
   * given `type` was the "main" category and every other row of that type was
   * its subcategory — so the main row also showed up in its own subcategory
   * list, and renaming a main category (which rewrote its `type`) silently
   * detached all of its subcategories. Migration 0063 backfilled this column
   * with exactly that implicit rule, so existing groupings are unchanged.
   * `type` is still kept equal to the parent's for older readers.
   */
  parentId: uuid("parent_id").references((): AnyPgColumn => category.id, {
    onDelete: "restrict",
    onUpdate: "cascade",
  }),
  /** Position among siblings (lower first); ties fall back to creation order. */
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Hidden from shopper navigation (category tabs, homepage, search). Products
   * keep their memberships and stay listed under the parent category — this
   * is navigation-only, never a product-visibility switch.
   */
  hidden: boolean("hidden").notNull().default(false),
  /** Optional short description shown under the category heading. */
  description: text("description"),
}, (table) => ({
  parentIdx: index("category_parent_idx").on(table.parentId),
}));

export const categoryLogAction = pgEnum("category_log_action", [
  "created",
  "updated",
  "deleted",
]);

export const categoryLog = pgTable("category_log", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => category.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  action: categoryLogAction("action").notNull(),
});

export const product = pgTable("product", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  name: text("name").notNull(),
  /** URL slug, e.g. /shop/titanium-labret — nullable so existing rows can be
   * backfilled without blocking the migration; a unique index still allows
   * multiple NULLs under Postgres semantics. */
  slug: text("slug"),
  description: text("description").notNull(),
  imageId: uuid("image_id")
    .references(() => file.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .notNull(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => category.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  price: decimal("price", {
    precision: 10,
    scale: 2,
  }).notNull(),
  discountPrice: decimal("discount_price", {
    precision: 10,
    scale: 2,
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
  vendorId: uuid("vendor_id")
    .references(() => vendor.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    })
    .notNull(),
  stock: integer("stock").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
  /** When true, product is hidden from the public shop */
  hidden: boolean("hidden").notNull().default(false),
  /** Legacy (fragrance era): optional "inspired by" text supporting [color:#hex]text[/color] syntax. No longer authored or rendered by Percé; kept so existing records read back unchanged. */
  inspiredBy: text("inspired_by"),
  /** Display order within a category (lower = shown first, null = default) */
  sortOrder: integer("sort_order"),
  /** Legacy (fragrance era): character, longevity, when to wear, and top/middle/base notes. No longer authored or rendered by Percé; kept so existing records read back unchanged. */
  fragranceInfo: jsonb("fragrance_info").$type<{
    tagline?: string;
    taglineAr?: string;
    about?: string;
    aboutAr?: string;
    longevity?: string;
    longevityAr?: string;
    whenToUse?: string;
    whenToUseAr?: string;
    concentration?: string;
    scentIntensity?: string;
    scentIntensityAr?: string;
    gender?: string;
    genderAr?: string;
    topNotes?: string;
    topNotesAr?: string;
    middleNotes?: string;
    middleNotesAr?: string;
    baseNotes?: string;
    baseNotesAr?: string;
    ingredients?: string;
    ingredientsAr?: string;
    badges?: string[];
  }>(),
  /** Admin-picked product IDs shown in the "Style It With" carousel on this product's page. Empty/unset hides the section. Column name is the fragrance-era one, kept to avoid a migration.
   * Also the ordered manual list for upsells when `upsellMode` is "manual". */
  bestLayeredWithIds: jsonb("best_layered_with_ids")
    .default([])
    .$type<string[]>(),
  /** How this product's upsells are chosen: "global" (store default — random),
   * "manual" (exactly `bestLayeredWithIds`, in order) or "disabled". See
   * shared/upsell/config.ts. Ported from the Mach template. */
  upsellMode: text("upsell_mode", { enum: ["global", "manual", "disabled"] })
    .notNull()
    .default("global"),
  /**
   * Merchant-only internal reference code (e.g. FB001, ER001) for the
   * inventory/supplier system. This is NOT the customer-facing "SKU" the
   * product-page templates render — it must never reach a storefront client.
   * Unique among non-deleted products when present; NULL means "not entered
   * yet", and any number of rows may be blank.
   */
  internalCode: text("internal_code"),
  /**
   * Merchant-only unit cost in EGP. NULL means "not entered yet" and is
   * deliberately NOT defaulted to 0 — 0 is a real value (a genuinely
   * zero-cost item), so defaulting would contaminate future margin
   * reporting. Never returned to storefront clients, and never an input to
   * any selling price, bundle, discount, cart, shipping or payment figure.
   */
  costPrice: decimal("cost_price", {
    precision: 10,
    scale: 2,
  }),
  /**
   * Customer-facing catalogue number (the "014" in "014 · Clicker"), shown
   * zero-padded to three digits. Stable per product: entered by the owner,
   * never derived from sort order or rank. NULL means "not numbered yet" —
   * nothing is generated, and the storefront omits it cleanly. Unique when
   * present (NULLs are exempt from the index).
   */
  catalogueNo: integer("catalogue_no"),
}, (table) => ({
  slugUnique: uniqueIndex("product_slug_idx").on(table.slug),
  /**
   * No two LIVE products share an internal code. A soft-deleted product keeps
   * its historical code (order and ERP history still point at it) but no
   * longer reserves it, so a live product may reuse it. Restoring a deleted
   * product whose code is now taken fails on this index. NULLs are exempt.
   * Migration 0068 replaced the old all-rows `product_internal_code_idx`.
   */
  internalCodeUnique: uniqueIndex("product_internal_code_active_idx")
    .on(table.internalCode)
    .where(sql`${table.deleted} = false and ${table.internalCode} is not null`),
  /** One product per catalogue number; NULLs (not numbered yet) are exempt. */
  catalogueNoUnique: uniqueIndex("product_catalogue_no_idx").on(table.catalogueNo),
  /** Backs category browsing and the Phase 4 dynamic bundle-eligibility scan. */
  categoryIdx: index("product_category_idx").on(table.categoryId),
}));

export const productVariant = pgTable("product_variant", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  name: text("name").notNull(),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  values: jsonb("values").notNull().default([]).$type<{ value: string; priceModifier?: number; enabledOverride?: boolean }[]>(),
});

export const reviewStatus = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cod",
  "stripe",
  "paymob",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "not_required",
  "pending",
  "processing",
  "paid",
  "failed",
  "refunded",
]);

export const order = pgTable("order", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  /**
   * Customer-facing order number (#10001, #10002, …) — see
   * shared/orders/order-number.ts. Assigned by Postgres on insert; never set
   * by application code. Unique; older orders were backfilled in placement
   * order by migration 0064.
   */
  orderNumber: integer("order_number")
    .notNull()
    .generatedByDefaultAsIdentity({ startWith: 10001 }),
  userId: text("user_id").references(() => user.id, {
    onDelete: "restrict",
    onUpdate: "cascade",
  }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingState: text("shipping_state").notNull(),
  shippingDistrict: text("shipping_district").notNull().default(""),
  shippingPostalCode: text("shipping_postal_code").notNull(),
  shippingCountry: text("shipping_country").notNull(),
  /**
   * Canonical destination (shared/shipping/egypt-governorates.ts). NULL on
   * orders placed before zone shipping existed and on flat-mode orders whose
   * checkout did not pick a governorate. `shipping_state` keeps holding the
   * display name for the address views and the Bosta dispatch path.
   */
  shippingGovernorateCode: text("shipping_governorate_code"),
  subtotal: decimal("subtotal", {
    precision: 10,
    scale: 2,
  }).notNull(),
  /** The amount actually charged for delivery. Snapshot — never recomputed from rules. */
  shipping: decimal("shipping", {
    precision: 10,
    scale: 2,
  }).notNull(),
  /**
   * How `shipping` was derived at checkout (provider, rule fee, whether a
   * free-shipping offer zeroed it). NULL = legacy order priced by the flat
   * fee before this column existed. Rule edits never touch it.
   */
  shippingQuote: jsonb("shipping_quote").$type<ShippingSnapshot>(),
  tax: decimal("tax", {
    precision: 10,
    scale: 2,
  }).notNull(),
  discount: decimal("discount", {
    precision: 10,
    scale: 2,
  }),
  promoCodeId: uuid("promo_code_id").references(() => promoCode.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  total: decimal("total", {
    precision: 10,
    scale: 2,
  }).notNull(),
  status: orderStatus("status").notNull().default("pending"),
  notes: text("notes"),
  // Payment gateway fields
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("cod"),
  paymentStatus: paymentStatusEnum("payment_status")
    .notNull()
    .default("not_required"),
  paymentSessionId: text("payment_session_id"),
  paymentTransactionId: text("payment_transaction_id"),
  paymentGatewayData: jsonb("payment_gateway_data"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
  // Fincart integration fields
  fincartTrackingNumber: text("fincart_tracking_number"),
  fincartStatus: text("fincart_status"),
  fincartSubStatus: text("fincart_sub_status"),
  fincartRejectionReason: text("fincart_rejection_reason"),
  fincartSupportNote: text("fincart_support_note"),
  fincartReturnTrackingNumber: text("fincart_return_tracking_number"),
  fincartStatusUpdatedDate: timestamp("fincart_status_updated_date", {
    withTimezone: true,
    mode: "date",
  }),
  fincartWebhookData: jsonb("fincart_webhook_data"),
  // Bosta integration fields (only populated when SYN_BOSTA_KEY is configured)
  bostaDeliveryId: text("bosta_delivery_id"),
  bostaTrackingNumber: text("bosta_tracking_number"),
  bostaStatus: text("bosta_status"),
  bostaStatusCode: text("bosta_status_code"),
  bostaWebhookData: jsonb("bosta_webhook_data"),
  bostaStatusUpdatedAt: timestamp("bosta_status_updated_at", {
    withTimezone: true,
    mode: "date",
  }),
  /** sent | failed | pending | skipped | cancelled — null when Bosta not used */
  bostaSyncStatus: text("bosta_sync_status"),
  bostaSyncError: text("bosta_sync_error"),
  bostaSyncedAt: timestamp("bosta_synced_at", {
    withTimezone: true,
    mode: "date",
  }),
  bostaSyncAttemptedAt: timestamp("bosta_sync_attempted_at", {
    withTimezone: true,
    mode: "date",
  }),
  archivedAt: timestamp("archived_at", {
    withTimezone: true,
    mode: "date",
  }),
  /** True once the reserved stock for this order's items has been restored (on cancel/delete), so it's never restored twice */
  stockRestored: boolean("stock_restored").notNull().default(false),
}, (table) => {
  return {
    /**
     * Every dated report — store revenue and, since Phase 6, all bundle
     * analytics — drives off a `created_at` range on this table and then joins
     * outwards. `status`/`archived_at` are low-selectivity (nearly every row
     * passes), so the date alone is the useful key.
     */
    createdAtIdx: index("order_created_at_idx").on(table.createdAt),
    orderNumberIdx: uniqueIndex("order_order_number_idx").on(table.orderNumber),
  };
});

export const orderItem = pgTable("order_item", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  orderId: uuid("order_id")
    .notNull()
    .references(() => order.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendor.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  vendorName: text("vendor_name"),
  quantity: integer("quantity").notNull(),
  price: decimal("price", {
    precision: 10,
    scale: 2,
  }).notNull(),
  discountPrice: decimal("discount_price", {
    precision: 10,
    scale: 2,
  }),
  name: text("name").notNull(),
  /**
   * Merchant-only SNAPSHOT of the product's `internal_code` as it stood when
   * this line was placed — the same treatment `name` and `price` already get.
   * Admin history must never be rewritten by a later edit to the product, so
   * nothing reads this by joining back to `product`: if the merchant renames
   * PC001 to PC101 tomorrow, every order placed today still reads PC001.
   *
   * NULL for lines placed before this column existed and for products that
   * had no code at the time of purchase. Not backfilled — a code assigned
   * after the fact was NOT the code the line was sold under.
   *
   * Merchant-only, exactly like the product column it copies: never returned
   * to a storefront client. `order.create` is a PUBLIC procedure that returns
   * its inserted rows, so see `backend/orders/merchant-fields.ts`.
   */
  internalCode: text("internal_code"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  /**
   * Set when this line was bought as part of a Build Your Stack bundle —
   * points at the order's bundle snapshot (see `orderBundle`). `price` /
   * `discountPrice` still hold the product's REGULAR prices; the bundle's
   * fixed charge lives on the snapshot and the difference is in
   * `order.discount`, so inventory/fulfilment/edit-order keep treating the
   * row like any other item.
   */
  orderBundleId: uuid("order_bundle_id").references(() => orderBundle.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  /**
   * Phase 7: the option configuration bought, as the server resolved it
   * (`{ "Color": "Gold" }`), so the line is readable long after the product's
   * options are renamed or removed. `price` / `discount_price` already
   * include the chosen values' modifiers. Null for simple products and for
   * lines placed before Phase 7 (their `name` still carries the label).
   */
  selectedOptions: jsonb("selected_options").$type<Record<string, string>>(),
}, (table) => {
  return {
    /**
     * Phase 6 product-selection analytics walks order → order_bundle →
     * order_item by this column; without it that last hop is a sequential
     * scan of every line the shop ever sold. Partial (bundle children are a
     * minority of order lines) so it stays small.
     */
    orderBundleIdx: index("order_item_order_bundle_idx")
      .on(table.orderBundleId)
      .where(sql`${table.orderBundleId} is not null`),
  };
});


export const productReview = pgTable("product_review", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: text("user_id").references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  userName: text("user_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  imageId: uuid("image_id").references(() => file.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  status: reviewStatus("status").default("pending").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

// Table to store multiple images for products
export const productImage = pgTable("product_image", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => v7()),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  fileId: uuid("file_id")
    .notNull()
    .references(() => file.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  isPrimary: boolean("is_primary").notNull().default(false),
  /** Display order — lower value = shown first */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

// Junction table for many-to-many relationship between products and categories
export const productCategory = pgTable(
  "product_category",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => v7()),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => {
    return {
      productCategoryUnique: uniqueIndex("product_category_unique").on(
        table.productId,
        table.categoryId,
      ),
    };
  },
);

// Template System Schema
export const templateType = pgEnum("template_type", [
  "page",
  "section",
  "component",
]);

export const templateStatus = pgEnum("template_status", [
  "active",
  "inactive",
  "draft",
]);

export const template = pgTable("template", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: templateType("type").notNull(),
  category: text("category").notNull(), // e.g., "hero", "product-card", "navbar"
  previewImageId: uuid("preview_image_id").references(() => file.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  componentPath: text("component_path").notNull(), // Path to the React component
  configSchema: jsonb("config_schema").default({}), // JSON schema for configuration options
  defaultConfig: jsonb("default_config").default({}), // Default configuration values
  status: templateStatus("status").notNull().default("draft"),
  version: text("version").notNull().default("1.0.0"),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const assignmentScope = pgEnum("assignment_scope", [
  "global",
  "page",
  "section",
]);

export const templateAssignment = pgTable("template_assignment", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => template.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  scope: assignmentScope("scope").notNull(),
  targetIdentifier: text("target_identifier"), // page path, section ID, etc.
  targetCategory: text("target_category"), // e.g., "hero", "product-grid"
  config: jsonb("config").default({}), // Instance-specific configuration
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0), // For ordering when multiple templates apply
  assignedBy: text("assigned_by")
    .notNull()
    .references(() => user.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const templateAnalytics = pgTable("template_analytics", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => template.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  assignmentId: uuid("assignment_id").references(() => templateAssignment.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  pageViews: integer("page_views").notNull().default(0),
  interactions: integer("interactions").notNull().default(0),
  conversionRate: decimal("conversion_rate", {
    precision: 5,
    scale: 4,
  }),
  performanceScore: decimal("performance_score", {
    precision: 5,
    scale: 2,
  }),
  lastViewed: timestamp("last_viewed", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }),
});

// Enum for discount type
export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed_amount",
]);

// Enum for promo code status
export const promoCodeStatusEnum = pgEnum("promo_code_status", [
  "active",
  "inactive",
  "expired",
  "exhausted", // Used up all available uses
  "scheduled", // Not yet active, start date is in the future
]);

export const promoCode = pgTable(
  "promo_code",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    code: text("code").notNull().unique(),
    description: text("description"),

    discountType: discountTypeEnum("discount_type").notNull(),
    discountValue: decimal("discount_value", {
      precision: 10,
      scale: 2,
    }).notNull(),

    status: promoCodeStatusEnum("status").notNull().default("inactive"),

    startDate: timestamp("start_date", { withTimezone: true, mode: "date" }),
    endDate: timestamp("end_date", { withTimezone: true, mode: "date" }),

    usageLimit: integer("usage_limit"), // Max total uses. Null means unlimited.
    usedCount: integer("used_count").notNull().default(0),

    usageLimitPerUser: integer("usage_limit_per_user"), // Max uses per user. Null means unlimited for a user (up to total usageLimit).

    minPurchaseAmount: decimal("min_purchase_amount", {
      precision: 10,
      scale: 2,
    }), // Null means no minimum purchase.

    // Applicability:
    // If appliesToAllProducts is true, specific product/category applicability is ignored.
    // If false, then specific products/categories are checked via junction tables.
    appliesToAllProducts: boolean("applies_to_all_products")
      .notNull()
      .default(true),

    // Admin-controlled: only codes with this on show up in the public
    // "Active Promo Codes" section of the /offers page.
    showOnOffersPage: boolean("show_on_offers_page").notNull().default(false),

    /**
     * Eligible-UNIT quantity rule (inclusive bounds; null = unbounded). Units
     * are counted over the code's eligible products only — never cart lines,
     * never non-eligible products. min = max is an exact rule (PICK3 = 3/3).
     * Both null (every pre-existing code) = no quantity rule. A code WITH a
     * rule is a "set code" and owns its eligible units: see
     * shared/bundles/cart-pricing.ts for the stacking rule.
     */
    eligibleMinQuantity: integer("eligible_min_quantity"),
    eligibleMaxQuantity: integer("eligible_max_quantity"),

    /**
     * When the code qualifies it also zeroes the shipping charge of an
     * already-deliverable destination. Never makes an unavailable destination
     * deliverable. Combines with the percentage/fixed discount above.
     */
    freeShipping: boolean("free_shipping").notNull().default(false),

    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => {
    return {
      codeIndex: uniqueIndex("promo_code_code_idx").on(table.code),
    };
  },
);

// Junction table for many-to-many relationship between promo codes and applicable products
export const promoCodeProducts = pgTable(
  "promo_code_product", // Singular 'product' for consistency with 'product_category'
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCode.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      promoCodeProductUnique: uniqueIndex("promo_code_product_unique_idx").on(
        table.promoCodeId,
        table.productId,
      ),
    };
  },
);

// Junction table for many-to-many relationship between promo codes and applicable categories
export const promoCodeCategories = pgTable(
  "promo_code_category", // Singular 'category'
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCode.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, {
        onDelete: "cascade", // Cascade delete if category is deleted
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      promoCodeCategoryUnique: uniqueIndex("promo_code_category_unique_idx").on(
        table.promoCodeId,
        table.categoryId,
      ),
    };
  },
);

/**
 * Products a promo code never counts or discounts, whatever its product /
 * category / all-products applicability says (exclusions win). Lets a code
 * cover "every earring except the fixed 3-piece sets" without listing every
 * single piece.
 */
export const promoCodeExcludedProducts = pgTable(
  "promo_code_excluded_product",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCode.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      promoCodeExcludedProductUnique: uniqueIndex("promo_code_excluded_product_unique_idx").on(
        table.promoCodeId,
        table.productId,
      ),
    };
  },
);

// Authentication log table for tracking login/registration events
export const authLogAction = pgEnum("auth_log_action", [
  "login_success",
  "login_failed",
  "register_success",
  "register_failed",
  "email_verified",
  "password_reset_requested",
  "password_reset_success",
]);

export const authLog = pgTable("auth_log", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  userId: text("user_id").references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  email: text("email").notNull(),
  action: authLogAction("action").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

// Order log table for tracking order status changes
export const orderLogAction = pgEnum("order_log_action", [
  "created",
  "status_changed",
  "cancelled",
  "refunded",
  "items_edited",
  "payment_confirmed",
  "payment_failed",
  "bosta_sent",
  "bosta_send_failed",
  "bosta_skipped",
  "bosta_cancelled",
  "bosta_status_updated",
  // Customer order-confirmation email outcomes (backend/orders/order-emails).
  "confirmation_email_sent",
  "confirmation_email_failed",
]);

export const orderLog = pgTable("order_log", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => order.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: text("user_id").references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  action: orderLogAction("action").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  note: text("note"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

// Webhook log table for tracking payment webhooks
export const webhookLogStatus = pgEnum("webhook_log_status", [
  "received",
  "processed",
  "failed",
]);

export const webhookLog = pgTable("webhook_log", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  webhookType: text("webhook_type").notNull(), // e.g., "payment", "refund"
  provider: text("provider").notNull(), // e.g., "stripe", "fincart"
  payload: jsonb("payload").notNull(),
  status: webhookLogStatus("status").notNull().default("received"),
  errorMessage: text("error_message"),
  orderId: uuid("order_id").references(() => order.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  processedAt: timestamp("processed_at", {
    withTimezone: true,
    mode: "date",
  }),
});

/**
 * Homepage Content table
 * Stores customizable content for merchant homepages
 * Content is stored per merchant per template (templateId)
 * templateId "default" is used for backward compatibility (pre-template-scoped CMS)
 */
export const homepageContent = pgTable(
  "homepage_content",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => v7()),
    merchantId: uuid("merchant_id").notNull(),
    templateId: text("template_id").notNull().default("default"),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("homepage_content_merchant_template_idx").on(
      table.merchantId,
      table.templateId,
    ),
  ],
);

/**
 * Category Content table
 * Stores customizable content for category pages
 * Content is stored per category per merchant
 */
export const categoryContent = pgTable(
  "category_content",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => v7()),
    merchantId: uuid("merchant_id").notNull(),
    categoryId: text("category_id").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Ensure one content record per merchant per category
    uniqueMerchantCategory: uniqueIndex("unique_merchant_category").on(
      table.merchantId,
      table.categoryId,
    ),
  }),
);

// ─── Pixel Tracking ─────────────────────────────────────────────────────────

export const pixelPlatform = pgEnum("pixel_platform", [
  "meta",
  "google_ga4",
  "tiktok",
  "snapchat",
  "pinterest",
  "custom",
  "clarity",
]);

/**
 * Pixel configuration table
 * Stores merchant's connected pixel/tracking accounts
 */
export const pixelConfig = pgTable("pixel_config", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  platform: pixelPlatform("platform").notNull(),
  pixelId: text("pixel_id").notNull(),
  accessToken: text("access_token"),
  enabled: boolean("enabled").notNull().default(true),
  enableClientSide: boolean("enable_client_side").notNull().default(true),
  enableServerSide: boolean("enable_server_side").notNull().default(false),
  consentRequired: boolean("consent_required").notNull().default(false),
  consentCategory: text("consent_category"),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
});

/**
 * Tracking event table (append-only log)
 * Stores every tracking event received from the client beacon
 */
export const trackingEvent = pgTable("tracking_event", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: text("user_id").references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  eventName: text("event_name").notNull(),
  eventId: text("event_id").notNull().unique(),
  eventData: jsonb("event_data").notNull(),
  pageUrl: text("page_url"),
  referrer: text("referrer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  deviceType: text("device_type"),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

/**
 * Tracking event delivery table (append-only log)
 * Tracks which pixel platforms received each event and their delivery status
 */
export const trackingEventDelivery = pgTable("tracking_event_delivery", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  trackingEventId: uuid("tracking_event_id")
    .notNull()
    .references(() => trackingEvent.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  platform: pixelPlatform("platform").notNull(),
  sent: boolean("sent").notNull().default(false),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  platformEventId: text("platform_event_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

// ─── GA4 server-owned Purchase (GA4_PURCHASE_OWNER) ─────────────────────────
//
// See backend/pixel-tracking/ga4-purchase/README.md. Both tables are written
// only while GA4_PURCHASE_OWNER is `shadow` or `server`; in the default
// `browser` mode nothing reads or writes them.

/**
 * GA4 identifiers read from the shopper's first-party cookies on the
 * `order.create` request — the only request in the order's life that carries
 * them (payment webhooks do not). Never invented: a missing or malformed
 * cookie stores NULL. No customer PII.
 */
export const ga4PurchaseContext = pgTable("ga4_purchase_context", {
  orderId: uuid("order_id")
    .primaryKey()
    .references(() => order.id, { onDelete: "cascade", onUpdate: "cascade" }),
  /** `_ga` → "<random>.<first-visit-seconds>", e.g. "1234567890.1730000000". */
  gaClientId: text("ga_client_id"),
  /** `_ga_<container>` → GA4 session id (seconds), e.g. "1731600000". */
  gaSessionId: text("ga_session_id"),
  gaSessionNumber: integer("ga_session_number"),
  /** `_tracking_consent` snapshot: null = no consent cookie / not decided. */
  consentAnalytics: boolean("consent_analytics"),
  consentMarketing: boolean("consent_marketing"),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

/**
 * Durable outbox: at most ONE row per order (unique order_id), inserted in
 * the same transaction as the milestone that makes the order a purchase
 * (COD placed / online payment confirmed paid).
 *
 * status:
 *   shadow  — recorded in shadow mode; payload prepared, NEVER sent
 *   pending — waiting for (re)delivery at next_attempt_at
 *   sending — claimed by a worker until locked_until (a crash leaves it to
 *             be reclaimed once the lease expires)
 *   sent    — GA4 answered 2xx
 *   held    — not sent by policy (held_reason: missing_client_id,
 *             consent_denied, …); waits for an owner decision
 *   failed  — permanent: 4xx, invalid payload, past GA4's 72 h window, or
 *             attempts exhausted (last_error says which)
 */
export const ga4PurchaseOutbox = pgTable(
  "ga4_purchase_outbox",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Owner mode when the row was enqueued: shadow | server. */
    mode: text("mode").notNull(),
    /** Milestone that enqueued it: order_create | payment_confirmed | stripe_webhook | admin_edit. */
    source: text("source").notNull(),
    status: text("status").notNull(),
    /** When the order became a purchase — GA4 timestamp_micros. */
    eligibleAt: timestamp("eligible_at", { withTimezone: true, mode: "date" }).notNull(),
    /** Frozen Measurement Protocol body (no api_secret, no customer PII). */
    payload: jsonb("payload"),
    heldReason: text("held_reason"),
    attempts: integer("attempts").notNull().default(0),
    /** Attempts whose outcome is unknown (timeout / crash mid-request). */
    ambiguousAttempts: integer("ambiguous_attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    /** Set on each claim; only the worker holding it may record the outcome. */
    claimToken: uuid("claim_token"),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    preparedAt: timestamp("prepared_at", { withTimezone: true, mode: "date" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ga4_purchase_outbox_order_id_idx").on(table.orderId),
    index("ga4_purchase_outbox_due_idx").on(table.status, table.nextAttemptAt),
  ],
);

// ─── ABS courier tracking (ABS_TRACKING_MODE) ───────────────────────────────
//
// See docs/ABS_TRACKING.md. Read-only mirror of ABS shipments, their links to
// website orders and the shadow decisions the poller WOULD take. Written only
// by backend/shipping-tracking/abs/** while ABS_TRACKING_MODE is shadow; in
// the default `off` mode nothing reads or writes them. Status / state / role
// / decision columns are plain text (values documented in
// backend/shipping-tracking/abs/types.ts) so later phases never need an enum
// migration.

/** One row per ABS airway bill, last observed state. */
export const absShipment = pgTable(
  "abs_shipment",
  {
    awb: text("awb").primaryKey(),
    reference: text("reference"),
    /** DELIVERY | REVERSE | EXCHANGE | CASH_COLLECTION (as sent by ABS). */
    cmpService: text("cmp_service"),
    statusRaw: text("status_raw"),
    /** Canonical status (normalize.ts); UNKNOWN when unrecognised. */
    status: text("status").notNull(),
    lastEventCode: text("last_event_code"),
    lastReason: text("last_reason"),
    cash: decimal("cash", { precision: 10, scale: 2 }),
    collectedCash: decimal("collected_cash", { precision: 10, scale: 2 }),
    absFees: decimal("abs_fees", { precision: 10, scale: 2 }),
    totalFees: decimal("total_fees", { precision: 10, scale: 2 }),
    isPaid: boolean("is_paid"),
    paymentDate: timestamp("payment_date", { withTimezone: true, mode: "date" }),
    deliveryDate: timestamp("delivery_date", { withTimezone: true, mode: "date" }),
    absCreatedAt: timestamp("abs_created_at", { withTimezone: true, mode: "date" }),
    /** National 10-digit mobile, no leading 0 (normalizeEgyptPhone). */
    consigneePhoneNorm: text("consignee_phone_norm"),
    consigneePhoneLast4: text("consignee_phone_last4"),
    noOfPieces: integer("no_of_pieces"),
    originAwb: text("origin_awb"),
    /** Last row as returned by ABS (validated), for audit. */
    raw: jsonb("raw").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("abs_shipment_status_idx").on(table.status),
    index("abs_shipment_phone_idx").on(table.consigneePhoneNorm),
  ],
);

/**
 * Every distinct status an AWB was observed in. `occurred_at` is ABS's own
 * time when known (history / delivery date), NULL for a plain poll
 * observation; re-reads never duplicate (unique on awb + status +
 * occurred_at, NULL counted as one value).
 */
export const absShipmentStatusHistory = pgTable(
  "abs_shipment_status_history",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    awb: text("awb")
      .notNull()
      .references(() => absShipment.awb, { onDelete: "cascade", onUpdate: "cascade" }),
    status: text("status").notNull(),
    statusRaw: text("status_raw"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    /** poll | bulk | history */
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("abs_shipment_status_history_dedupe_idx").on(
      table.awb,
      table.status,
      sql`coalesce(${table.occurredAt}, '1970-01-01 00:00:00+00'::timestamptz)`,
    ),
  ],
);

/**
 * AWB → website order. One link per AWB. `confirmed` / `rejected` are human
 * decisions (Phase 2) and are never overwritten by the matcher. At most one
 * PRIMARY link in `auto|confirmed` per order. The FK lives on this new table
 * only; `order` is not altered.
 */
export const absOrderLink = pgTable(
  "abs_order_link",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    awb: text("awb")
      .notNull()
      .references(() => absShipment.awb, { onDelete: "cascade", onUpdate: "cascade" }),
    orderId: uuid("order_id").references(() => order.id, { onDelete: "set null" }),
    /** primary | reverse | exchange | other */
    linkRole: text("link_role").notNull(),
    /** auto | needs_review | confirmed | rejected | unmatched */
    state: text("state").notNull(),
    /** reference | phone_amount | phone_amount_fuzzy | manual (NULL when unmatched) */
    method: text("method"),
    /** Why the matcher stopped where it did (cod_mismatch, multiple_candidates, …). */
    reasonCode: text("reason_code"),
    confidence: integer("confidence").notNull().default(0),
    /** Ranked [{ orderId, orderNumber, score, reasons[] }] — no customer PII. */
    candidates: jsonb("candidates").notNull().default([]),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    /**
     * Set by a human link change (0071): the next tick recomputes this AWB's
     * decision even if ABS reports no change for it, then clears it.
     */
    recomputeRequestedAt: timestamp("recompute_requested_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("abs_order_link_awb_idx").on(table.awb),
    uniqueIndex("abs_order_link_primary_order_idx")
      .on(table.orderId)
      .where(sql`${table.linkRole} = 'primary' and ${table.state} in ('auto', 'confirmed')`),
    index("abs_order_link_state_idx").on(table.state),
    index("abs_order_link_order_idx").on(table.orderId),
  ],
);

/**
 * The shadow audit trail: what the poller WOULD do. One row per distinct
 * (awb, shipment status, order status, decision) — re-polls only move
 * seen_count / last_seen_at. `applied` is always false in Phase 1.
 */
export const absTrackingDecision = pgTable(
  "abs_tracking_decision",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    awb: text("awb")
      .notNull()
      .references(() => absShipment.awb, { onDelete: "cascade", onUpdate: "cascade" }),
    orderId: uuid("order_id").references(() => order.id, { onDelete: "set null" }),
    orderStatusSeen: text("order_status_seen"),
    shipmentStatus: text("shipment_status").notNull(),
    /** no_action | would_mark_shipped | would_mark_delivered | needs_return_confirmation | alert */
    decision: text("decision").notNull(),
    reasonCode: text("reason_code"),
    details: jsonb("details"),
    mode: text("mode").notNull(),
    applied: boolean("applied").notNull().default(false),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    seenCount: integer("seen_count").notNull().default(1),
    /**
     * Snapshot of what the decision was computed against (0071), refreshed on
     * every sighting. Not used for writes in shadow mode; a future live
     * writer compares-and-sets against these.
     */
    orderStatusAtDecision: text("order_status_at_decision"),
    orderTotalAtDecision: decimal("order_total_at_decision", { precision: 10, scale: 2 }),
    absDeliveryDate: timestamp("abs_delivery_date", { withTimezone: true, mode: "date" }),
    /** Human acknowledgement (alerts / needs_return_confirmation only). */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, mode: "date" }),
    acknowledgedBy: text("acknowledged_by"),
    ackNote: text("ack_note"),
    /** Live mode (0072): when the ABS live writer applied this decision (with `applied = true`). */
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("abs_tracking_decision_dedupe_idx").on(table.dedupeKey),
    index("abs_tracking_decision_created_idx").on(table.createdAt),
    index("abs_tracking_decision_awb_idx").on(table.awb),
    index("abs_tracking_decision_awb_seen_idx").on(table.awb, table.lastSeenAt),
    check("abs_tracking_decision_ack_note_len", sql`${table.ackNote} is null or char_length(${table.ackNote}) <= 500`),
  ],
);

/** One row per poller tick (including skipped ones). */
export const absSyncRun = pgTable(
  "abs_sync_run",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    /** schedule | manual | backfill */
    trigger: text("trigger").notNull(),
    /** ok | partial | failed | skipped_locked | skipped_config — NULL while running (or interrupted). */
    outcome: text("outcome"),
    windowFrom: timestamp("window_from", { withTimezone: true, mode: "date" }),
    windowTo: timestamp("window_to", { withTimezone: true, mode: "date" }),
    pages: integer("pages").notNull().default(0),
    shipmentsSeen: integer("shipments_seen").notNull().default(0),
    shipmentsChanged: integer("shipments_changed").notNull().default(0),
    linksAuto: integer("links_auto").notNull().default(0),
    linksReview: integer("links_review").notNull().default(0),
    decisionsNew: integer("decisions_new").notNull().default(0),
    /** Redacted, ≤ 500 chars. */
    error: text("error"),
    /** After a failed run (0071): scheduled ticks wait until then (exponential, ≤ 1 h; Retry-After honoured). */
    backoffUntil: timestamp("backoff_until", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("abs_sync_run_started_idx").on(table.startedAt), index("abs_sync_run_trigger_idx").on(table.trigger, table.startedAt)],
);

/** Single row (id = 1): end of the last fully successful poll window. */
export const absSyncState = pgTable(
  "abs_sync_state",
  {
    id: integer("id").primaryKey().default(1),
    watermark: timestamp("watermark", { withTimezone: true, mode: "date" }),
    /**
     * Page-cap continuation (0071): a window that hit ABS_MAX_PAGES_PER_TICK
     * is resumed by the next tick from here instead of being re-read from
     * page 1. NULL when no window is in progress.
     */
    resumeWindowFrom: timestamp("resume_window_from", { withTimezone: true, mode: "date" }),
    resumeWindowTo: timestamp("resume_window_to", { withTimezone: true, mode: "date" }),
    resumePage: integer("resume_page"),
    resumeCursor: text("resume_cursor"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [check("abs_sync_state_singleton", sql`${table.id} = 1`)],
);

/**
 * One row per HUMAN action on the ABS review screen (0071), written in the
 * same transaction as the change. No FK: the trail outlives the rows it
 * describes. before / after hold link or decision state only (no PII).
 */
export const absAuditLog = pgTable(
  "abs_audit_log",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    at: timestamp("at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    /** Admin email. */
    actor: text("actor").notNull(),
    /** link_confirm | link_reject | link_manual | link_unlink | alert_ack | poll_now */
    action: text("action").notNull(),
    awb: text("awb"),
    orderId: uuid("order_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    note: text("note"),
  },
  (table) => [
    index("abs_audit_log_at_idx").on(table.at),
    index("abs_audit_log_awb_idx").on(table.awb),
    index("abs_audit_log_order_idx").on(table.orderId),
  ],
);

/**
 * ABS Live (0072): one row per evaluation outcome of the live writer
 * (backend/shipping-tracking/abs/live.ts).
 *   applied  — the order was set Delivered through the shared admin core, in
 *              the same transaction as this row. At most one per decision and
 *              one per (order, to_status) (partial unique indexes).
 *   skipped  — an eligible-looking candidate that did not pass, with its
 *              reason (incl. `awaiting_approval` in approval mode); at most one
 *              row per AWB × reason × Cairo day (repeats bump last_seen_at).
 *   failed   — the apply transaction failed (rolled back), same dedupe.
 * No FKs (the trail outlives what it describes). No PII in details.
 */
export const absLiveApplication = pgTable(
  "abs_live_application",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    decisionId: uuid("decision_id").notNull(),
    awb: text("awb").notNull(),
    orderId: uuid("order_id"),
    fromStatus: text("from_status"),
    /** Always `delivered` (CHECK): the only automatic transition. */
    toStatus: text("to_status").notNull(),
    /** applied | skipped | failed */
    outcome: text("outcome").notNull(),
    reasonCode: text("reason_code"),
    /** auto | approval | approve_old */
    trigger: text("trigger").notNull(),
    /** system:abs, or the approving admin's email. */
    actor: text("actor").notNull(),
    orderLogId: uuid("order_log_id"),
    details: jsonb("details"),
    cairoDay: date("cairo_day", { mode: "string" }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    seenCount: integer("seen_count").notNull().default(1),
    undoneAt: timestamp("undone_at", { withTimezone: true, mode: "date" }),
    undoneBy: text("undone_by"),
    undoOrderLogId: uuid("undo_order_log_id"),
  },
  (table) => [
    uniqueIndex("abs_live_application_decision_applied_idx").on(table.decisionId).where(sql`${table.outcome} = 'applied'`),
    uniqueIndex("abs_live_application_order_applied_idx").on(table.orderId, table.toStatus).where(sql`${table.outcome} = 'applied'`),
    uniqueIndex("abs_live_application_skip_dedupe_idx")
      .on(table.awb, table.outcome, table.reasonCode, table.cairoDay)
      .where(sql`${table.outcome} in ('skipped', 'failed')`),
    index("abs_live_application_day_idx").on(table.cairoDay, table.outcome),
    index("abs_live_application_awb_seen_idx").on(table.awb, table.lastSeenAt),
    index("abs_live_application_applied_at_idx").on(table.appliedAt),
    check("abs_live_application_to_status", sql`${table.toStatus} = 'delivered'`),
    check("abs_live_application_outcome", sql`${table.outcome} in ('applied', 'skipped', 'failed')`),
    check("abs_live_application_reason", sql`${table.outcome} = 'applied' or ${table.reasonCode} is not null`),
  ],
);

/** ABS Live (0072): single row (id = 1) of runtime switches — the pause flag, toggled from the screen without a restart. */
export const absSettings = pgTable(
  "abs_settings",
  {
    id: integer("id").primaryKey().default(1),
    livePaused: boolean("live_paused").notNull().default(false),
    pausedAt: timestamp("paused_at", { withTimezone: true, mode: "date" }),
    pausedBy: text("paused_by"),
    pauseNote: text("pause_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (table) => [check("abs_settings_singleton", sql`${table.id} = 1`)],
);

// ─── Custom Tracking Events ─────────────────────────────────────────────────

export const customEventTriggerType = pgEnum("custom_event_trigger_type", [
  "manual",
  "css_selector",
  "url_match",
  "time_on_page",
]);

/**
 * Custom tracking event definitions
 * Merchant-defined custom events with automated trigger configuration
 */
export const customTrackingEvent = pgTable("custom_tracking_event", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  triggerType: customEventTriggerType("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  eventData: jsonb("event_data").notNull().default({}),
  platformMapping: jsonb("platform_mapping").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
});

// ─── Attribution Touchpoints ────────────────────────────────────────────────

export const attributionChannel = pgEnum("attribution_channel", [
  "organic",
  "paid_meta",
  "paid_google",
  "paid_tiktok",
  "paid_snapchat",
  "paid_pinterest",
  "direct",
  "email",
  "referral",
  "social",
]);

/**
 * Attribution touchpoint table (append-only log)
 * Captures every marketing touchpoint for multi-touch attribution
 */
export const attributionTouchpoint = pgTable("attribution_touchpoint", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: text("user_id").references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  channel: attributionChannel("channel").notNull(),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  term: text("term"),
  content: text("content"),
  landingPage: text("landing_page"),
  referrer: text("referrer"),
  clickId: text("click_id"),
  clickIdType: text("click_id_type"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

// ─── Tracking Consent ───────────────────────────────────────────────────────

export const consentMethod = pgEnum("consent_method", [
  "banner_accept",
  "banner_reject",
  "settings_page",
  "implied",
]);

/**
 * Tracking consent table (append-only log)
 * Stores consent decisions for GDPR/privacy compliance audit trail
 */
export const trackingConsent = pgTable("tracking_consent", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: text("user_id").references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  consentGiven: boolean("consent_given").notNull(),
  consentCategories: jsonb("consent_categories")
    .notNull()
    .default({ analytics: false, marketing: false, functional: true }),
  consentMethodType: consentMethod("consent_method").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

// ─── Store Settings ─────────────────────────────────────────────────────────
// Single-row table holding admin-configurable store-wide settings.
// ─── Entry Popup config types ───────────────────────────────────────────────
// Split into two pieces deliberately: PopupConfig is presentational and safe
// to expose via a public endpoint (the popup needs it before anyone is
// logged in); PopupDiscountConfig names an internal promo_code id and is
// read ONLY server-side by the claim flow — never sent to an anonymous
// client, mirroring how pixelConfig.accessToken is excluded from the public
// pixel SSR query.

export interface PopupConfig {
  enabled: boolean;
  imageUrl: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  submitLabelEn: string;
  submitLabelAr: string;
  successMessageEn: string;
  successMessageAr: string;
  dismissLabelEn: string;
  dismissLabelAr: string;
  dismissHref: string;
  collectPhone: boolean;
  phoneRequired: boolean;
  triggerDelaySeconds: number;
  /** 0 = disabled */
  triggerScrollPercent: number;
  triggerExitIntent: boolean;
  reshowAfterDays: number;
}

export interface PopupDiscountConfig {
  promoCodeId: string | null;
  codeMode: "existing" | "generate";
}

// ─── Social Proof config ────────────────────────────────────────────────────
// Drives the storefront's "recent order" toast (ported from the Mach
// template). Entirely separate from the Entry Popup above — different
// surface, different lifecycle, different admin page — so the two are stored
// in their own columns and neither can break the other.
//
// Every field here is presentational or a query bound; the whole object is
// safe to hand to an anonymous client. What is NOT safe is the order data the
// feed is built from, which is why the events themselves are sanitised
// server-side (backend/social-proof/sanitize.ts) and the raw order row never
// leaves the server.

export interface SocialProofConfig {
  enabled: boolean;
  /** Seconds after mount before the first toast appears. */
  firstDelaySeconds: number;
  /** Seconds a single toast stays on screen. */
  displayDurationSeconds: number;
  /** Seconds between the end of one toast and the start of the next. */
  intervalSeconds: number;
  /** Hard cap on toasts shown per browser tab/session. */
  maxPerSession: number;
  /** Only orders placed within this many days are eligible. */
  lookbackDays: number;
  showLocation: boolean;
  /** Which broad shipping field supplies the location — never a street address. */
  locationSource: "city" | "governorate";
  showRelativeTime: boolean;
  /** Empty = every eligible product. Otherwise restricted to these product ids. */
  allowedProductIds: string[];
  eligibleStatuses: Array<"processing" | "shipped" | "delivered">;
}

// ─── Typography ─────────────────────────────────────────────────────────────
// Admin-uploaded fonts (custom_font_file table below) grouped by familyName,
// assigned per-role here. A role of `null` means "use the site's built-in
// default font" — nothing changes for stores that never touch this feature.

export type TypographyRoleKey =
  | "heading"
  | "body"
  | "buttons"
  | "nav"
  | "productTitle"
  | "price"
  | "formInput";

export interface TypographyRoleAssignment {
  familyName: string;
  weight: number;
}

export type TypographyRoles = Record<
  TypographyRoleKey,
  TypographyRoleAssignment | null
>;

export interface TypographySettings {
  roles: TypographyRoles;
}

/**
 * Runtime on/off switches for the marketing-automation worker, checked on
 * every tick (see backend/email-automations/worker.ts) rather than only at
 * boot — so the admin can pause sending or restrict it to a single test
 * inbox without a redeploy. workerEnabled gates both trigger scanning and
 * actual sending; testModeEnabled (while workerEnabled is true) still lets
 * the queue run but only ever sends to testModeEmail, holding every other
 * row as cancelled instead of delivering it.
 */
export interface EmailAutomationSettings {
  workerEnabled: boolean;
  testModeEnabled: boolean;
  testModeEmail: string;
  /** Optional override for the logo emails use in place of the site header logo. Empty = fall back to the header logo. */
  emailLogoUrl: string;
}

// We use a fixed key ("default") enforced by a unique constraint so only one
// row ever exists.
export const storeSettings = pgTable("store_settings", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  key: text("key").unique().notNull().default("default"),
  /** Flat-mode fee only. Ignored entirely once `shippingRules.mode === "zones"`. */
  shippingFee: decimal("shipping_fee", {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default("0"),
  /**
   * Destination-based rates (shared/shipping/rules.ts). NULL = never
   * configured = flat mode, exactly the pre-zones behaviour.
   */
  shippingRules: jsonb("shipping_rules").$type<ShippingRulesConfig>(),
  templateSelection: jsonb("template_selection").default({}),
  linkTreeConfig: jsonb("link_tree_config").default({}),
  variantPresets: jsonb("variant_presets")
    .default([])
    .$type<Array<{ id: string; name: string; values: Array<{ value: string; priceModifier?: number }>; defaultValue?: string; strikethroughValues?: string[] }>>(),
  comingSoonMode: boolean("coming_soon_mode").notNull().default(false),
  productPageContent: jsonb("product_page_content")
    .default({})
    .$type<{
      shippingText?: string;
      shippingTextAr?: string;
      returnsText?: string;
      returnsTextAr?: string;
      faqs?: Array<{ question: string; questionAr?: string; answer: string; answerAr?: string }>;
    }>(),
  popupConfig: jsonb("popup_config").$type<PopupConfig>(),
  popupDiscountConfig: jsonb("popup_discount_config").$type<PopupDiscountConfig>(),
  socialProofConfig: jsonb("social_proof_config").$type<SocialProofConfig>(),
  emailAutomationSettings: jsonb("email_automation_settings").$type<EmailAutomationSettings>(),
  typographySettings: jsonb("typography_settings").$type<TypographySettings>(),
  /** Store-wide upsell switches. Null/partial rows inherit the defaults in
   * shared/upsell/config.ts (which ship upsells OFF). */
  upsellConfig: jsonb("upsell_config").$type<Partial<UpsellSettings>>(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

// ─── Custom Fonts ───────────────────────────────────────────────────────────
// Admin-uploaded @font-face source files. `familyName` is a free-text group
// key (not a separate table) — multiple rows sharing the same familyName are
// different weights/styles of the same uploaded family, exactly like stacked
// real @font-face declarations.

export const customFontFile = pgTable(
  "custom_font_file",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    familyName: text("family_name").notNull(),
    weight: integer("weight").notNull(),
    style: text("style", { enum: ["normal", "italic"] }).notNull().default("normal"),
    fileUrl: text("file_url").notNull(),
    format: text("format", { enum: ["woff2", "woff", "ttf"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("custom_font_file_family_weight_style_idx").on(
      table.familyName,
      table.weight,
      table.style,
    ),
  ],
);

export type CustomFontFileRow = typeof customFontFile.$inferSelect;

// ─── Layout Settings (Header / Footer CMS) ─────────────────────────────────
// Stores CMS-driven header and footer configuration.
// Uses the same merchant-scoped pattern as homepageContent.
export const layoutSettings = pgTable(
  "layout_settings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => v7()),
    merchantId: uuid("merchant_id").notNull(),
    templateId: text("template_id").notNull().default("default"),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("layout_settings_merchant_template_idx").on(
      table.merchantId,
      table.templateId,
    ),
  ],
);

// ─── Coming-Soon Subscribers ───────────────────────────────────────────────
// Stores emails collected during coming-soon mode so the admin can later
// blast a "we're live" email with a promo code or announcement.
export const comingSoonSubscribers = pgTable("coming_soon_subscribers", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  email: text("email").unique().notNull(),
  phone: text("phone"),
  subscribedAt: timestamp("subscribed_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  notifiedAt: timestamp("notified_at", {
    withTimezone: true,
    mode: "date",
  }),
});

// ─── Cart Offers ────────────────────────────────────────────────────────────
// Automatic promotions applied at cart/checkout level.
// Condition and reward are stored as JSONB so new offer types can be added
// without schema migrations.

export const cartOffer = pgTable("cart_offer", {
  id: uuid("id")
    .$defaultFn(() => v7())
    .primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  // Lower priority = evaluated first; exclusive offers stop further stacking
  priority: integer("priority").notNull().default(0),
  isExclusive: boolean("is_exclusive").notNull().default(false),
  /**
   * Condition JSONB — one of:
   *   { type: "always" }
   *   { type: "quantity_threshold"; minQuantity: number; maxQuantity?: number; productIds?: string[]; categoryIds?: string[]; repeatsPerMultiple?: boolean }
   *   { type: "cart_total"; minTotal: number }
   *   { type: "product_bundle"; requiredProductIds: string[] }
   *
   * `repeatsPerMultiple` (quantity_threshold only) is unrelated to
   * `isExclusive`/"stackable" below — that controls combining with OTHER
   * offers, this controls whether THIS offer's own reward multiplies when
   * the cart clears the threshold more than once (e.g. Buy 2 Get 1: qty 6
   * in cart → 2 free instead of 1).
   */
  condition: jsonb("condition").notNull().$type<OfferCondition>(),
  /**
   * Reward JSONB — one of:
   *   { type: "percentage_off"; percentOff: number }
   *   { type: "fixed_off"; amountOff: number }
   *   { type: "free_shipping" }
   *   { type: "free_items"; quantity: number; which: "cheapest" | "most_expensive" }
   */
  reward: jsonb("reward").notNull().$type<OfferReward>(),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

// ─── Offer type helpers ─────────────────────────────────────────────────────

export type OfferCondition =
  | { type: "always" }
  | {
      type: "quantity_threshold";
      minQuantity: number;
      /** Optional inclusive upper bound on the relevant units (min = max → exact). Absent on every pre-existing offer. */
      maxQuantity?: number;
      productIds?: string[];
      categoryIds?: string[];
      /** Multiply the reward by how many times the threshold is met (e.g. Buy 2 Get 1: 6 in cart → 2x reward). Not related to offer-vs-offer stacking. */
      repeatsPerMultiple?: boolean;
    }
  | { type: "cart_total"; minTotal: number }
  | { type: "product_bundle"; requiredProductIds: string[] };

export type OfferReward =
  | { type: "percentage_off"; percentOff: number }
  | { type: "fixed_off"; amountOff: number }
  | { type: "free_shipping" }
  | { type: "free_items"; quantity: number; which: "cheapest" | "most_expensive" };

// ─── Bundles & Stacks ───────────────────────────────────────────────────────
// A bundle campaign is a merchandised, customer-facing promotion the shopper
// deliberately enters ("Build Your Stack: choose any 6 for 480"). It is NOT a
// generic cart rule — those stay in `cart_offer` above. Campaigns have their
// own identity (slug, title, image), an explicit eligible-product pool, and a
// pricing model that prices N qualifying units as a whole rather than
// subtracting a fixed amount. See shared/bundles/evaluate.ts for the
// qualification/pricing rules and docs/BUNDLES_AND_STACKS.md for the design.

export const bundleCampaignType = pgEnum("bundle_campaign_type", [
  /** Shopper picks `requiredQuantity` units from the eligible pool. */
  "build_your_stack",
  /**
   * Merchant-fixed composition: the pool rows ARE the stack (each with a
   * `quantity`), the shopper buys exactly that set. `requiredQuantity` is
   * kept equal to the composition's unit count by the service.
   */
  "curated_stack",
]);

export const bundleCampaignPricingType = pgEnum("bundle_campaign_pricing_type", [
  /** Exactly `requiredQuantity` qualifying units cost `fixedBundlePrice` in total. */
  "fixed_total",
  /**
   * Pick Your Set only: each tier takes `bundle_campaign_tier.discount_percent`
   * off the selected units' effective prices. `fixed_bundle_price` stays null.
   */
  "percentage_discount",
]);

/**
 * How a completed bundle interacts with the generic promotions engine
 * (`cart_offer` rows and promo codes) once bundles reach the cart.
 *   exclusive  — the bundle's units are priced by the bundle only; no cart
 *                offer or promo code discount applies on top of them.
 *   stackable  — cart offers / promo codes may still apply to the bundle total.
 * An enum (not a boolean) so finer policies (e.g. promo codes only) can be
 * added later without a destructive migration.
 */
export const bundleCampaignOfferStacking = pgEnum("bundle_campaign_offer_stacking", [
  "exclusive",
  "stackable",
]);

/**
 * Phase 4: how a Build Your Stack campaign decides which products a shopper
 * may pick. `curated_stack` ignores it (its composition is exact).
 *   manual  — only `bundle_campaign_product` rows (every pre-Phase-4 campaign).
 *   dynamic — only products matching `bundle_campaign_eligibility_*` rules.
 *   hybrid  — the union of both, deduplicated.
 * See shared/bundles/eligibility.ts for the semantics.
 */
export const bundleCampaignEligibilityMode = pgEnum("bundle_campaign_eligibility_mode", [
  "manual",
  "dynamic",
  "hybrid",
]);

export const bundleCampaign = pgTable(
  "bundle_campaign",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    /** Admin-only label shown in the dashboard list. */
    internalName: text("internal_name").notNull(),
    /** Customer-facing title used by the bundle builder / merchandising. */
    title: text("title").notNull(),
    /** URL slug for the campaign's public page, e.g. /bundles/build-your-stack. */
    slug: text("slug").notNull(),
    /** One-line merchandising hook shown on cards/hero under the title, e.g. "Mix it your way". */
    subtitle: text("subtitle"),
    description: text("description"),
    /** Optional merchandising badge, e.g. "Save 20%". Free text, admin-authored. */
    badgeText: text("badge_text"),
    imageId: uuid("image_id").references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    type: bundleCampaignType("type").notNull().default("build_your_stack"),
    /**
     * Master switch. Campaigns start inactive (draft) so a half-configured
     * campaign is never public by accident. Effective visibility also depends
     * on startsAt/endsAt — see getBundleCampaignState().
     */
    isActive: boolean("is_active").notNull().default(false),
    /** Number of qualifying UNITS (not distinct products) that form one bundle. */
    requiredQuantity: integer("required_quantity").notNull(),
    pricingType: bundleCampaignPricingType("pricing_type").notNull().default("fixed_total"),
    /** Total price of one complete bundle. Required when pricingType = fixed_total. */
    fixedBundlePrice: decimal("fixed_bundle_price", { precision: 10, scale: 2 }),
    /** When false, each eligible product can fill at most one slot in a bundle. */
    allowDuplicates: boolean("allow_duplicates").notNull().default(false),
    /** Upper bound of units per product in one bundle when duplicates are allowed. Null = no cap. */
    maxPerProduct: integer("max_per_product"),
    /** When true, a cart may contain several complete bundles from this campaign. */
    isRepeatable: boolean("is_repeatable").notNull().default(false),
    offerStacking: bundleCampaignOfferStacking("offer_stacking").notNull().default("exclusive"),
    /**
     * Pick Your Set (build_your_stack) only: a qualifying instance of this
     * campaign waives the shipping charge of the WHOLE order — for a
     * destination that is already deliverable; it never makes an unavailable
     * governorate deliverable. Part of the bundle's own benefit, so it needs
     * no offer or promo code (and works for exclusive/percentage sets).
     * Default false: every existing campaign keeps normal shipping. Ready
     * Sets are always stored false.
     */
    freeShipping: boolean("free_shipping").notNull().default(false),
    /**
     * Build Your Stack only. Existing campaigns default to `manual`, which is
     * exactly their Phase 1-3 behaviour.
     */
    eligibilityMode: bundleCampaignEligibilityMode("eligibility_mode").notNull().default("manual"),
    /**
     * Dynamic price filter, inclusive, compared against the product's EFFECTIVE
     * price (discountPrice ?? price). Null = unbounded on that side. Single
     * valued, so plain columns rather than a rule table.
     */
    eligibilityMinPrice: decimal("eligibility_min_price", { precision: 10, scale: 2 }),
    eligibilityMaxPrice: decimal("eligibility_max_price", { precision: 10, scale: 2 }),
    /** Merchandising display order (lower = shown first). */
    sortOrder: integer("sort_order").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      slugIdx: uniqueIndex("bundle_campaign_slug_idx").on(table.slug),
      activeScheduleIdx: index("bundle_campaign_active_schedule_idx").on(
        table.isActive,
        table.startsAt,
        table.endsAt,
      ),
    };
  },
);

/**
 * Manually curated eligible-product pool of a campaign. Normalized (one row
 * per product) rather than a JSON array on the campaign so it can be joined,
 * indexed and cleaned up by FK. Dynamic eligibility (by category/tag) would
 * be an additional rule table beside this one, not a replacement.
 *
 * For `curated_stack` campaigns the same rows are the fixed composition and
 * `quantity` says how many units of each product the stack contains. For
 * `build_your_stack` it is always 1 (a pool membership, not a quantity).
 */
export const bundleCampaignProduct = pgTable(
  "bundle_campaign_product",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    bundleCampaignId: uuid("bundle_campaign_id")
      .notNull()
      .references(() => bundleCampaign.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Display order inside the bundle builder (lower = shown first). */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Units of this product in a curated stack; 1 for build-your-stack pool rows. */
    quantity: integer("quantity").notNull().default(1),
    /**
     * Phase 7, CURATED composition lines only: the exact option configuration
     * the merchant fixed for this line, e.g. `{ "Color": "Gold" }`, validated
     * against the product's option groups on save. Null for a product without
     * options and for every Build Your Stack pool row — BYS eligibility stays
     * product-level and the shopper picks the options in the builder.
     */
    selectedOptions: jsonb("selected_options").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      campaignProductUnique: uniqueIndex("bundle_campaign_product_unique_idx").on(
        table.bundleCampaignId,
        table.productId,
      ),
      productIdx: index("bundle_campaign_product_product_idx").on(table.productId),
    };
  },
);

/**
 * Merchandising placement only: which category pages may surface this
 * campaign. Never consulted for eligibility or pricing — the merchant decides
 * where a stack is promoted independently of which products it contains.
 */
export const bundleCampaignCategory = pgTable(
  "bundle_campaign_category",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    bundleCampaignId: uuid("bundle_campaign_id")
      .notNull()
      .references(() => bundleCampaign.id, { onDelete: "cascade", onUpdate: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      campaignCategoryUnique: uniqueIndex("bundle_campaign_category_unique_idx").on(
        table.bundleCampaignId,
        table.categoryId,
      ),
      categoryIdx: index("bundle_campaign_category_category_idx").on(table.categoryId),
    };
  },
);

export type BundleCampaignCategoryRow = typeof bundleCampaignCategory.$inferSelect;

/**
 * Phase 5 pricing tiers: quantity -> price steps of a Build Your Stack
 * campaign ("3 for 270, 4 for 340, 6 for 480"). One campaign, several price
 * points — never one campaign per tier.
 *
 * Canonical pricing for `build_your_stack`. The legacy
 * `bundle_campaign.required_quantity` / `fixed_bundle_price` columns are kept
 * (migration 0055 backfills one tier row per existing campaign from them) but
 * are no longer independently editable: the service rewrites them from the
 * LOWEST tier on every save, so the two can never disagree. See
 * docs/BUNDLES_AND_STACKS.md.
 *
 * `curated_stack` campaigns store NO rows here — their composition is one
 * quantity at one price, which stays on `fixed_bundle_price`. The domain
 * evaluates them through a synthesised single tier so both types share one
 * pricing path (see curatedEvaluationConfig).
 */
export const bundleCampaignTier = pgTable(
  "bundle_campaign_tier",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    bundleCampaignId: uuid("bundle_campaign_id")
      .notNull()
      .references(() => bundleCampaign.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Qualifying UNITS this tier prices. A selection must match it exactly. */
    quantity: integer("quantity").notNull(),
    /**
     * Total charged for those units — fixed_total campaigns. Null on a
     * percentage_discount tier (every row written before percentage pricing
     * has a price, so nothing existing changes).
     */
    price: decimal("price", { precision: 10, scale: 2 }),
    /** % off the selected units' effective prices — percentage_discount campaigns only. */
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
    /** Display position. Tiers are authored and shown ascending by quantity; this keeps that order explicit and stable. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      /** Two tiers of one campaign can never claim the same quantity — that would make tier resolution ambiguous. */
      campaignQuantityUnique: uniqueIndex("bundle_campaign_tier_quantity_idx").on(
        table.bundleCampaignId,
        table.quantity,
      ),
      campaignIdx: index("bundle_campaign_tier_campaign_idx").on(table.bundleCampaignId),
    };
  },
);

export type BundleCampaignTierRow = typeof bundleCampaignTier.$inferSelect;

/**
 * Phase 4 dynamic eligibility: the categories a Build Your Stack campaign
 * accepts products from. DISTINCT from `bundle_campaign_category`, which is
 * merchandising placement ("show this campaign on the Ear page") and never
 * decides what is buyable. Kept as its own table for the same reasons the
 * manual pool is normalized: joinable, indexable, FK-cleaned.
 *
 * Multiple rows are OR'd; the price bounds on `bundle_campaign` are AND'd on
 * top. Categories in this repository are flat (no parent column), so a rule
 * matches products assigned directly to the category — the same thing a
 * category page lists.
 */
export const bundleCampaignEligibilityCategory = pgTable(
  "bundle_campaign_eligibility_category",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    bundleCampaignId: uuid("bundle_campaign_id")
      .notNull()
      .references(() => bundleCampaign.id, { onDelete: "cascade", onUpdate: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      campaignCategoryUnique: uniqueIndex("bundle_campaign_eligibility_category_unique_idx").on(
        table.bundleCampaignId,
        table.categoryId,
      ),
      categoryIdx: index("bundle_campaign_eligibility_category_category_idx").on(table.categoryId),
    };
  },
);

export type BundleCampaignEligibilityCategoryRow =
  typeof bundleCampaignEligibilityCategory.$inferSelect;


/**
 * Snapshot of one bundle instance as it was purchased. Independent of the
 * live campaign (FK is SET NULL) so history survives campaign edits/deletes.
 */
export const orderBundle = pgTable(
  "order_bundle",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Client-generated instance id from the cart — lets support match a receipt to what the shopper built. */
    instanceId: text("instance_id").notNull(),
    campaignId: uuid("campaign_id").references(() => bundleCampaign.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    campaignSlug: text("campaign_slug").notNull(),
    campaignTitle: text("campaign_title").notNull(),
    /**
     * Snapshotted campaign type, so the admin can label a historical group
     * "Curated Stack" / "Build Your Stack" without reading the live campaign
     * (which may since have been edited or deleted). Pre-Phase-4 rows default
     * to build_your_stack, which is what Phase 2 could produce.
     */
    campaignType: bundleCampaignType("campaign_type").notNull().default("build_your_stack"),
    /**
     * Which pricing tier was bought, as a PLAIN id with no foreign key: a
     * merchant may delete a tier tomorrow and this order must still render
     * exactly as it was sold. Purely a reference for support; nothing in the
     * admin display depends on the row still existing. Null for orders placed
     * before Phase 5 and for curated stacks.
     */
    tierId: uuid("tier_id"),
    /** Units in one bundle — i.e. the purchased tier's quantity. Snapshotted, never re-read from the campaign. */
    requiredQuantity: integer("required_quantity").notNull(),
    /** Σ regular prices of the children at purchase. */
    regularTotal: decimal("regular_total", { precision: 10, scale: 2 }).notNull(),
    /** What the shopper was charged for the bundle. */
    bundleTotal: decimal("bundle_total", { precision: 10, scale: 2 }).notNull(),
    /** Snapshotted pricing model. Every order placed before percentage pricing was fixed_total. */
    pricingType: bundleCampaignPricingType("pricing_type").notNull().default("fixed_total"),
    /** Snapshotted percentage of a percentage_discount tier; null for fixed-total bundles. */
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
    /** Snapshot: this instance's campaign granted free shipping at purchase. False on every older order. */
    freeShipping: boolean("free_shipping").notNull().default(false),
    offerStacking: bundleCampaignOfferStacking("offer_stacking").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      orderIdx: index("order_bundle_order_idx").on(table.orderId),
    };
  },
);

export type OrderBundleRow = typeof orderBundle.$inferSelect;

export type BundleCampaignRow = typeof bundleCampaign.$inferSelect;
export type BundleCampaignProductRow = typeof bundleCampaignProduct.$inferSelect;

// ─── Email Automation Queue ─────────────────────────────────────────────────
// Backs the marketing-automation suite (welcome, abandoned cart, win-back,
// broadcasts, etc). One row = one scheduled send. A worker (see
// backend/email-automations/worker.ts) polls for due rows and sends them.

export const emailAutomationType = pgEnum("email_automation_type", [
  "welcome",
  "review_check",
  "abandoned_cart",
  "abandoned_browse",
  "win_back",
  "new_drops",
  "flash_offer",
  "retention",
  // Transactional order emails ride the same queue for retry + dedupe, but
  // are never gated by the marketing toggles (see worker.ts).
  "order_confirmation",
  "order_admin_notification",
]);

export const scheduledEmailStatus = pgEnum("scheduled_email_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);

export const scheduledEmailLocale = pgEnum("scheduled_email_locale", [
  "en",
  "ar",
]);

export const scheduledEmail = pgTable(
  "scheduled_email",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    automationType: emailAutomationType("automation_type").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    locale: scheduledEmailLocale("locale").notNull().default("en"),
    /** Arbitrary data the template needs to render (order items, product, discount code, campaign id, ...). */
    payload: jsonb("payload").notNull(),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: scheduledEmailStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /**
     * Identifies the logical send this row represents (e.g.
     * `abandoned_cart:step1:{cartId}`, `broadcast:{campaignId}:{email}`).
     * Unique so re-triggering the same logical event never double-enqueues —
     * the enqueue path upserts against this key instead of inserting blindly.
     */
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      dedupeKeyIdx: uniqueIndex("scheduled_email_dedupe_key_idx").on(
        table.dedupeKey,
      ),
      // Drives the worker's claim query: WHERE status = 'pending' AND
      // scheduled_for <= now() ORDER BY scheduled_for.
      statusScheduledForIdx: index(
        "scheduled_email_status_scheduled_for_idx",
      ).on(table.status, table.scheduledFor),
      recipientEmailIdx: index("scheduled_email_recipient_email_idx").on(
        table.recipientEmail,
      ),
    };
  },
);

export type ScheduledEmailRow = typeof scheduledEmail.$inferSelect;

export type CartOfferRow = typeof cartOffer.$inferSelect;

// ─── Email Subscription (marketing unsubscribe) ────────────────────────────
// One row per email address that has ever received (or could receive) a
// marketing automation. unsubscribedAt null = subscribed. The token is what
// the public /unsubscribe page is keyed on — deliberately NOT the row id, so
// it can be regenerated independently and never doubles as a guessable
// database identifier.

export const emailSubscription = pgTable(
  "email_subscription",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    email: text("email").notNull(),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      emailIdx: uniqueIndex("email_subscription_email_idx").on(table.email),
      tokenIdx: uniqueIndex("email_subscription_token_idx").on(
        table.unsubscribeToken,
      ),
    };
  },
);

export type EmailSubscriptionRow = typeof emailSubscription.$inferSelect;

// ─── Email Templates (marketing automation content) ────────────────────────
// One row per (automationType, stepKey). stepKey is "default" for every
// single-step automation and "step1"/"step2"/"step3" for abandoned_cart's
// 3-email sequence — this lets one table cover both shapes without a
// separate steps table or a nested-array jsonb that the admin UI would need
// special-case logic to edit. delayMinutes lives per-row so each abandoned
// cart step (or any future multi-step automation) can have its own timing.

export interface EmailTemplateContent {
  headlineEn: string;
  headlineAr: string;
  bodyEn: string;
  bodyAr: string;
  ctaLabelEn: string;
  ctaLabelAr: string;
  ctaHref: string;
  /** Shows the featured product/cart-item card (image + name + price) from the send's payload data. */
  showFeaturedItem: boolean;
  /** Shows a 1-5 star review-request block (review_check). */
  showReviewStars: boolean;
  /** Shows a highlighted discount-code badge, using the code attached via emailTemplate.promoCodeId. */
  showDiscountCode: boolean;
  discountBadgeTextEn: string;
  discountBadgeTextAr: string;
}

export const emailTemplate = pgTable(
  "email_template",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    automationType: emailAutomationType("automation_type").notNull(),
    stepKey: text("step_key").notNull().default("default"),
    enabled: boolean("enabled").notNull().default(true),
    /** Minutes after the triggering event this step should send. 0 = immediate/on-demand (broadcasts). */
    delayMinutes: integer("delay_minutes").notNull().default(0),
    subjectEn: text("subject_en").notNull(),
    subjectAr: text("subject_ar").notNull(),
    preheaderEn: text("preheader_en"),
    preheaderAr: text("preheader_ar"),
    content: jsonb("content").notNull().$type<EmailTemplateContent>(),
    /**
     * The real promo code (from the admin's Promo Codes page) this template
     * shows via {{discountCode}}. Deliberately a proper FK, not a free-typed
     * value in `content` — the admin picks from codes that actually exist,
     * nothing generates or invents a code on its own. Null when the template
     * doesn't show a discount code, or hasn't had one attached yet.
     */
    promoCodeId: uuid("promo_code_id").references(() => promoCode.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      automationStepIdx: uniqueIndex("email_template_automation_step_idx").on(
        table.automationType,
        table.stepKey,
      ),
    };
  },
);

export type EmailTemplateRow = typeof emailTemplate.$inferSelect;

// ─── Popup Claims (entry-popup discount abuse gate) ────────────────────────
// One row per person who has ever claimed the entry-popup's first-order
// discount. Unique on BOTH email and phone (nullable — unique indexes allow
// multiple NULLs in Postgres, so phone stays optional) so a returning
// visitor with cleared cookies/incognito gets their EXISTING code back
// instead of a fresh one, and can never claim twice under a different
// address for the same phone number or vice versa.

export const popupClaim = pgTable(
  "popup_claim",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    email: text("email").notNull(),
    phone: text("phone"),
    promoCodeId: uuid("promo_code_id").references(() => promoCode.id, {
      onDelete: "set null",
    }),
    issuedCode: text("issued_code").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => {
    return {
      emailIdx: uniqueIndex("popup_claim_email_idx").on(table.email),
      phoneIdx: uniqueIndex("popup_claim_phone_idx").on(table.phone),
    };
  },
);

export type PopupClaimRow = typeof popupClaim.$inferSelect;

// ─── Cart Capture (abandoned-cart / abandoned-browse tracking) ─────────────
// Carts otherwise live only in the browser's localStorage — the server never
// sees them, which makes abandoned-cart email impossible. This is a
// lightweight server-side mirror keyed by an anonymous per-browser session
// token (generated client-side, not tied to login). email/phone/userId are
// attached the moment they become known (popup signup, checkout entry,
// login) — before that, a row can exist with no contact info at all, which
// simply can't be targeted by an abandoned-cart email yet.

export interface CapturedCartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

export const capturedCart = pgTable(
  "captured_cart",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    sessionToken: text("session_token").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email"),
    phone: text("phone"),
    items: jsonb("items").notNull().$type<CapturedCartItem[]>(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    locale: text("locale").notNull().default("en"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /** Set once the session checks out — abandoned-cart emails must never fire for a completed order. */
    convertedOrderId: uuid("converted_order_id").references(() => order.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      sessionTokenIdx: uniqueIndex("captured_cart_session_token_idx").on(
        table.sessionToken,
      ),
      // Drives the abandoned-cart trigger scan: WHERE email IS NOT NULL AND
      // converted_order_id IS NULL AND last_activity_at <= threshold.
      emailActivityIdx: index("captured_cart_email_activity_idx").on(
        table.email,
        table.lastActivityAt,
      ),
    };
  },
);

export type CapturedCartRow = typeof capturedCart.$inferSelect;

// ─── Viewed Products (abandoned-browse tracking) ────────────────────────────
// One row per (sessionToken, productId) — a lightweight "last viewed"
// record, not a full clickstream. Re-viewing the same product just bumps
// viewedAt rather than creating a new row.

export const viewedProduct = pgTable(
  "viewed_product",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    sessionToken: text("session_token").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    productName: text("product_name").notNull(),
    productImageUrl: text("product_image_url"),
    email: text("email"),
    viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      sessionProductIdx: uniqueIndex("viewed_product_session_product_idx").on(
        table.sessionToken,
        table.productId,
      ),
      emailViewedIdx: index("viewed_product_email_viewed_idx").on(
        table.email,
        table.viewedAt,
      ),
    };
  },
);

export type ViewedProductRow = typeof viewedProduct.$inferSelect;

// ─── WhatsApp order confirmation (WHATSAPP_CONFIRM_MODE) ────────────────────
//
// See backend/whatsapp-confirmation/README.md. Migration 0073. Additive only:
// order_id columns carry NO foreign key (no lock on "order"), and nothing here
// is read by the ERP export. State / status / kind columns are plain text
// (values in backend/whatsapp-confirmation/types.ts) so later phases never
// need an enum migration.

/** One row per order: the confirmation's whole lifecycle. */
export const waOrderConfirmation = pgTable(
  "wa_order_confirmation",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    orderId: uuid("order_id").notNull(),
    orderNumber: integer("order_number"),
    state: text("state").notNull(),
    /** Effective mode when the row was created: shadow | pilot | live. */
    mode: text("mode").notNull(),
    /** Normalised recipient (201xxxxxxxxx); null when the number is not a mobile. */
    phoneE164: text("phone_e164"),
    ineligibleReason: text("ineligible_reason"),
    /** Random, unguessable; carried in the quick-reply button payloads. */
    token: text("token").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true, mode: "date" }),
    consentSource: text("consent_source"),
    consentTextVersion: text("consent_text_version"),
    /** Business-scoped user id (BSUID) once a webhook reveals it. */
    waUserId: text("wa_user_id"),
    outboundWamid: text("outbound_wamid"),
    reminderWamid: text("reminder_wamid"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    respondedAt: timestamp("responded_at", { withTimezone: true, mode: "date" }),
    /** confirm | modify | cancel | free_text — the latest customer response. */
    response: text("response"),
    /** Shadow / not allow-listed: `apply` when a confirm WOULD have moved the order to processing. */
    wouldApply: text("would_apply"),
    statusApplied: boolean("status_applied").notNull().default(false),
    statusSkipReason: text("status_skip_reason"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true, mode: "date" }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true, mode: "date" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wa_order_confirmation_order_idx").on(table.orderId),
    uniqueIndex("wa_order_confirmation_token_idx").on(table.token),
    index("wa_order_confirmation_state_idx").on(table.state, table.sentAt),
    index("wa_order_confirmation_outbound_idx").on(table.outboundWamid),
    index("wa_order_confirmation_reminder_idx").on(table.reminderWamid),
  ],
);

export type WaOrderConfirmationRow = typeof waOrderConfirmation.$inferSelect;

/**
 * Send queue. dedupe_key (`wa:confirm:<orderId>`, `wa:reminder:<orderId>`)
 * guarantees one confirmation and at most one reminder per order.
 * status: pending | sending | sent | failed | shadow_skipped | cancelled
 */
export const waOutbox = pgTable(
  "wa_outbox",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    orderId: uuid("order_id").notNull(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    claimToken: uuid("claim_token"),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    wamid: text("wamid"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wa_outbox_dedupe_idx").on(table.dedupeKey),
    index("wa_outbox_due_idx").on(table.status, table.nextAttemptAt),
  ],
);

/** Every signed webhook event, once (event_key = wamid or wamid:status). */
export const waInboundEvent = pgTable(
  "wa_inbound_event",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    eventKey: text("event_key").notNull(),
    kind: text("kind").notNull(),
    wamid: text("wamid"),
    fromE164: text("from_e164"),
    payload: jsonb("payload").notNull(),
    orderId: uuid("order_id"),
    result: text("result"),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wa_inbound_event_key_idx").on(table.eventKey),
    index("wa_inbound_event_order_idx").on(table.orderId),
  ],
);

/**
 * Staff queue. type: modify | cancel | free_text | unmatched | failed_send |
 * no_reply_48h | late_reply | ineligible. status: open | in_progress | done | dismissed.
 * At most one OPEN item per (order, type).
 */
export const waReviewItem = pgTable(
  "wa_review_item",
  {
    id: uuid("id")
      .$defaultFn(() => v7())
      .primaryKey(),
    orderId: uuid("order_id"),
    type: text("type").notNull(),
    status: text("status").notNull(),
    customerText: text("customer_text"),
    detail: text("detail"),
    assignedTo: text("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedBy: text("resolved_by"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("wa_review_item_open_idx")
      .on(table.orderId, table.type)
      .where(sql`${table.status} in ('open', 'in_progress')`),
    index("wa_review_item_status_idx").on(table.status, table.createdAt),
  ],
);

/** Single row (id = 1): runtime kill-switch and daily send cap. */
export const waSettings = pgTable("wa_settings", {
  id: integer("id").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  dailySendCap: integer("daily_send_cap").notNull().default(200),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/** Numbers that asked not to be messaged; never messaged automatically again. */
export const waOptOut = pgTable("wa_opt_out", {
  phoneE164: text("phone_e164").primaryKey(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
