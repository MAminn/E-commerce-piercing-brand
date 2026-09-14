/**
 * Minimal Category Page – i18n translations
 *
 * Edit the EN / AR values below to change every piece of text
 * that appears on the minimal-template category page.
 * No CMS needed — just save and rebuild.
 */

export const minimalCategoryT = {
  en: {
    // Breadcrumbs
    "breadcrumb.home": "Home",
    "breadcrumb.shop": "Shop",

    // Sorting
    "sort.label": "Sort by",
    "sort.featured": "Featured",
    "sort.newest": "New Arrivals",
    "sort.price_asc": "Price: Low to High",
    "sort.price_desc": "Price: High to Low",

    // Search
    "search.placeholder": "Search products...",

    // Result count — driven by the API total, never estimated
    "results.count": "{count} products",

    // Empty state — two distinct cases. "Try adjusting your filters" was the
    // single message for both, on a page that has no filters, and it was also
    // what a brand-new store with zero products showed: advice the shopper
    // cannot act on about controls that are not there.
    "empty.title": "No products found",
    "empty.subtitle": "No products match this search.",
    "empty.clear_search": "Clear search",
    "empty.catalogue.title": "Nothing here yet",
    "empty.catalogue.subtitle": "This collection has no products at the moment.",
    "empty.catalogue.action": "Back to home",

    // Pagination
    "pagination.previous": "Previous",
    "pagination.next": "Next",
    "pagination.page_of": "Page {current} of {total}",

    // Product grid
    "products.no_products": "No products found",
  },

  ar: {
    // Breadcrumbs
    "breadcrumb.home": "الرئيسية",
    "breadcrumb.shop": "المتجر",

    // Sorting
    "sort.label": "ترتيب حسب",
    "sort.featured": "مميز",
    "sort.newest": "وصل حديثاً",
    "sort.price_asc": "السعر: من الأقل إلى الأعلى",
    "sort.price_desc": "السعر: من الأعلى إلى الأقل",

    // Search
    "search.placeholder": "ابحث عن المنتجات...",

    // Result count
    "results.count": "{count} منتج",

    // Empty state
    "empty.title": "لا توجد منتجات",
    "empty.subtitle": "لا توجد منتجات تطابق هذا البحث.",
    "empty.clear_search": "مسح البحث",
    "empty.catalogue.title": "لا يوجد شيء هنا بعد",
    "empty.catalogue.subtitle": "لا توجد منتجات في هذه المجموعة حالياً.",
    "empty.catalogue.action": "العودة للرئيسية",

    // Pagination
    "pagination.previous": "السابق",
    "pagination.next": "التالي",
    "pagination.page_of": "صفحة {current} من {total}",

    // Product grid
    "products.no_products": "لا توجد منتجات",
  },
} as const;

export type MinimalCategoryKey = keyof (typeof minimalCategoryT)["en"];
