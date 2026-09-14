/**
 * Homepage Content Management Schema
 *
 * This file defines the content structure for the homepage that merchants can edit.
 * Layout and styling are NOT part of this schema - only editable content.
 */

/**
 * Meta information for SEO and page head
 */
export interface HomepageMetaContent {
  enabled: boolean;
  pageTitle: string;
  pageDescription: string;
}

/**
 * A single hero carousel slide
 */
export interface HeroSlideContent {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
  alt?: string;
}

/**
 * Hero section content
 */
export interface HomepageHeroContent {
  enabled: boolean;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  backgroundImage?: string;
  /** Mobile-specific hero background image. Falls back to backgroundImage if empty. */
  mobileBackgroundImage?: string;
  /** Multiple hero carousel slides (takes priority over backgroundImage if non-empty) */
  heroSlides?: HeroSlideContent[];
}

/**
 * Brand statement section content
 */
export interface HomepageBrandStatementContent {
  enabled: boolean;
  title: string;
  description: string;
  image?: string;
}

/**
 * Promotional banner content
 */
export interface HomepagePromoBannerContent {
  enabled: boolean;
  text: string;
  linkText?: string;
  linkUrl?: string;
}

/**
 * Icon types for value propositions
 */
export enum ValuePropIconType {
  SHOPPING = "shopping",
  SHIPPING = "shipping",
  SECURITY = "security",
  SUPPORT = "support",
  QUALITY = "quality",
  RETURNS = "returns",
  PACKAGE = "package",
  BOTTLE = "bottle",
  RECEIPT = "receipt",
  PAYMENT = "payment",
}

/**
 * Single value proposition item
 */
export interface ValuePropItem {
  icon: ValuePropIconType;
  title: string;
  description: string;
}

/**
 * Value propositions section content
 */
export interface HomepageValuePropsContent {
  enabled: boolean;
  items: ValuePropItem[];
}

/**
 * Categories section content
 */
export interface HomepageCategoriesContent {
  enabled: boolean;
  title: string;
  titleAr?: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
}

/**
 * Featured products section content
 */
export interface HomepageFeaturedProductsContent {
  enabled: boolean;
  title: string;
  titleAr?: string;
  subtitle: string;
  viewAllText: string;
  viewAllTextAr?: string;
  viewAllLink: string;
  /** Manually selected product IDs (when set, only these products are shown) */
  productIds?: string[];
}

/**
 * Newsletter subscription section content
 */
export interface HomepageNewsletterContent {
  enabled: boolean;
  title: string;
  subtitle: string;
  placeholderText: string;
  ctaText: string;
  privacyText: string;
}

/**
 * Footer CTA section content
 */
export interface HomepageFooterCtaContent {
  enabled: boolean;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
}

/**
 * Discounted / On-Sale products section content
 */
export interface HomepageDiscountedProductsContent {
  enabled: boolean;
  title: string;
  titleAr?: string;
  viewAllText: string;
  viewAllTextAr?: string;
  viewAllLink: string;
  /** Manually selected product IDs (when set, only these products are shown) */
  productIds?: string[];
}

/**
 * New Arrivals products section content
 */
export interface HomepageNewArrivalsContent {
  enabled: boolean;
  title: string;
  titleAr?: string;
  viewAllText: string;
  viewAllTextAr?: string;
  viewAllLink: string;
  /** Manually selected product IDs (when set, only these products are shown) */
  productIds?: string[];
}

/**
 * Marquee announcement bar content (minimal template)
 */
export interface HomepageMarqueeContent {
  enabled: boolean;
  text: string;
  textAr?: string;
  /** Background color (hex). Defaults to white when unset. */
  backgroundColor?: string;
  /** Text color (hex). Defaults to black when unset. */
  textColor?: string;
}

/**
 * Promo text line for product detail page (minimal template)
 */
export interface HomepagePromoLineContent {
  text: string;
  textAr?: string;
}

/**
 * A single contact page banner slide
 */
export interface ContactBannerSlide {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string;
  alt?: string;
}

/**
 * Contact page banner content (minimal template)
 */
export interface HomepageContactBannerContent {
  enabled: boolean;
  slides: ContactBannerSlide[];
  heading: string;
  headingAr?: string;
  description: string;
  descriptionAr?: string;
  directionsUrl?: string;
}

/**
 * About Us section content
 */
export interface HomepageAboutUsContent {
  enabled: boolean;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  imageUrl?: string;
}

/**
 * Return Policy page step (minimal template)
 */
export interface HomepageReturnPolicyStep {
  icon: ValuePropIconType;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
}

/**
 * Return Policy page detail section (minimal template)
 */
export interface HomepageReturnPolicyDetailSection {
  title: string;
  titleAr?: string;
  body: string;
  bodyAr?: string;
}

/**
 * Return Policy page content (minimal template)
 */
