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

    // Empty state
    "empty.title": "No products found",
    "empty.subtitle": "Try adjusting your filters or browse our full collection",

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

    // Empty state
    "empty.title": "لا توجد منتجات",
    "empty.subtitle": "حاول تعديل البحث أو تصفح مجموعتنا الكاملة",

    // Pagination
    "pagination.previous": "السابق",
    "pagination.next": "التالي",
    "pagination.page_of": "صفحة {current} من {total}",

    // Product grid
    "products.no_products": "لا توجد منتجات",
  },
} as const;

export type MinimalCategoryKey = keyof (typeof minimalCategoryT)["en"];
