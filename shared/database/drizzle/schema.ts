import {
  boolean,
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
} from "drizzle-orm/pg-core";
import { v7 } from "uuid";

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
  showOnLanding: boolean("show_on_landing").notNull().default(true),
});

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
  /** URL slug, e.g. /shop/synt-aura — nullable so existing rows can be
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
  /** Optional "inspired by" text supporting [color:#hex]text[/color] syntax */
  inspiredBy: text("inspired_by"),
  /** Display order within a category (lower = shown first, null = default) */
  sortOrder: integer("sort_order"),
  /** Fragrance details shown on the product page: character, longevity, when to wear, and top/middle/base notes */
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
  /** Admin-picked product IDs shown in the "Best Layered With" carousel on this product's page. Empty/unset falls back to the automatic category-based suggestions. */
  bestLayeredWithIds: jsonb("best_layered_with_ids")
    .default([])
    .$type<string[]>(),
}, (table) => ({
  slugUnique: uniqueIndex("product_slug_idx").on(table.slug),
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
  subtotal: decimal("subtotal", {
    precision: 10,
    scale: 2,
  }).notNull(),
  shipping: decimal("shipping", {
    precision: 10,
    scale: 2,
  }).notNull(),
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
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
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
  shippingFee: decimal("shipping_fee", {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default("0"),
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
  emailAutomationSettings: jsonb("email_automation_settings").$type<EmailAutomationSettings>(),
  typographySettings: jsonb("typography_settings").$type<TypographySettings>(),
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
   *   { type: "quantity_threshold"; minQuantity: number; productIds?: string[]; categoryIds?: string[]; repeatsPerMultiple?: boolean }
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
