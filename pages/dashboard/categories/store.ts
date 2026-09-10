export interface Subcategory {
  id: string;
  name: string;
  products: number[];
}

export interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  subcategories: Subcategory[];
}

export const mockCategories: Category[] = [
  {
    id: "men",
    name: "Men",
    imageUrl: "/assets/men-section.webp",
    subcategories: [
      { id: "men-shirts", name: "Shirts", products: [1] },
      { id: "men-pants", name: "Pants", products: [2] },
      { id: "men-shoes", name: "Shoes", products: [3] },
      { id: "men-accessories", name: "Accessories", products: [] },
    ],
  },
  {
    id: "women",
    name: "Women",
    imageUrl: "/assets/women-section.webp",
    subcategories: [
      { id: "women-dresses", name: "Dresses", products: [] },
      { id: "women-tops", name: "Tops", products: [] },
      { id: "women-accessories", name: "Accessories", products: [] },
    ],
  },
];

export function addCategory(category: Category): void {
  mockCategories.push(category);
}

export function updateCategory(updatedCategory: Category): void {
  const index = mockCategories.findIndex((c) => c.id === updatedCategory.id);
  if (index !== -1) {
    mockCategories[index] = updatedCategory;
  }
}

export function deleteCategory(id: string): void {
  const index = mockCategories.findIndex((c) => c.id === id);
  if (index !== -1) {
    mockCategories.splice(index, 1);
  }
}

export function addSubcategory(
  categoryId: string,
  subcategory: Subcategory
): void {
  const category = mockCategories.find((c) => c.id === categoryId);
  if (category) {
    category.subcategories.push(subcategory);
  }
}

export function updateSubcategory(
  categoryId: string,
  updatedSubcategory: Subcategory
): void {
  const category = mockCategories.find((c) => c.id === categoryId);
  if (category) {
    const index = category.subcategories.findIndex(
      (s) => s.id === updatedSubcategory.id
    );
    if (index !== -1) {
      category.subcategories[index] = updatedSubcategory;
    }
  }
}

export function deleteSubcategory(
  categoryId: string,
  subcategoryId: string
): void {
  const category = mockCategories.find((c) => c.id === categoryId);
  if (category) {
    category.subcategories = category.subcategories.filter(
      (s) => s.id !== subcategoryId
    );
  }
}

export function findCategory(id: string): Category | undefined {
  return mockCategories.find((c) => c.id === id);
}

export function findSubcategory(
  categoryId: string,
  subcategoryId: string
): Subcategory | undefined {
  const category = findCategory(categoryId);
  return category?.subcategories.find((s) => s.id === subcategoryId);
}

export function addProductToSubcategory(
  categoryId: string,
  subcategoryId: string,
  productId: number
): void {
  const subcategory = findSubcategory(categoryId, subcategoryId);
  if (subcategory && !subcategory.products.includes(productId)) {
    subcategory.products.push(productId);
  }
}

export function removeProductFromSubcategory(
  categoryId: string,
  subcategoryId: string,
  productId: number
): void {
  const subcategory = findSubcategory(categoryId, subcategoryId);
  if (subcategory) {
    subcategory.products = subcategory.products.filter(
      (id) => id !== productId
    );
  }
}
