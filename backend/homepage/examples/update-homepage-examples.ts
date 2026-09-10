/**
 * Example: How to Update Homepage Content
 *
 * This file demonstrates how merchants/admins can update their homepage content
 * using the tRPC endpoint.
 *
 * NOTE: TypeScript errors in this file are expected until the server is restarted
 * and tRPC client types are regenerated. These are example functions for reference.
 */

// @ts-nocheck - Remove this when tRPC types are generated

import { trpc } from "#root/shared/trpc/client";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { ValuePropIconType } from "#root/shared/types/homepage-content";

// Example 1: Update entire homepage content
async function updateFullHomepage(merchantId: string) {
  const customContent: HomepageContent = {
    meta: {
      enabled: true,
      pageTitle: "My Awesome Store | Best Products Online",
      pageDescription: "Shop the latest products from top vendors worldwide",
    },
    hero: {
      enabled: true,
      title: "Welcome to My Store",
      subtitle: "Your one-stop shop for everything you need",
      ctaText: "Shop Now",
      ctaLink: "/shop",
      backgroundImage: "/uploads/hero-bg.jpg",
    },
    promoBanner: {
      enabled: true,
      text: "🎉 Flash Sale! 50% off everything this weekend!",
      linkText: "Shop Sale",
      linkUrl: "/sale",
    },
    categories: {
      enabled: true,
      title: "Browse Categories",
      subtitle: "Find exactly what you're looking for",
      ctaText: "See All Categories",
      ctaLink: "/categories",
    },
    featuredProducts: {
      enabled: true,
      title: "Hot Deals",
      subtitle: "Limited time offers on popular products",
      viewAllText: "See All Deals",
      viewAllLink: "/deals",
    },
    valueProps: {
      enabled: true,
      items: [
        {
          icon: ValuePropIconType.SHIPPING,
          title: "Free Shipping",
          description: "On orders over EGP 50",
        },
        {
          icon: ValuePropIconType.RETURNS,
          title: "Easy Returns",
          description: "30-day money-back guarantee",
        },
        {
          icon: ValuePropIconType.SUPPORT,
          title: "24/7 Support",
          description: "We're here to help anytime",
        },
      ],
    },
    newsletter: {
      enabled: true,
      title: "Get Exclusive Deals",
      subtitle: "Sign up for our newsletter and never miss a sale",
      placeholderText: "Your email address",
      ctaText: "Subscribe Now",
      privacyText: "We value your privacy. Unsubscribe anytime.",
    },
    footerCta: {
      enabled: true,
      title: "Start Shopping Today",
      subtitle: "Join thousands of happy customers",
      ctaText: "Browse Products",
      ctaLink: "/products",
    },
  };

  const result = await trpc.homepage.updateContent.mutate({
    merchantId,
    content: customContent,
  });

  console.log("Homepage updated:", result);
}

// Example 2: Update only specific sections (merge with existing)
async function updateHeroOnly(merchantId: string) {
  // First, get the current content
  const currentResult = await trpc.homepage.getContent.query({ merchantId });
  const currentContent = currentResult.result;

  // Update only the hero section
  const updatedContent: HomepageContent = {
    ...currentContent,
    hero: {
      enabled: true,
      title: "Summer Sale Is Here!",
      subtitle: "Up to 70% off on selected items",
      ctaText: "Shop Summer Sale",
      ctaLink: "/summer-sale",
      backgroundImage: "/uploads/summer-hero.jpg",
    },
  };

  const result = await trpc.homepage.updateContent.mutate({
    merchantId,
    content: updatedContent,
  });

  console.log("Hero section updated:", result);
}

// Example 3: Disable a section
async function disableNewsletter(merchantId: string) {
  const currentResult = await trpc.homepage.getContent.query({ merchantId });
  const currentContent = currentResult.result;

  const updatedContent: HomepageContent = {
    ...currentContent,
    newsletter: {
      ...currentContent.newsletter,
      enabled: false,
    },
  };

  await trpc.homepage.updateContent.mutate({
    merchantId,
    content: updatedContent,
  });

  console.log("Newsletter section disabled");
}

// Example 4: Add promotional banner
async function enablePromoBanner(merchantId: string) {
  const currentResult = await trpc.homepage.getContent.query({ merchantId });
  const currentContent = currentResult.result;

  const updatedContent: HomepageContent = {
    ...currentContent,
    promoBanner: {
      enabled: true,
      text: "🔥 Black Friday Sale - Everything 40% Off!",
      linkText: "Shop Now",
      linkUrl: "/black-friday",
    },
  };

  await trpc.homepage.updateContent.mutate({
    merchantId,
    content: updatedContent,
  });

  console.log("Promo banner enabled");
}

// Example 5: Customize value propositions
async function customizeValueProps(merchantId: string) {
  const currentResult = await trpc.homepage.getContent.query({ merchantId });
  const currentContent = currentResult.result;

  const updatedContent: HomepageContent = {
    ...currentContent,
    valueProps: {
      enabled: true,
      items: [
        {
          icon: ValuePropIconType.QUALITY,
          title: "Premium Quality",
          description: "Only the finest products from trusted brands",
        },
        {
          icon: ValuePropIconType.SHIPPING,
          title: "Express Delivery",
          description: "Next-day delivery available in select areas",
        },
        {
          icon: ValuePropIconType.SECURITY,
          title: "Secure Checkout",
          description: "Your payment information is always protected",
        },
        {
          icon: ValuePropIconType.SUPPORT,
          title: "Expert Support",
          description: "Our team is here to help with any questions",
        },
      ],
    },
  };

  await trpc.homepage.updateContent.mutate({
    merchantId,
    content: updatedContent,
  });

  console.log("Value propositions customized");
}

// Export functions for use in admin dashboard
export {
  updateFullHomepage,
  updateHeroOnly,
  disableNewsletter,
  enablePromoBanner,
  customizeValueProps,
};
