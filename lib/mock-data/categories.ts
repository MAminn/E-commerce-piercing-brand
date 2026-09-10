export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  productsCount: number;
  subcategories?: Category[];
}

export const categories: Category[] = [
  {
    id: 1,
    name: "Electronics",
    slug: "electronics",
    description: "Electronic devices and accessories",
    productsCount: 345,
    subcategories: [
      {
        id: 101,
        name: "Smartphones",
        slug: "smartphones",
        description: "Mobile phones and accessories",
        productsCount: 120,
      },
      {
        id: 102,
        name: "Laptops",
        slug: "laptops",
        description: "Laptops and accessories",
        productsCount: 85,
      },
      {
        id: 103,
        name: "Audio",
        slug: "audio",
        description: "Headphones, speakers and audio devices",
        productsCount: 140,
      },
    ],
  },
  {
    id: 2,
    name: "Clothing",
    slug: "clothing",
    description: "Fashion and apparel",
    productsCount: 512,
    subcategories: [
      {
        id: 201,
        name: "Men's Wear",
        slug: "mens-wear",
        description: "Clothing for men",
        productsCount: 210,
      },
      {
        id: 202,
        name: "Women's Wear",
        slug: "womens-wear",
        description: "Clothing for women",
        productsCount: 245,
      },
      {
        id: 203,
        name: "Kids' Wear",
        slug: "kids-wear",
        description: "Clothing for children",
        productsCount: 57,
      },
    ],
  },
  {
    id: 3,
    name: "Home & Kitchen",
    slug: "home-kitchen",
    description: "Home appliances and kitchen essentials",
    productsCount: 278,
    subcategories: [
      {
        id: 301,
        name: "Furniture",
        slug: "furniture",
        description: "Home and office furniture",
        productsCount: 98,
      },
      {
        id: 302,
        name: "Kitchen Appliances",
        slug: "kitchen-appliances",
        description: "Appliances for kitchen",
        productsCount: 112,
      },
      {
        id: 303,
        name: "Home Decor",
        slug: "home-decor",
        description: "Decorative items for home",
        productsCount: 68,
      },
    ],
  },
  {
    id: 4,
    name: "Sports & Outdoors",
    slug: "sports-outdoors",
    description: "Sports equipment and outdoor gear",
    productsCount: 195,
    subcategories: [
      {
        id: 401,
        name: "Fitness",
        slug: "fitness",
        description: "Exercise and fitness equipment",
        productsCount: 75,
      },
      {
        id: 402,
        name: "Outdoor Gear",
        slug: "outdoor-gear",
        description: "Camping and hiking equipment",
        productsCount: 65,
      },
      {
        id: 403,
        name: "Sports Equipment",
        slug: "sports-equipment",
        description: "Equipment for various sports",
        productsCount: 55,
      },
    ],
  },
];