export interface HomepageReturnPolicyContent {
  enabled: boolean;
  title: string;
  titleAr?: string;
  intro: string;
  introAr?: string;
  steps: HomepageReturnPolicyStep[];
  detailSections: HomepageReturnPolicyDetailSection[];
  footerPrefix: string;
  footerPrefixAr?: string;
  supportEmail: string;
  footerMiddle: string;
  footerMiddleAr?: string;
  contactLinkLabel: string;
  contactLinkLabelAr?: string;
  contactLinkUrl: string;
}

/**
 * Complete homepage content structure
 */
export interface HomepageContent {
  meta: HomepageMetaContent;
  hero: HomepageHeroContent;
  brandStatement: HomepageBrandStatementContent;
  promoBanner: HomepagePromoBannerContent;
  categories: HomepageCategoriesContent;
  featuredProducts: HomepageFeaturedProductsContent;
  valueProps: HomepageValuePropsContent;
  newsletter: HomepageNewsletterContent;
  footerCta: HomepageFooterCtaContent;
  discountedProducts?: HomepageDiscountedProductsContent;
  newArrivals?: HomepageNewArrivalsContent;
  marquee?: HomepageMarqueeContent;
  promoLine?: HomepagePromoLineContent;
  contactBanner?: HomepageContactBannerContent;
  /** Bottom carousel slides shown above testimonials (minimal template) */
  bottomCarousel?: {
    enabled: boolean;
    slides: HeroSlideContent[];
  };
  /** About Us section */
  aboutUs?: HomepageAboutUsContent;
  /** Return Policy page (minimal template) */
  returnPolicy?: HomepageReturnPolicyContent;
  /** Product page inline carousel custom title */
  productCarouselTitle?: string;
  productCarouselTitleAr?: string;
  /** CMS-controlled testimonials (minimal template) */
  testimonials?: {
    enabled: boolean;
    title?: string;
    titleAr?: string;
    items: {
      name: string;
      nameAr?: string;
      rating: number;
      review: string;
      reviewAr?: string;
    }[];
  };
}

/**
 * Default homepage content - safe fallback values
 */
