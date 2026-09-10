export const formatCategoryName = (name: string): string => {
  return name.replace(/^(men_|women_|kids_|unisex_)/i, "");
};
