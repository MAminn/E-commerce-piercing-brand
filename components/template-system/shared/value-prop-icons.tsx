import type React from "react";
import {
  ShoppingBag,
  Truck,
  Shield,
  Headphones,
  Award,
  RefreshCw,
  Package,
  FlaskConical,
  Receipt,
  CreditCard,
} from "lucide-react";
import { ValuePropIconType } from "#root/shared/types/homepage-content";

export const VALUE_PROP_ICON_MAP: Record<
  ValuePropIconType,
  React.ComponentType<{ className?: string }>
> = {
  [ValuePropIconType.SHOPPING]: ShoppingBag,
  [ValuePropIconType.SHIPPING]: Truck,
  [ValuePropIconType.SECURITY]: Shield,
  [ValuePropIconType.SUPPORT]: Headphones,
  [ValuePropIconType.QUALITY]: Award,
  [ValuePropIconType.RETURNS]: RefreshCw,
  [ValuePropIconType.PACKAGE]: Package,
  [ValuePropIconType.BOTTLE]: FlaskConical,
  [ValuePropIconType.RECEIPT]: Receipt,
  [ValuePropIconType.PAYMENT]: CreditCard,
};

export function ValuePropIcon({
  icon,
  className,
}: {
  icon: ValuePropIconType;
  className?: string;
}) {
  const IconComponent = VALUE_PROP_ICON_MAP[icon] ?? Award;
  return <IconComponent className={className} />;
}
