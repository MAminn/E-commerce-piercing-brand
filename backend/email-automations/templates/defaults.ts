import type { EmailTemplateContent } from "#root/shared/database/drizzle/schema";
import type { EmailAutomationType } from "../queue/service";

export interface DefaultEmailTemplate {
  automationType: EmailAutomationType;
  stepKey: string;
  /** Minutes after the triggering event. 0 = broadcast/on-demand. */
  delayMinutes: number;
  subjectEn: string;
  subjectAr: string;
  preheaderEn: string;
  preheaderAr: string;
  content: EmailTemplateContent;
}

const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * Ships-on-day-one copy for every automation the CMS ships. Admin can
 * override any field per (automationType, stepKey); anything they haven't
 * touched falls back to this. [Store Name] is substituted at render time —
 * see shared/email-tokens.ts for the full token list and their Arabic
 * labels ([اسم المتجر] etc.), which resolve identically.
 */
export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  {
    automationType: "welcome",
    stepKey: "default",
    delayMinutes: 0,
    subjectEn: "Welcome to [Store Name] — enjoy 10% off",
    subjectAr: "أهلاً بك في [اسم المتجر] — خصم 10%",
    preheaderEn: "Thanks for joining. Here's a little something for your first order.",
    preheaderAr: "شكراً لانضمامك. إليك هدية بسيطة لأول طلب لك.",
    content: {
      headlineEn: "Welcome to [Store Name]",
      headlineAr: "أهلاً بك في [اسم المتجر]",
      bodyEn:
        "Thanks so much for joining us. We hope you find something you love — here's 10% off your first order to get you started.",
      bodyAr: "شكراً جزيلاً لانضمامك إلينا. نتمنى أن تجد ما يعجبك — إليك خصم 10% على أول طلب لك.",
      ctaLabelEn: "Shop Now",
      ctaLabelAr: "تسوق الآن",
      ctaHref: "/shop",
      showFeaturedItem: false,
      showReviewStars: false,
      showDiscountCode: true,
      discountBadgeTextEn: "Use code [Discount Code] at checkout",
      discountBadgeTextAr: "استخدم الكود [كود الخصم] عند الدفع",
    },
  },
  {
    automationType: "review_check",
    stepKey: "default",
    delayMinutes: 10 * DAY,
    subjectEn: "So... did you love it?",
    subjectAr: "هل أعجبك ما اشتريته؟",
    preheaderEn: "We'd love to hear what you think.",
    preheaderAr: "يسعدنا معرفة رأيك.",
    content: {
      headlineEn: "So... did you love it?",
      headlineAr: "هل أعجبك ما اشتريته؟",
      bodyEn:
        "Thank you for shopping with us. We'd love to hear what you think of your recent purchase — it only takes a minute.",
      bodyAr: "شكراً لتسوقك معنا. يسعدنا معرفة رأيك في مشترياتك الأخيرة — الأمر لا يستغرق سوى دقيقة.",
      ctaLabelEn: "Leave a Review",
      ctaLabelAr: "أضف تقييمك",
      ctaHref: "/account/orders",
      showFeaturedItem: true,
      showReviewStars: true,
      showDiscountCode: false,
      discountBadgeTextEn: "",
      discountBadgeTextAr: "",
    },
  },
  {
    automationType: "abandoned_cart",
    stepKey: "step1",
    delayMinutes: 1 * HOUR,
    subjectEn: "Forgot something?",
    subjectAr: "هل نسيت شيئاً؟",
    preheaderEn: "You left some products in your cart.",
    preheaderAr: "تركت بعض المنتجات في سلتك.",
    content: {
      headlineEn: "Forgot something?",
      headlineAr: "هل نسيت شيئاً؟",
      bodyEn:
        "We saw that you left some products in your cart. Did you have any questions? Feel free to reply to this email and we'll get back to you as fast as possible.",
      bodyAr: "لاحظنا أنك تركت بعض المنتجات في سلتك. هل لديك أي استفسار؟ لا تتردد بالرد على هذا الإيميل وسنعاود التواصل معك بأسرع وقت.",
      ctaLabelEn: "Return to Cart",
      ctaLabelAr: "العودة إلى السلة",
      ctaHref: "/cart",
      showFeaturedItem: true,
      showReviewStars: false,
      showDiscountCode: false,
      discountBadgeTextEn: "",
      discountBadgeTextAr: "",
    },
  },
  {
    automationType: "abandoned_cart",
    stepKey: "step2",
    delayMinutes: 1 * DAY,
    subjectEn: "Still thinking it over?",
    subjectAr: "ما زلت تفكر؟",
    preheaderEn: "Here's why people love it.",
    preheaderAr: "إليك سبب حب الجميع له.",
    content: {
      headlineEn: "Still thinking it over?",
      headlineAr: "ما زلت تفكر؟",
      bodyEn:
        "Long-lasting, premium ingredients, and free shipping on every order. Your cart is still waiting for you whenever you're ready.",
      bodyAr: "مكونات فاخرة، ثبات طويل، وشحن مجاني على كل طلب. سلتك ما زالت بانتظارك متى ما كنت جاهزاً.",
      ctaLabelEn: "Return to Cart",
      ctaLabelAr: "العودة إلى السلة",
      ctaHref: "/cart",
      showFeaturedItem: true,
      showReviewStars: false,
      showDiscountCode: false,
      discountBadgeTextEn: "",
      discountBadgeTextAr: "",
    },
  },
  {
    automationType: "abandoned_cart",
    stepKey: "step3",
    delayMinutes: 60 * HOUR,
    subjectEn: "Here's 10% off, before it's gone",
    subjectAr: "خصم 10% لك، قبل أن ينتهي",
    preheaderEn: "Complete your order and save.",
    preheaderAr: "أكمل طلبك ووفّر.",
    content: {
      headlineEn: "Here's 10% off, before it's gone",
      headlineAr: "خصم 10% لك، قبل أن ينتهي",
      bodyEn:
        "Your cart is still saved for you. Use the code below before this offer expires.",
      bodyAr: "سلتك ما زالت محفوظة لك. استخدم الكود أدناه قبل انتهاء هذا العرض.",
      ctaLabelEn: "Complete My Order",
      ctaLabelAr: "أكمل طلبي",
      ctaHref: "/cart",
      showFeaturedItem: true,
      showReviewStars: false,
      showDiscountCode: true,
      discountBadgeTextEn: "Use code [Discount Code] before it expires",
      discountBadgeTextAr: "استخدم الكود [كود الخصم] قبل انتهاء العرض",
    },
  },
  {
    automationType: "abandoned_browse",
    stepKey: "default",
    delayMinutes: 1 * DAY,
    subjectEn: "Still thinking about [Product Name]?",
    subjectAr: "ما زلت تفكر في [اسم المنتج]؟",
    preheaderEn: "It's still here, waiting for you.",
    preheaderAr: "ما زال بانتظارك.",
    content: {
      headlineEn: "Still thinking about [Product Name]?",
      headlineAr: "ما زلت تفكر في [اسم المنتج]؟",
      bodyEn: "It caught your eye for a reason. Take another look before it's gone.",
      bodyAr: "لفت انتباهك لسبب ما. ألقِ نظرة أخرى قبل نفاده.",
      ctaLabelEn: "View Product",
      ctaLabelAr: "عرض المنتج",
      ctaHref: "/shop",
      showFeaturedItem: true,
      showReviewStars: false,
      showDiscountCode: false,
      discountBadgeTextEn: "",
      discountBadgeTextAr: "",
    },
  },
  {
    automationType: "win_back",
    stepKey: "default",
    delayMinutes: 90 * DAY,
    subjectEn: "We miss you",
    subjectAr: "اشتقنا لك",
    preheaderEn: "Come back for 15% off.",
    preheaderAr: "عد إلينا واحصل على خصم 15%.",
    content: {
      headlineEn: "We miss you",
      headlineAr: "اشتقنا لك",
      bodyEn: "It's been a while — come try what's new. Here's 15% off to welcome you back.",
      bodyAr: "مرّ وقت طويل — تعال وجرّب ما هو جديد. إليك خصم 15% للترحيب بعودتك.",
      ctaLabelEn: "Shop Now",
      ctaLabelAr: "تسوق الآن",
      ctaHref: "/shop",
      showFeaturedItem: false,
      showReviewStars: false,
      showDiscountCode: true,
      discountBadgeTextEn: "Use code [Discount Code] at checkout",
      discountBadgeTextAr: "استخدم الكود [كود الخصم] عند الدفع",
    },
  },
  {
    automationType: "new_drops",
    stepKey: "default",
    delayMinutes: 0,
    subjectEn: "Meet our newest arrival",
    subjectAr: "تعرّف على أحدث منتجاتنا",
    preheaderEn: "Just dropped.",
    preheaderAr: "وصل حديثاً.",
    content: {
      headlineEn: "Meet our newest arrival",
      headlineAr: "تعرّف على أحدث منتجاتنا",
      bodyEn: "Something new just landed. Be among the first to shop it.",
      bodyAr: "وصل شيء جديد للتو. كن من أوائل من يتسوقه.",
      ctaLabelEn: "Shop the Drop",
      ctaLabelAr: "تسوق الآن",
      ctaHref: "/shop",
      showFeaturedItem: true,
      showReviewStars: false,
      showDiscountCode: false,
      discountBadgeTextEn: "",
      discountBadgeTextAr: "",
    },
  },
  {
    automationType: "flash_offer",
    stepKey: "default",
    delayMinutes: 0,
    subjectEn: "Ends tonight — 20% off",
    subjectAr: "ينتهي الليلة — خصم 20%",
    preheaderEn: "Don't miss out.",
    preheaderAr: "لا تفوّت الفرصة.",
    content: {
      headlineEn: "Ends tonight",
      headlineAr: "ينتهي الليلة",
      bodyEn: "For a limited time only. Shop now before this offer disappears.",
      bodyAr: "لفترة محدودة فقط. تسوق الآن قبل انتهاء هذا العرض.",
      ctaLabelEn: "Shop the Sale",
      ctaLabelAr: "تسوق العرض",
      ctaHref: "/shop",
      showFeaturedItem: false,
      showReviewStars: false,
      showDiscountCode: true,
      discountBadgeTextEn: "Use code [Discount Code] at checkout",
      discountBadgeTextAr: "استخدم الكود [كود الخصم] عند الدفع",
    },
  },
  {
    automationType: "retention",
    stepKey: "default",
    delayMinutes: 0,
    subjectEn: "A few tips, just for you",
    subjectAr: "بعض النصائح، خصيصاً لك",
    preheaderEn: "Get more out of what you own.",
    preheaderAr: "استفد أكثر مما تملك.",
    content: {
      headlineEn: "A few tips, just for you",
      headlineAr: "بعض النصائح، خصيصاً لك",
      bodyEn: "A little guidance to help you get the most out of your favorites.",
      bodyAr: "بعض الإرشادات لمساعدتك على الاستفادة القصوى من مفضلاتك.",
      ctaLabelEn: "Read More",
      ctaLabelAr: "اقرأ المزيد",
      ctaHref: "/shop",
      showFeaturedItem: false,
      showReviewStars: false,
      showDiscountCode: false,
      discountBadgeTextEn: "",
      discountBadgeTextAr: "",
    },
  },
];

export function getDefaultTemplate(
  automationType: EmailAutomationType,
  stepKey: string,
): DefaultEmailTemplate | undefined {
  return DEFAULT_EMAIL_TEMPLATES.find(
    (t) => t.automationType === automationType && t.stepKey === stepKey,
  );
}

/** Every (automationType, stepKey) pair the CMS should always show, even before the admin edits anything. */
export function listAllTemplateKeys(): Array<{
  automationType: EmailAutomationType;
  stepKey: string;
}> {
  return DEFAULT_EMAIL_TEMPLATES.map((t) => ({
    automationType: t.automationType,
    stepKey: t.stepKey,
  }));
}
