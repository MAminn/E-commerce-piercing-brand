import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCategoryName = (name: string): string => {
  return name.replace(/^(men_|women_|kids_|unisex_)/i, "");
};
