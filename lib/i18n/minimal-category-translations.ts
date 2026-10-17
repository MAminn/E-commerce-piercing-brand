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
    "sort.newest": "Newest",
    "sort.price_asc": "Price: Low to High",
    "sort.price_desc": "Price: High to Low",

    // Search
    "search.placeholder": "Search products...",

    // Result count — driven by the API total, never estimated
    "results.count": "{count} products",
    "results.count_one": "1 product",

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
    "empty.filtered.subtitle": "No products match these filters.",
    "empty.clear_filters": "Clear filters",

    // Load failure
    "error.title": "Products couldn't load",
    "error.subtitle": "Check your connection and try again.",
    "error.retry": "Try again",

    // Filters — only dimensions backed by real product fields (see
    // backend/products/listing-facets). Counts come from the server.
    "filter.button": "Filter",
    "filter.title": "Filter",
    "filter.label": "Filter products",
    "filter.category": "Category",
    "filter.price": "Price",
    "filter.availability": "Availability",
    "filter.in_stock": "In stock",
    "filter.offers": "Offers",
    "filter.on_sale": "On sale",
    "filter.min": "Min price",
    "filter.max": "Max price",
    "filter.currency": "EGP",
    "filter.clear_all": "Clear all",
    "filter.apply_count": "Show {count} products",
    "filter.apply_count_one": "Show 1 product",
    "filter.apply_none": "No matching products",
    "filter.close": "Close filters",
    "filter.active": "Active filters",
    "filter.active_count": "{count} active",
    "filter.remove": "Remove filter: {label}",
    "filter.price_from": "From {min}",
    "filter.price_to": "Up to {max}",
    "filter.search_chip": "Search: {q}",
    "filter.includes_all": "Included in {name}",

    // Pagination
    "pagination.previous": "Previous",
    "pagination.next": "Next",
    "pagination.page_of": "Page {current} of {total}",

    // Product grid
    "products.no_products": "No products found",

    // Subcategory tabs ("All · Lobe · Helix …")
    "subnav.label": "Shop by type",
    "subnav.all": "All",
  },

  ar: {
    // Breadcrumbs
    "breadcrumb.home": "الرئيسية",
    "breadcrumb.shop": "المتجر",

    // Sorting
    "sort.label": "ترتيب حسب",
    "sort.featured": "مميز",
    "sort.newest": "الأحدث",
    "sort.price_asc": "السعر: من الأقل إلى الأعلى",
    "sort.price_desc": "السعر: من الأعلى إلى الأقل",

    // Search
    "search.placeholder": "ابحث عن المنتجات...",

    // Result count
    "results.count": "{count} منتج",
    "results.count_one": "منتج واحد",

    // Empty state
    "empty.title": "لا توجد منتجات",
    "empty.subtitle": "لا توجد منتجات تطابق هذا البحث.",
    "empty.clear_search": "مسح البحث",
    "empty.catalogue.title": "لا يوجد شيء هنا بعد",
    "empty.catalogue.subtitle": "لا توجد منتجات في هذه المجموعة حالياً.",
    "empty.catalogue.action": "العودة للرئيسية",
    "empty.filtered.subtitle": "لا توجد منتجات تطابق هذه الفلاتر.",
    "empty.clear_filters": "مسح الفلاتر",

    // Load failure
    "error.title": "تعذر تحميل المنتجات",
    "error.subtitle": "تحقق من اتصالك وحاول مرة أخرى.",
    "error.retry": "حاول مرة أخرى",

    // Filters
    "filter.button": "تصفية",
    "filter.title": "تصفية",
    "filter.label": "تصفية المنتجات",
    "filter.category": "الفئة",
    "filter.price": "السعر",
    "filter.availability": "التوفر",
    "filter.in_stock": "متوفر",
    "filter.offers": "العروض",
    "filter.on_sale": "عليه خصم",
    "filter.min": "أقل سعر",
    "filter.max": "أعلى سعر",
    "filter.currency": "ج.م",
    "filter.clear_all": "مسح الكل",
    "filter.apply_count": "عرض {count} منتج",
    "filter.apply_count_one": "عرض منتج واحد",
    "filter.apply_none": "لا توجد منتجات مطابقة",
    "filter.close": "إغلاق الفلاتر",
    "filter.active": "الفلاتر المفعّلة",
    "filter.active_count": "{count} مفعّل",
    "filter.remove": "إزالة الفلتر: {label}",
    "filter.price_from": "من {min}",
    "filter.price_to": "حتى {max}",
    "filter.search_chip": "بحث: {q}",
    "filter.includes_all": "ضمن {name}",

    // Pagination
    "pagination.previous": "السابق",
    "pagination.next": "التالي",
    "pagination.page_of": "صفحة {current} من {total}",

    // Product grid
    "products.no_products": "لا توجد منتجات",

    // Subcategory tabs
    "subnav.label": "تسوق حسب النوع",
    "subnav.all": "الكل",
  },
} as const;

export type MinimalCategoryKey = keyof (typeof minimalCategoryT)["en"];
