export interface Customer {
  id: number;
  name: string;
  email: string;
  orders: number;
  totalSpent: number;
  lastOrder: string;
}

export const customers: Customer[] = [
  {
    id: 1,
    name: "John Smith",
    email: "john.smith@example.com",
    orders: 12,
    totalSpent: 1250,
    lastOrder: "2023-10-20",
  },
  {
    id: 2,
    name: "Emily Johnson",
    email: "emily.johnson@example.com",
    orders: 8,
    totalSpent: 785,
    lastOrder: "2023-10-19",
  },
  {
    id: 3,
    name: "David Lee",
    email: "david.lee@example.com",
    orders: 15,
    totalSpent: 2100,
    lastOrder: "2023-10-18",
  },
  {
    id: 4,
    name: "Sarah Williams",
    email: "sarah.williams@example.com",
    orders: 5,
    totalSpent: 570,
    lastOrder: "2023-10-17",
  },
  {
    id: 5,
    name: "Michael Brown",
    email: "michael.brown@example.com",
    orders: 10,
    totalSpent: 1450,
    lastOrder: "2023-10-16",
  },
];

export const vendorDashboardStats = {
  totalProducts: 48,
  totalOrders: 124,
  totalRevenue: 8650,
  totalCustomers: 76,
};
