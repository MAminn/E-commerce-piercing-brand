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
    image: "/uploads/homepage/brand-statement.jpg",
  },
  promoBanner: {
    enabled: false,
    text: "🎉 Special Offer: Get 20% off your first order!",
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
    enabled: true,
    items: [
      {
        icon: ValuePropIconType.SHOPPING,
        title: "Wide Selection",
        description: "Discover thousands of products from top brands",
      },
      {
        icon: ValuePropIconType.SHIPPING,
        title: "Fast Delivery",
        description:
          "Get your orders delivered quickly with our reliable shipping",
      },
      {
        icon: ValuePropIconType.SECURITY,
        title: "Secure Shopping",
        description: "Shop with confidence using our secure payment system",
      },
    ],
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
    subtitle: "Join thousands of satisfied customers today",
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
    enabled: true,
    title: "Return Policy",
    titleAr: "سياسة الإرجاع",
    intro:
      "We want you to love every Synt fragrance. If something's not right, we're here to help.",
    introAr:
      "نريدك أن تحب كل عطر من Synt. إذا كان هناك أي مشكلة، نحن هنا لمساعدتك.",
    steps: [
      {
        icon: ValuePropIconType.PACKAGE,
        title: "1. Return Window",
        titleAr: "1. فترة الإرجاع",
        description: "You may return any item within 14 days of delivery.",
        descriptionAr: "يمكنك إرجاع أي منتج خلال 14 يوماً من تاريخ التسليم.",
      },
      {
        icon: ValuePropIconType.BOTTLE,
        title: "2. Eligible Items",
        titleAr: "2. المنتجات المؤهلة",
        description:
          "Items must be unused, unopened, and in original packaging.",
        descriptionAr:
          "يجب أن تكون المنتجات غير مستخدمة، غير مفتوحة، وفي عبوتها الأصلية.",
      },
      {
        icon: ValuePropIconType.RECEIPT,
        title: "3. How to Return",
        titleAr: "3. كيفية الإرجاع",
        description:
          "Contact our support team via email or phone to initiate a return.",
        descriptionAr:
          "تواصل مع فريق الدعم عبر البريد الإلكتروني أو الهاتف لبدء عملية الإرجاع.",
      },
      {
        icon: ValuePropIconType.PAYMENT,
        title: "4. Refunds",
        titleAr: "4. المبالغ المستردة",
        description:
          "Once we receive and inspect your return, we'll process your refund within 5–7 business days.",
        descriptionAr:
          "بمجرد استلامنا وفحص المرتجع، سنعالج استرداد المبلغ خلال 5–7 أيام عمل.",
      },
    ],
    detailSections: [
      {
        title: "Non-Returnable Items",
        titleAr: "منتجات غير قابلة للإرجاع",
        body: "For hygiene and safety reasons, we cannot accept returns on opened fragrance bottles. Gift cards and promotional items are also non-returnable.",
        bodyAr:
          "لأسباب صحية وأمنية، لا نقبل إرجاع زجاجات العطور المفتوحة. بطاقات الهدايا والعروض الترويجية غير قابلة للإرجاع أيضاً.",
      },
      {
        title: "Damaged or Wrong Items",
        titleAr: "منتجات تالفة أو خاطئة",
        body: "If your order arrives damaged or incorrect, please contact us within 48 hours of delivery with photos. We'll arrange a replacement or refund as quickly as possible.",
        bodyAr:
          "إذا وصل طلبك تالفاً أو غير صحيح، يرجى التواصل معنا خلال 48 ساعة من التسليم مع صور. سنرتب استبدالاً أو استرداداً في أسرع وقت ممكن.",
      },
    ],
    footerPrefix:
      "Need help? We're just an email away. Reach out to us at",
    footerPrefixAr: "تحتاج مساعدة؟ نحن على بعد بريد إلكتروني. تواصل معنا على",
    supportEmail: "syntperfumes@gmail.com",
    footerMiddle: "or via our",
    footerMiddleAr: "أو عبر",
    contactLinkLabel: "Contact Us page",
    contactLinkLabelAr: "صفحة اتصل بنا",
    contactLinkUrl: "/contact",
  },
  testimonials: {
    enabled: true,
    title: undefined,
    titleAr: undefined,
    items: [
      {
        name: "Sarah Mitchell",
        nameAr: "نورة العتيبي",
        rating: 5,
        review:
          "Absolutely love the quality! Fast shipping and the product exceeded my expectations. Will definitely order again.",
        reviewAr:
          "من أفضل المنتجات اللي استخدمتها وبصراحة يستاهل أضعاف سعره، جودة عالية وتوصيل سريع.",
      },
      {
        name: "James Cooper",
        nameAr: "محمد المحسن",
        rating: 5,
        review:
          "Excellent shopping experience from start to finish. Customer service was outstanding and the product looks even better in person.",
        reviewAr:
          "تجربة شراء ممتازة من البداية للنهاية، خدمة عملاء رائعة والمنتج طلع أحلى من الصور.",
      },
      {
        name: "Emily Chen",
        nameAr: "فرح أحمد",
        rating: 5,
        review:
          "The attention to detail is remarkable. Premium packaging and the product itself is simply stunning. Highly recommended!",
        reviewAr:
          "تميز وإتقان سواء على مستوى التقديم أو جودة المنتجات، شكراً جزيلاً.",
      },
      {
        name: "David Wilson",
        nameAr: "مهند المري",
        rating: 4,
        review:
          "Fast delivery and solid quality. Returns were effortless when I needed to swap sizes — customer support made it painless.",
        reviewAr:
          "التوصيل سريع والجودة ممتازة، وتجربة الاستبدال كانت سهلة جداً بفضل خدمة العملاء.",
      },
      {
        name: "Olivia Taylor",
        nameAr: "ريم الشمري",
        rating: 5,
        review:
          "Everything was beautifully packaged and presented. The product quality is exceptional — worth every penny.",
        reviewAr:
          "كل شيء كان مرتباً ومغلفاً بشكل أنيق، والمنتج نفسه جودته عالية جداً.",
      },
      {
        name: "Marcus Reyes",
        nameAr: "خالد السبيعي",
        rating: 4,
        review:
          "Great value for the price. Shipping was a day faster than estimated and the item matched the photos exactly.",
        reviewAr:
          "قيمة ممتازة مقابل السعر، الشحن أسرع من المتوقع والمنتج مطابق تماماً للصور.",
      },
    ],
  },
};
