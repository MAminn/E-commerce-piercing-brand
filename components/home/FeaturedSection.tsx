import type React from "react";
import { HomeFeaturedProducts } from "#root/components/template-system/home/HomeFeaturedProducts";
import type { HomeFeaturedProductsProps } from "#root/components/template-system/home/HomeFeaturedProducts";

export interface FeaturedSectionProps extends HomeFeaturedProductsProps {
  description?: string;
}

/**
 * @deprecated Use HomeFeaturedProducts from template-system instead
 * This component is maintained for backward compatibility
 */
export function FeaturedSection(props: FeaturedSectionProps) {
  return <HomeFeaturedProducts {...props} />;
}