export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  meta: {
    enabled: true,
    pageTitle: "Welcome to Our Store",
    pageDescription: "Discover amazing products curated just for you",
  },
  hero: {
    enabled: true,
    title: "Welcome to Our Store",
    subtitle: "Discover amazing products curated just for you",
    ctaText: "Start Shopping",
    ctaLink: "/shop",
    backgroundImage: undefined,
    mobileBackgroundImage: undefined,
    heroSlides: [],
  },
  brandStatement: {
    enabled: true,
    title: "Worn with intention. Designed for life.",
    description:
      "Every piercing is an expression of self. Our pieces are crafted to honor that commitment—refined in form, enduring in quality, and timeless in design.",
    // No default image. This pointed at "/uploads/homepage/brand-statement.jpg",
    // a file that does not exist in this repo — so an unconfigured store
    // rendered a broken-image icon with the heading spilling across it as alt
    // text, both in the hero and in the editorial block. Admins upload a real
    // image from Dashboard > Homepage; until then the block hides.
    image: "",
  },
  promoBanner: {
    // Ships disabled, but the default text was a concrete discount — "Get
    // 20% off your first order!" — that no promo code backs. An admin
    // flipping the toggle on to write their own announcement would have
    // published that offer verbatim.
    enabled: false,
    text: "",
    linkText: "Shop Now",
    linkUrl: "/shop",
  },
  categories: {
    enabled: true,
    title: "Shop by Category",
    subtitle: "Browse our curated selection of product categories",
    ctaText: "View All Categories",
    ctaLink: "/categories",
  },
  featuredProducts: {
    enabled: true,
    title: "Featured Products",
    subtitle: "Check out our handpicked selection of trending products",
    viewAllText: "View All Products",
    viewAllLink: "/shop",
  },
  valueProps: {
    // No default value props.
    //
    // These were three claims a store made about itself before anyone had
    // written a word of copy: "Wide Selection — Discover thousands of
    // products from top brands" (this catalogue has none, and carries no
    // brands), "Fast Delivery — Get your orders delivered quickly with our
    // reliable shipping" (no courier is configured and no delivery time has
    // been set), and "Secure Shopping — Shop with confidence using our secure
    // payment system" (the only payment method is cash on delivery).
    //
    // DEFAULT_HOMEPAGE_CONTENT is merged into whatever the CMS has stored, so
    // these rendered on landing-modern, -classic, -editorial and -noir for
    // any store that had not replaced them. Every one of those templates
    // guards on `items.length > 0`, so an empty list renders nothing at all.
    enabled: true,
    items: [],
  },
  newsletter: {
    enabled: true,
    title: "Stay Updated",
    subtitle: "Subscribe to our newsletter for exclusive deals and updates",
    placeholderText: "Enter your email address",
    ctaText: "Subscribe",
    privacyText: "We respect your privacy. Unsubscribe at any time.",
  },
  footerCta: {
    enabled: true,
    title: "Ready to Start Shopping?",
    // "Join thousands of satisfied customers today" — the store has taken no
    // orders and has no reviews.
    subtitle: "",
    ctaText: "Browse Products",
    ctaLink: "/shop",
  },
  discountedProducts: {
    enabled: true,
    title: "Offers",
    viewAllText: "View All",
    viewAllLink: "/shop",
  },
  newArrivals: {
    enabled: true,
    title: "New Arrivals",
    viewAllText: "View All",
    viewAllLink: "/shop",
  },
  marquee: {
    enabled: false,
    text: "",
  },
  promoLine: {
    text: "",
    textAr: "",
  },
  bottomCarousel: {
    enabled: true,
    slides: [],
  },
  contactBanner: {
    enabled: true,
    slides: [],
    heading: "We Would Love To Hear From You",
    headingAr: "نود أن نسمع منك",
    description:
      "Have a question, feedback, or just want to say hello? Drop us a message and we'll get back to you as soon as possible.",
    descriptionAr:
      "هل لديك سؤال أو ملاحظة أو تريد فقط أن تقول مرحبا؟ أرسل لنا رسالة وسنعود إليك في أقرب وقت ممكن.",
    directionsUrl: "",
  },
  aboutUs: {
    enabled: false,
    title: "About Us",
    titleAr: "من نحن",
    description:
      "Welcome to our store. We are passionate about bringing you the finest products.",
    descriptionAr: "",
    imageUrl: "",
  },
  returnPolicy: {
    // Ships DISABLED. Every term below is placeholder scaffolding for the
    // admin to fill in — the return window, refund timing and exclusions are
    // business facts this store has not established, so /return-policy shows
    // "not available yet" until an admin publishes real terms.
    enabled: false,
    title: "Return Policy",
    titleAr: "سياسة الإرجاع",
    intro:
      "Our return policy has not been published yet. Set it from Dashboard > Homepage > Return Policy before enabling this page.",
    introAr:
      "لم يتم نشر سياسة الإرجاع بعد. يرجى ضبطها من لوحة التحكم قبل تفعيل هذه الصفحة.",
    steps: [
      {
        icon: ValuePropIconType.PACKAGE,
        title: "1. Return Window",
        titleAr: "1. فترة الإرجاع",
        description: "Describe your return window here.",
        descriptionAr: "اكتب هنا فترة الإرجاع المسموح بها.",
      },
      {
        icon: ValuePropIconType.BOTTLE,
        title: "2. Eligible Items",
        titleAr: "2. المنتجات المؤهلة",
        description: "Describe which items can be returned.",
        descriptionAr: "اكتب هنا المنتجات المؤهلة للإرجاع.",
      },
      {
        icon: ValuePropIconType.RECEIPT,
        title: "3. How to Return",
        titleAr: "3. كيفية الإرجاع",
        description: "Describe how a customer starts a return.",
        descriptionAr: "اكتب هنا طريقة بدء عملية الإرجاع.",
      },
      {
        icon: ValuePropIconType.PAYMENT,
        title: "4. Refunds",
        titleAr: "4. المبالغ المستردة",
        description: "Describe how and when refunds are issued.",
        descriptionAr: "اكتب هنا طريقة وموعد استرداد المبالغ.",
      },
    ],
    detailSections: [
      {
        title: "Non-Returnable Items",
        titleAr: "منتجات غير قابلة للإرجاع",
        body: "List any items that cannot be returned.",
        bodyAr: "اكتب هنا المنتجات غير القابلة للإرجاع.",
      },
      {
        title: "Damaged or Wrong Items",
        titleAr: "منتجات تالفة أو خاطئة",
        body: "Describe what a customer should do if an order arrives damaged or incorrect.",
        bodyAr: "اكتب هنا ما يجب فعله عند وصول طلب تالف أو غير صحيح.",
      },
    ],
    footerPrefix:
      "Need help? We're just an email away. Reach out to us at",
    footerPrefixAr: "تحتاج مساعدة؟ نحن على بعد بريد إلكتروني. تواصل معنا على",
    // Empty on purpose — filled from Dashboard > Homepage, or leave blank.
    // Never inherit a previous brand's inbox here.
    supportEmail: "",
    footerMiddle: "or via our",
    footerMiddleAr: "أو عبر",
    contactLinkLabel: "Contact Us page",
    contactLinkLabelAr: "صفحة اتصل بنا",
    contactLinkUrl: "/contact",
  },
  testimonials: {
    // Ships DISABLED with no items. The previous defaults were six invented
    // reviews under invented customer names — publishing those as genuine
    // customer feedback for a store that has never shipped an order is not
    // something we inherit. Admins add real reviews from
    // Dashboard > Homepage > Testimonials; every consumer of this field
    // renders nothing while the list is empty.
    enabled: false,
    title: undefined,
    titleAr: undefined,
    items: [],
  },
};
