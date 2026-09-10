export interface Order {
  id: number;
  date: string;
  customer: string;
  total: string;
  vendor?: string;
  vendorId?: number;
  status: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled";
}

export const orders: Order[] = [
  {
    id: 10156,
    date: "2023-10-20",
    customer: "John Smith",
    total: "EGP 125.00",
    vendor: "Tech Hub",
    vendorId: 2,
    status: "Processing",
  },
  {
    id: 10155,
    date: "2023-10-19",
    customer: "Emily Johnson",
    total: "EGP 78.50",
    vendor: "Fashion Trends",
    vendorId: 1,
    status: "Shipped",
  },
  {
    id: 10154,
    date: "2023-10-18",
    customer: "David Lee",
    total: "EGP 210.25",
    vendor: "Tech Hub",
    vendorId: 2,
    status: "Delivered",
  },
  {
    id: 10153,
    date: "2023-10-17",
    customer: "Sarah Williams",
    total: "EGP 56.99",
    vendor: "Healthy Foods",
    vendorId: 3,
    status: "Pending",
  },
  {
    id: 10152,
    date: "2023-10-16",
    customer: "Michael Brown",
    total: "EGP 145.20",
    vendor: "Sports World",
    vendorId: 4,
    status: "Cancelled",
  },
];

export const orderStatus = {
  pending: 125,
  processing: 85,
  shipped: 220,
  delivered: 426,
};
