import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#root/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#root/components/ui/alert-dialog";
import {
  Package,
  Search,
  Filter,
  ChevronDown,
  Eye,
  Loader2,
  Trash2,
  X,
  Truck,
  ExternalLink,
  Send,
  XCircle,
  Lock,
  History,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { usePageContext } from "vike-react/usePageContext";
import { trpc } from "#root/shared/trpc/client";
import { useToast } from "#root/components/ui/use-toast";
import { Pagination } from "#root/components/utils/Pagination";
import { OrderEditPanel } from "./OrderEditPanel";
import { OrderActivityLog } from "./OrderActivityLog";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string;
  name: string;
  discountPrice?: string | null;
  productImage?: string | null;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  subtotal: string;
  shipping: string;
  tax: string;
  discount: string | null;
  promoCodeId: string | null;
  total: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  notes: string | null;
  paymentMethod: "cod" | "stripe" | "paymob";
  paymentStatus:
    | "not_required"
    | "pending"
    | "processing"
    | "paid"
    | "failed"
    | "refunded";
  createdAt: Date;
  updatedAt: Date | null;
  items: OrderItem[];
  // Bosta fields (present only when SYN_BOSTA_KEY is configured)
  bostaDeliveryId?: string | null;
  bostaTrackingNumber?: string | null;
  bostaStatus?: string | null;
  bostaStatusCode?: string | null;
  bostaStatusUpdatedAt?: Date | null;
  bostaSyncStatus?: string | null;
  bostaSyncError?: string | null;
  bostaSyncedAt?: Date | null;
  bostaSyncAttemptedAt?: Date | null;
  /** Online-payment order that reached (or is mid-flight to) Bosta without a confirmed "paid" status */
  hasPaymentIssue?: boolean;
}

export default function Orders() {
  const { clientSession } = usePageContext();
  const isAdmin = clientSession?.role === "admin" || clientSession?.role === "superadmin";
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentIssueOnly, setPaymentIssueOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "yesterday" | "custom"
  >("all");
  const [customDate, setCustomDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orderToDeleteId, setOrderToDeleteId] = useState<string | null>(null);
  const [bostaActionLoading, setBostaActionLoading] = useState<string | null>(null); // orderId being acted on
  const [bostaEnabled, setBostaEnabled] = useState(false);

  const pageSize = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalSales, setTotalSales] = useState(0);

  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    trpc.order.bosta.checkoutIsEnabled
      .query()
      .then((res) => setBostaEnabled(!!res.enabled))
      .catch(() => setBostaEnabled(false));
  }, [isAdmin]);

  // Reset to page 1 when filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchQuery, dateFilter, customDate, paymentIssueOnly]);

  /** Resolves the active date filter into a [from, to) local-day range. */
  const getDateRange = useCallback((): { from?: string; to?: string } => {
    const startOfLocalDay = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };
    if (dateFilter === "today") {
      const from = startOfLocalDay(new Date());
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (dateFilter === "yesterday") {
      const from = startOfLocalDay(new Date());
      from.setDate(from.getDate() - 1);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (dateFilter === "custom" && customDate) {
      const from = startOfLocalDay(new Date(`${customDate}T00:00:00`));
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    return {};
  }, [dateFilter, customDate]);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: {
        limit: number;
        offset: number;
        status?:
          | "pending"
          | "processing"
          | "shipped"
          | "delivered"
          | "cancelled";
        dateFrom?: string;
        dateTo?: string;
        paymentIssueOnly?: boolean;
      } = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };

      if (statusFilter !== "all") {
        params.status = statusFilter as
          | "pending"
          | "processing"
          | "shipped"
          | "delivered"
          | "cancelled";
      }

      const { from, to } = getDateRange();
      if (from) params.dateFrom = from;
      if (to) params.dateTo = to;
      if (paymentIssueOnly) params.paymentIssueOnly = true;

      const result = await trpc.order.view.query(params);

      if (result.success) {
        const items = result.result?.items ?? [];
        setOrders(
          Array.isArray(items)
            ? items.map((order) => {
                const partialOrder = order as Partial<Order>;
                return {
                  ...order,
                  discount: partialOrder.discount || null,
                  promoCodeId: partialOrder.promoCodeId || null,
                } as Order;
              })
            : [],
        );
        setTotal(result.result?.total ?? 0);
        setTotalSales(
          (result.result as { totalSales?: number } | undefined)
            ?.totalSales ?? 0,
        );
      } else {
        setError(result.error || "Failed to fetch orders");
      }
    } catch (err) {
      setError("An error occurred while fetching orders");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page, getDateRange, paymentIssueOnly]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Full-order editing (customer, address, items, money, payment, status, notes)
  const [isEditingOrder, setIsEditingOrder] = useState(false);

  const cancelEditingItems = () => setIsEditingOrder(false);

  const handleOrderSaved = (message: string) => {
    toast({ title: message });
    setIsEditingOrder(false);
    setIsDetailsOpen(false);
    fetchOrders();
  };

  const handleOrderEditError = (message: string) => {
    toast({
      title: "Failed to save order",
      description: message,
      variant: "destructive",
    });
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    setIsUpdating(true);
    try {
      const result = await trpc.order.updateStatus.mutate({
        orderId,
        status: status as
          | "pending"
          | "processing"
          | "shipped"
          | "delivered"
          | "cancelled",
      });

      if (result.success) {
        toast({ title: "Order Status Updated" });
        fetchOrders();

        if (isDetailsOpen) {
          setIsDetailsOpen(false);
        }
      } else {
        setError(result.error || "Failed to update order status");
        toast({
          title: "Update Failed",
          description: result.error || "Could not update order status.",
          variant: "destructive",
        });
      }
    } catch (err) {
      setError("An error occurred while updating order status");
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const sendOrderToBosta = async (orderId: string) => {
    setBostaActionLoading(orderId);
    try {
      const result = await trpc.order.bosta.sendOrder.mutate({ orderId });
      if (result.success) {
        toast({ title: "Sent to Bosta", description: `Tracking: ${(result.result as { trackingNumber: string })?.trackingNumber ?? "—"}` });
        fetchOrders();
        // Refresh selected order data
        const updated = await trpc.order.view.query({ limit: 1, offset: 0 });
        void updated;
        fetchOrders();
      } else {
        toast({ title: "Bosta Error", description: result.error ?? "Failed to send order to Bosta", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Could not send to Bosta", variant: "destructive" });
      console.error(err);
    } finally {
      setBostaActionLoading(null);
    }
  };

  const cancelBostaDelivery = async (orderId: string) => {
    setBostaActionLoading(orderId);
    try {
      const result = await trpc.order.bosta.cancelDelivery.mutate({ orderId });
      if (result.success) {
        toast({ title: "Bosta Delivery Cancelled" });
        fetchOrders();
      } else {
        toast({ title: "Bosta Error", description: result.error ?? "Failed to cancel Bosta delivery", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Could not cancel Bosta delivery", variant: "destructive" });
      console.error(err);
    } finally {
      setBostaActionLoading(null);
    }
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDeleteId) return;

    setIsUpdating(true);
    try {
      const result = await trpc.order.delete.mutate({
        orderId: orderToDeleteId,
      });
      if (result.success) {
        toast({
          title: "Order Deleted",
          description: `Order ${orderToDeleteId.substring(0, 8)}... was deleted.`,
        });
        fetchOrders();
        setOrderToDeleteId(null);
      } else {
        toast({
          title: "Deletion Failed",
          description: result.error || "Could not delete order.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An unexpected error occurred during deletion.",
        variant: "destructive",
      });
      console.error("Delete order error:", err);
    } finally {
      setIsUpdating(false);
      setOrderToDeleteId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.id.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.customerEmail.toLowerCase().includes(query) ||
        order.items?.some((item) => item.name.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "shipped":
        return "bg-purple-100 text-purple-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatPaymentMethod = (method: string) => {
    switch (method) {
      case "cod":
        return "Cash on Delivery";
      case "stripe":
        return "Card (Stripe)";
      case "paymob":
        return "Online (Paymob)";
      default:
        return method;
    }
  };

  const formatPaymentStatus = (status: string) => {
    switch (status) {
      case "not_required":
        return "Not required";
      case "pending":
        return "Awaiting payment";
      case "processing":
        return "Processing";
      case "paid":
        return "Paid";
      case "failed":
        return "Payment failed";
      case "refunded":
        return "Refunded";
      default:
        return status;
    }
  };

  const getPaymentBadgeClass = (method: string) => {
    switch (method) {
      case "cod":
        return "bg-amber-50 text-amber-900 border-amber-200";
      case "stripe":
      case "paymob":
        return "bg-indigo-50 text-indigo-900 border-indigo-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const renderPaymentInfo = (order: Order, compact = false) => (
    <div className={compact ? "flex flex-col gap-0.5" : "space-y-1 text-sm"}>
      <Badge
        variant="outline"
        className={`${getPaymentBadgeClass(order.paymentMethod)} ${compact ? "text-[10px] w-fit" : ""}`}>
        {formatPaymentMethod(order.paymentMethod)}
      </Badge>
      {order.paymentMethod !== "cod" && order.paymentStatus !== "not_required" && (
        <span className={`text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>
          {formatPaymentStatus(order.paymentStatus)}
        </span>
      )}
    </div>
  );

  const getBostaSyncBadge = (order: Order) => {
    const status = order.bostaSyncStatus;
    if (!status) {
      return (
        <span className="text-xs text-muted-foreground">—</span>
      );
    }

    const labels: Record<string, { className: string; label: string }> = {
      sent: { className: "bg-green-100 text-green-800 border-green-200", label: "Sent" },
      failed: { className: "bg-red-100 text-red-800 border-red-200", label: "Failed" },
      pending: { className: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Pending" },
      skipped: { className: "bg-gray-100 text-gray-600 border-gray-200", label: "Skipped" },
      cancelled: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Cancelled" },
    };

    const cfg = labels[status] ?? { className: "bg-gray-100 text-gray-800", label: status };

    return (
      <div className="flex flex-col gap-0.5 items-start">
        <Badge variant="outline" className={`text-[10px] ${cfg.className}`} title={order.bostaSyncError ?? undefined}>
          {cfg.label}
        </Badge>
        {status === "failed" && order.bostaSyncError && (
          <span className="text-[10px] text-red-600 line-clamp-2 max-w-[140px]" title={order.bostaSyncError}>
            {order.bostaSyncError}
          </span>
        )}
        {status === "sent" && order.bostaTrackingNumber && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {order.bostaTrackingNumber}
          </span>
        )}
      </div>
    );
  };

  /**
   * Mirrors the server-side gate in backend/orders/bosta/trpc.ts sendOrder:
   * an online-payment order can only go to Bosta once payment is confirmed
   * paid. COD has nothing to confirm, so it's exempt. This is UI-only
   * guidance — the backend enforces it regardless of what this returns.
   */
  const canSendToBosta = (order: Order) => {
    const isOnlinePayment = order.paymentMethod === "stripe" || order.paymentMethod === "paymob";
    return !isOnlinePayment || order.paymentStatus === "paid";
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const formatRelativeDate = (date: Date) => {
    const d = new Date(date);
    const diffMs = Date.now() - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return d.toLocaleDateString();
  };

  const renderItemThumbStack = (items: OrderItem[] | undefined) => {
    const list = items ?? [];
    const visible = list.slice(0, 3);
    const extra = list.length - visible.length;
    if (list.length === 0) {
      return <span className='text-muted-foreground text-xs'>0</span>;
    }
    return (
      <div className='flex items-center'>
        <div className='flex items-center'>
          {visible.map((it, idx) => (
            <div
              key={it.id}
              className={`relative h-7 w-7 rounded-full border-2 border-background overflow-hidden bg-stone-100 flex items-center justify-center text-[10px] font-medium text-stone-600 ${idx > 0 ? "-ml-2" : ""}`}
              title={it.name}>
              {it.productImage ? (
                <img
                  src={it.productImage}
                  alt={it.name}
                  className='h-full w-full object-cover'
                />
              ) : (
                <span>{(it.name || "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
          ))}
        </div>
        {extra > 0 && (
          <span className='ml-2 inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600'>
            +{extra}
          </span>
        )}
        <span className='ml-2 text-xs text-muted-foreground'>
          {list.reduce((sum, it) => sum + (it.quantity ?? 1), 0)}
        </span>
      </div>
    );
  };

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  return (
    <AlertDialog>
      <div className='p-6 space-y-6 w-full h-full'>
        <div className='flex justify-center lg:justify-between items-center flex-wrap gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-center lg:text-left'>
              Orders
            </h1>
            <p className='text-muted-foreground text-center lg:text-left'>
              Track and manage your store's orders
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <div className='flex flex-col gap-4 md:flex-row justify-between'>
              <div className='flex items-center gap-2 w-full md:w-1/3'>
                <Search className='h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search orders...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='h-9'
                />
              </div>
              <div className='flex flex-col gap-3 sm:flex-row'>
                <div className='flex items-center gap-2'>
                  <Filter className='h-4 w-4 text-muted-foreground' />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className='h-9 w-[180px]'>
                      <SelectValue placeholder='Filter by status' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Statuses</SelectItem>
                      <SelectItem value='pending'>Pending</SelectItem>
                      <SelectItem value='processing'>Processing</SelectItem>
                      <SelectItem value='shipped'>Shipped</SelectItem>
                      <SelectItem value='delivered'>Delivered</SelectItem>
                      <SelectItem value='cancelled'>Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='flex items-center gap-2'>
                  <Select
                    value={dateFilter}
                    onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
                    <SelectTrigger className='h-9 w-[160px]'>
                      <SelectValue placeholder='Filter by date' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Time</SelectItem>
                      <SelectItem value='today'>Today</SelectItem>
                      <SelectItem value='yesterday'>Yesterday</SelectItem>
                      <SelectItem value='custom'>Specific day…</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateFilter === "custom" && (
                    <Input
                      type='date'
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className='h-9 w-[160px]'
                    />
                  )}
                </div>
                <Button
                  type='button'
                  size='sm'
                  variant={paymentIssueOnly ? "destructive" : "outline"}
                  className='h-9 gap-1.5'
                  title='Online-payment orders that reached (or are mid-flight to) Bosta without a confirmed "paid" status'
                  onClick={() => setPaymentIssueOnly((v) => !v)}>
                  <AlertTriangle className='h-3.5 w-3.5' />
                  Payment Issues
                </Button>
              </div>
            </div>
            {paymentIssueOnly && (
              <p className='text-sm text-muted-foreground pt-2'>
                Showing online-payment orders sent to Bosta (or mid-send)
                without a confirmed payment —{" "}
                <span className='font-semibold text-foreground'>{total}</span>{" "}
                found.
              </p>
            )}
            {dateFilter !== "all" && (
              <p className='text-sm text-muted-foreground pt-2'>
                Sales for{" "}
                {dateFilter === "today"
                  ? "today"
                  : dateFilter === "yesterday"
                    ? "yesterday"
                    : customDate}
                : <span className='font-semibold text-foreground'>{totalSales.toFixed(2)} EGP</span>{" "}
                across {total} order{total === 1 ? "" : "s"}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='text-center py-10'>
                <Loader2 className='mx-auto h-12 w-12 text-muted-foreground animate-spin' />
                <h3 className='mt-4 text-lg font-semibold'>
                  Loading orders...
                </h3>
              </div>
            ) : error ? (
              <div className='text-center py-10 text-red-500'>
                <p>{error}</p>
                <Button
                  variant='outline'
                  className='mt-4'
                  onClick={fetchOrders}>
                  Try Again
                </Button>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className='text-center py-10'>
                <Package className='mx-auto h-12 w-12 text-muted-foreground' />
                <h3 className='mt-4 text-lg font-semibold'>No orders found</h3>
                <p className='mt-2 text-muted-foreground'>
                  {searchQuery || statusFilter !== "all"
                    ? "Try adjusting your filters"
                    : "When you receive orders, they'll appear here"}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className='hidden md:block overflow-x-auto'>
                  <Table>
                    <TableHeader className='sticky top-0 bg-background z-10'>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        {bostaEnabled && isAdmin && (
                          <TableHead>Bosta</TableHead>
                        )}
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow
                          key={order.id}
                          className={`hover:bg-muted/50 ${order.hasPaymentIssue ? "bg-red-50/60" : ""}`}>
                          <TableCell className='font-mono text-xs py-2'>
                            <div className='flex items-center gap-1.5'>
                              {order.hasPaymentIssue && (
                                <AlertTriangle
                                  className='h-3.5 w-3.5 text-red-600 shrink-0'
                                  aria-label='Sent to Bosta without confirmed payment'
                                />
                              )}
                              {order.id.slice(0, 8)}
                            </div>
                          </TableCell>
                          <TableCell className='py-2'>
                            {formatDate(order.createdAt)}
                          </TableCell>
                          <TableCell className='py-2'>
                            {order.customerName}
                          </TableCell>
                          <TableCell className='py-2'>
                            {renderItemThumbStack(order.items)}
                          </TableCell>
                          <TableCell className='py-2'>
                            {Number.parseFloat(order.total).toFixed(2)} EGP
                            {order.discount &&
                              Number.parseFloat(order.discount) > 0 && (
                                <div className='text-xs text-green-600'>
                                  <span>
                                    -
                                    {Number.parseFloat(order.discount).toFixed(
                                      2,
                                    )}{" "}
                                    EGP discount
                                  </span>
                                </div>
                              )}
                          </TableCell>
                          <TableCell className='py-2'>
                            {renderPaymentInfo(order, true)}
                          </TableCell>
                          <TableCell className='py-2'>
                            <Badge
                              variant='outline'
                              className={getStatusColor(order.status)}>
                              {order.status.charAt(0).toUpperCase() +
                                order.status.slice(1)}
                            </Badge>
                          </TableCell>
                          {bostaEnabled && isAdmin && (
                            <TableCell className='py-2'>
                              {getBostaSyncBadge(order)}
                            </TableCell>
                          )}
                          <TableCell className='text-right py-2'>
                            <div className='flex items-center gap-2 justify-end'>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => handleViewDetails(order)}>
                                <Eye className='h-4 w-4' />
                                <span className='sr-only'>View Details</span>
                              </Button>
                              {isAdmin && (
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant='destructive'
                                    size='sm'
                                    onClick={() => setOrderToDeleteId(order.id)}
                                    disabled={isUpdating}>
                                    <Trash2 className='h-4 w-4' />
                                    <span className='sr-only'>
                                      Delete Order
                                    </span>
                                  </Button>
                                </AlertDialogTrigger>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card list */}
                <div className='md:hidden block space-y-3'>
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className={`rounded-lg border bg-card p-4 shadow-sm ${order.hasPaymentIssue ? "bg-red-50/60 border-red-200" : ""}`}>
                      <div className='flex items-center justify-between'>
                        <span className='font-mono text-xs text-muted-foreground flex items-center gap-1.5'>
                          {order.hasPaymentIssue && (
                            <AlertTriangle
                              className='h-3.5 w-3.5 text-red-600 shrink-0'
                              aria-label='Sent to Bosta without confirmed payment'
                            />
                          )}
                          #{order.id.slice(0, 8)}
                        </span>
                        <span className='text-xs text-muted-foreground'>
                          {formatRelativeDate(order.createdAt)}
                        </span>
                      </div>
                      <div className='mt-2 font-medium'>
                        {order.customerName}
                      </div>
                      <div className='mt-1 text-sm text-muted-foreground'>
                        {(() => {
                          const totalQty =
                            order.items?.reduce(
                              (sum, it) => sum + (it.quantity ?? 1),
                              0,
                            ) ?? 0;
                          return (
                            <>
                              {totalQty} item{totalQty === 1 ? "" : "s"}
                            </>
                          );
                        })()}
                        {" · "}
                        {Number.parseFloat(order.total).toFixed(2)} EGP
                      </div>
                      <div className='mt-2'>{renderPaymentInfo(order, true)}</div>
                      <div className='mt-2 flex items-center justify-between gap-2 flex-wrap'>
                        <Badge
                          variant='outline'
                          className={getStatusColor(order.status)}>
                          {order.status.charAt(0).toUpperCase() +
                            order.status.slice(1)}
                        </Badge>
                        {bostaEnabled && isAdmin && getBostaSyncBadge(order)}
                        <div className='flex items-center gap-1 ml-auto'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => handleViewDetails(order)}>
                            <Eye className='h-4 w-4' />
                            <span className='sr-only'>View Details</span>
                          </Button>
                          {isAdmin && (
                            <AlertDialogTrigger asChild>
                              <Button
                                variant='destructive'
                                size='sm'
                                onClick={() => setOrderToDeleteId(order.id)}
                                disabled={isUpdating}>
                                <Trash2 className='h-4 w-4' />
                                <span className='sr-only'>Delete Order</span>
                              </Button>
                            </AlertDialogTrigger>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className='border-t px-6 py-4'>
            {(() => {
              const totalPages = Math.max(1, Math.ceil(total / pageSize));
              const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
              const end = Math.min(page * pageSize, total);
              return (
                <div className='flex items-center justify-between w-full gap-3 text-xs text-muted-foreground'>
                  <div>
                    Showing {start}–{end} of {total} orders
                  </div>
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  )}
                </div>
              );
            })()}
          </CardFooter>
        </Card>

        <Dialog
          open={isDesktop && isDetailsOpen}
          onOpenChange={(open) => {
            setIsDetailsOpen(open);
            if (!open) cancelEditingItems();
          }}>
          <DialogContent className='sm:max-w-5xl max-h-[90vh] overflow-y-auto'>
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {isEditingOrder ? "Edit Order" : "Order Details"}
                  </DialogTitle>
                  <DialogDescription>
                    Order ID: {selectedOrder.id}
                  </DialogDescription>
                </DialogHeader>

                {selectedOrder.hasPaymentIssue && (
                  <div className='flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'>
                    <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
                    <p>
                      This order reached Bosta (or is mid-send) without a
                      confirmed payment — its {selectedOrder.paymentMethod}{" "}
                      payment is currently{" "}
                      <span className='font-semibold'>
                        {selectedOrder.paymentStatus}
                      </span>
                      . Check the Activity Log below for how this happened.
                    </p>
                  </div>
                )}

                {isAdmin && isEditingOrder ? (
                  <OrderEditPanel
                    key={`edit-${selectedOrder.id}`}
                    order={selectedOrder}
                    onCancel={cancelEditingItems}
                    onSaved={handleOrderSaved}
                    onError={handleOrderEditError}
                  />
                ) : (
                <>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 my-4'>
                  <div>
                    <h3 className='font-medium text-sm mb-2'>
                      Customer Information
                    </h3>
                    <div className='space-y-1 text-sm'>
                      <p>
                        <span className='font-medium'>Name:</span>{" "}
                        {selectedOrder.customerName}
                      </p>
                      <p>
                        <span className='font-medium'>Email:</span>{" "}
                        {selectedOrder.customerEmail || "N/A"}
                      </p>
                      <p>
                        <span className='font-medium'>Phone:</span>{" "}
                        {selectedOrder.customerPhone}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className='font-medium text-sm mb-2'>
                      Shipping Address
                    </h3>
                    <div className='space-y-1 text-sm'>
                      <p>{selectedOrder.shippingAddress}</p>
                      <p>
                        {selectedOrder.shippingCity}
                        {selectedOrder.shippingState
                          ? `, ${selectedOrder.shippingState}`
                          : ""}
                        {selectedOrder.shippingPostalCode
                          ? ` ${selectedOrder.shippingPostalCode}`
                          : ""}
                      </p>
                      <p>{selectedOrder.shippingCountry || "N/A"}</p>
                    </div>
                  </div>
                </div>

                <div className='my-4'>
                  <div className='flex items-center justify-between mb-2'>
                    <h3 className='font-medium text-sm'>Order Items</h3>
                    {isAdmin && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setIsEditingOrder(true)}>
                        Edit Order
                      </Button>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className='flex items-center gap-3'>
                              <div className='h-12 w-12 rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-sm font-medium text-stone-600 shrink-0'>
                                {item.productImage ? (
                                  <img
                                    src={item.productImage}
                                    alt={item.name}
                                    className='h-full w-full object-cover'
                                  />
                                ) : (
                                  <span>
                                    {(item.name || "?").charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <span>{item.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            {item.discountPrice ? (
                              <>
                                <span className='line-through text-gray-500'>
                                  {Number.parseFloat(item.price).toFixed(2)} EGP
                                </span>
                                <span className='text-red-600 block'>
                                  {Number.parseFloat(
                                    item.discountPrice,
                                  ).toFixed(2)}{" "}
                                  EGP
                                </span>
                              </>
                            ) : (
                              <>
                                {Number.parseFloat(item.price).toFixed(2)} EGP
                              </>
                            )}
                          </TableCell>
                          <TableCell>
                            {(
                              Number.parseFloat(
                                item.discountPrice || item.price,
                              ) * item.quantity
                            ).toFixed(2)}{" "}
                            EGP
                          </TableCell>
                        </TableRow>
                      )) || (
                        <TableRow>
                          <TableCell
                            colSpan={isAdmin ? 5 : 4}
                            className='text-center text-muted-foreground'>
                            No items found for this order.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className='flex justify-between items-start my-4'>
                  <div>
                    <h3 className='font-medium text-sm mb-2'>Payment</h3>
                    {renderPaymentInfo(selectedOrder)}
                  </div>

                  <div>
                    <h3 className='font-medium text-sm mb-2'>Order Status</h3>
                    <div className='flex items-center gap-3'>
                      <Badge className={getStatusColor(selectedOrder.status)}>
                        {selectedOrder.status.charAt(0).toUpperCase() +
                          selectedOrder.status.slice(1)}
                      </Badge>

                      {isAdmin && (
                        <Select
                          disabled={isUpdating}
                          onValueChange={(value) =>
                            updateOrderStatus(selectedOrder.id, value)
                          }>
                          <SelectTrigger className='h-8 w-[160px]'>
                            <SelectValue placeholder='Update status' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='pending'>Pending</SelectItem>
                            <SelectItem value='processing'>
                              Processing
                            </SelectItem>
                            <SelectItem value='shipped'>Shipped</SelectItem>
                            <SelectItem value='delivered'>Delivered</SelectItem>
                            <SelectItem value='cancelled'>Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  <div className='text-right'>
                    <h3 className='font-medium text-sm mb-2'>Order Summary</h3>
                    <div className='space-y-1 text-sm'>
                      <div className='flex justify-between'>
                        <span className='font-medium'>Subtotal:</span>
                        <span>
                          {Number.parseFloat(selectedOrder.subtotal).toFixed(2)}{" "}
                          EGP
                        </span>
                      </div>

                      {selectedOrder.discount &&
                        Number.parseFloat(selectedOrder.discount) > 0 && (
                          <div className='flex justify-between'>
                            <span className='font-medium text-green-600'>
                              Discount:
                            </span>
                            <span className='text-green-600'>
                              -
                              {Number.parseFloat(
                                selectedOrder.discount,
                              ).toFixed(2)}{" "}
                              EGP
                            </span>
                          </div>
                        )}

                      <div className='flex justify-between'>
                        <span className='font-medium'>Shipping:</span>
                        <span>
                          {Number.parseFloat(selectedOrder.shipping).toFixed(2)}{" "}
                          EGP
                        </span>
                      </div>

                      <div className='flex justify-between font-bold'>
                        <span>Total:</span>
                        <span>
                          {Number.parseFloat(selectedOrder.total).toFixed(2)}{" "}
                          EGP
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Bosta Delivery Panel ── */}
                {bostaEnabled && isAdmin && (
                  <div className='my-4 border-t pt-4'>
                    <div className='flex items-center justify-between mb-3'>
                      <h3 className='font-medium text-sm flex items-center gap-2'>
                        <Truck className='w-4 h-4 text-orange-500' />
                        Bosta Delivery
                      </h3>
                      <div className='flex items-center gap-2'>
                        {selectedOrder.bostaSyncStatus !== "sent" && !selectedOrder.bostaDeliveryId ? (
                          canSendToBosta(selectedOrder) ? (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs gap-1'
                              disabled={bostaActionLoading === selectedOrder.id}
                              onClick={() => sendOrderToBosta(selectedOrder.id)}>
                              {bostaActionLoading === selectedOrder.id ? (
                                <Loader2 className='w-3 h-3 animate-spin' />
                              ) : (
                                <Send className='w-3 h-3' />
                              )}
                              Send to Bosta
                            </Button>
                          ) : (
                            <span
                              title='Online payment must be confirmed paid before this order can be sent to Bosta'
                              className='inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1'>
                              <Lock className='w-3 h-3' />
                              Awaiting payment
                            </span>
                          )
                        ) : selectedOrder.bostaDeliveryId ? (
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-7 text-xs gap-1 text-destructive hover:text-destructive'
                            disabled={bostaActionLoading === selectedOrder.id}
                            onClick={() => cancelBostaDelivery(selectedOrder.id)}>
                            {bostaActionLoading === selectedOrder.id ? (
                              <Loader2 className='w-3 h-3 animate-spin' />
                            ) : (
                              <XCircle className='w-3 h-3' />
                            )}
                            Cancel Delivery
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {/* Sync audit trail */}
                    <div className='mb-3 rounded-lg border bg-muted/30 p-3 space-y-2 text-sm'>
                      <div className='flex items-center justify-between'>
                        <span className='text-muted-foreground font-medium'>Sync status</span>
                        {getBostaSyncBadge(selectedOrder)}
                      </div>
                      {selectedOrder.bostaSyncAttemptedAt && (
                        <div className='flex items-center justify-between'>
                          <span className='text-muted-foreground font-medium'>Last attempt</span>
                          <span className='text-xs text-muted-foreground'>
                            {new Date(selectedOrder.bostaSyncAttemptedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {selectedOrder.bostaSyncedAt && (
                        <div className='flex items-center justify-between'>
                          <span className='text-muted-foreground font-medium'>Sent at</span>
                          <span className='text-xs text-muted-foreground'>
                            {new Date(selectedOrder.bostaSyncedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {selectedOrder.bostaSyncError && (
                        <div className='rounded-md bg-red-50 border border-red-100 p-2 text-xs text-red-700 break-words'>
                          <span className='font-semibold'>Error: </span>
                          {selectedOrder.bostaSyncError}
                        </div>
                      )}
                    </div>

                    {selectedOrder.bostaTrackingNumber ? (
                      <div className='bg-orange-50 border border-orange-100 rounded-lg p-3 space-y-2 text-sm'>
                        <div className='flex items-center justify-between'>
                          <span className='text-muted-foreground font-medium'>Tracking #</span>
                          <div className='flex items-center gap-1.5'>
                            <span className='font-mono font-semibold text-orange-700'>
                              {selectedOrder.bostaTrackingNumber}
                            </span>
                            <a
                              href={`https://bosta.co/tracking-shipment?track=${selectedOrder.bostaTrackingNumber}&lang=en`}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='text-orange-500 hover:text-orange-700'>
                              <ExternalLink className='w-3.5 h-3.5' />
                            </a>
                          </div>
                        </div>
                        {selectedOrder.bostaStatus && (
                          <div className='flex items-center justify-between'>
                            <span className='text-muted-foreground font-medium'>Delivery status</span>
                            <Badge className='bg-orange-100 text-orange-800 border-orange-200 text-xs'>
                              {selectedOrder.bostaStatus.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        )}
                        {selectedOrder.bostaStatusUpdatedAt && (
                          <div className='flex items-center justify-between'>
                            <span className='text-muted-foreground font-medium'>Status updated</span>
                            <span className='text-xs text-muted-foreground'>
                              {new Date(selectedOrder.bostaStatusUpdatedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        {selectedOrder.bostaSyncStatus === "failed"
                          ? "Last send attempt failed — use the button above to retry."
                          : selectedOrder.bostaSyncStatus === "skipped"
                            ? "Auto-send was skipped for this order (e.g. online payment pending)."
                            : "No Bosta delivery created yet. Use the button above to push this order."}
                      </p>
                    )}
                  </div>
                )}

                {selectedOrder.notes && (
                  <div className='my-4 border-t pt-4'>
                    <h3 className='font-medium text-sm mb-2'>Order Notes</h3>
                    <p className='text-sm text-muted-foreground'>
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                {/* ── Activity Log ── */}
                {isAdmin && (
                  <div className='my-4 border-t pt-4'>
                    <h3 className='font-medium text-sm mb-3 flex items-center gap-2'>
                      <History className='w-4 h-4 text-muted-foreground' />
                      Activity Log
                    </h3>
                    <OrderActivityLog orderId={selectedOrder.id} />
                  </div>
                )}

                <DialogFooter>
                  <Button
                    variant='outline'
                    onClick={() => setIsDetailsOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
                </>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Mobile order details — Sheet */}
        <Sheet
          open={!isDesktop && isDetailsOpen}
          onOpenChange={(open) => {
            setIsDetailsOpen(open);
            if (!open) cancelEditingItems();
          }}>
          <SheetContent
            side='bottom'
            className='h-dvh max-h-dvh p-0 flex flex-col'>
            {selectedOrder && (
              <>
                <SheetHeader className='border-b sticky top-0 bg-background z-10 relative pr-14'>
                  <SheetTitle>
                    {isEditingOrder ? "Edit Order" : "Order Details"}
                  </SheetTitle>
                  <p className='text-xs text-muted-foreground font-mono'>
                    {selectedOrder.id}
                  </p>
                  <SheetClose
                    type='button'
                    aria-label='Close'
                    className='absolute top-3 right-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring'>
                    <X className='h-5 w-5' />
                  </SheetClose>
                </SheetHeader>

                {isAdmin && isEditingOrder ? (
                  <div className='flex-1 overflow-y-auto p-4'>
                    <OrderEditPanel
                      key={`edit-mobile-${selectedOrder.id}`}
                      order={selectedOrder}
                      onCancel={cancelEditingItems}
                      onSaved={handleOrderSaved}
                      onError={handleOrderEditError}
                    />
                  </div>
                ) : (
                <>
                <div className='flex-1 overflow-y-auto p-4 space-y-6'>
                  {selectedOrder.hasPaymentIssue && (
                    <div className='flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'>
                      <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
                      <p>
                        This order reached Bosta (or is mid-send) without a
                        confirmed payment — its {selectedOrder.paymentMethod}{" "}
                        payment is currently{" "}
                        <span className='font-semibold'>
                          {selectedOrder.paymentStatus}
                        </span>
                        . Check the Activity Log below.
                      </p>
                    </div>
                  )}
                  <div>
                    <h3 className='font-medium text-sm mb-2'>
                      Customer Information
                    </h3>
                    <div className='space-y-1 text-sm'>
                      <p>
                        <span className='font-medium'>Name:</span>{" "}
                        {selectedOrder.customerName}
                      </p>
                      <p>
                        <span className='font-medium'>Email:</span>{" "}
                        {selectedOrder.customerEmail || "N/A"}
                      </p>
                      <p>
                        <span className='font-medium'>Phone:</span>{" "}
                        {selectedOrder.customerPhone}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className='font-medium text-sm mb-2'>
                      Shipping Address
                    </h3>
                    <div className='space-y-1 text-sm'>
                      <p>{selectedOrder.shippingAddress}</p>
                      <p>
                        {selectedOrder.shippingCity}
                        {selectedOrder.shippingState
                          ? `, ${selectedOrder.shippingState}`
                          : ""}
                        {selectedOrder.shippingPostalCode
                          ? ` ${selectedOrder.shippingPostalCode}`
                          : ""}
                      </p>
                      <p>{selectedOrder.shippingCountry || "N/A"}</p>
                    </div>
                  </div>

                  <div>
                    <div className='flex items-center justify-between mb-2'>
                      <h3 className='font-medium text-sm'>Order Items</h3>
                      {isAdmin && (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setIsEditingOrder(true)}>
                          Edit Order
                        </Button>
                      )}
                    </div>
                    <div className='space-y-3'>
                      {selectedOrder.items?.map((item) => {
                        const unit = Number.parseFloat(
                          item.discountPrice || item.price,
                        );
                        return (
                          <div
                            key={item.id}
                            className='flex items-center gap-3'>
                            <div className='h-14 w-14 rounded-md overflow-hidden bg-stone-100 flex items-center justify-center text-sm font-medium text-stone-600 shrink-0'>
                              {item.productImage ? (
                                <img
                                  src={item.productImage}
                                  alt={item.name}
                                  className='h-full w-full object-cover'
                                />
                              ) : (
                                <span>
                                  {(item.name || "?").charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className='min-w-0 flex-1'>
                              <p className='text-sm font-medium truncate'>
                                {item.name}
                              </p>
                              <p className='text-xs text-muted-foreground'>
                                {item.quantity} × {unit.toFixed(2)} ={" "}
                                {(unit * item.quantity).toFixed(2)} EGP
                              </p>
                            </div>
                          </div>
                        );
                      }) || (
                        <p className='text-sm text-muted-foreground text-center'>
                          No items found for this order.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className='font-medium text-sm mb-2'>Payment</h3>
                    {renderPaymentInfo(selectedOrder)}
                  </div>

                  <div>
                    <h3 className='font-medium text-sm mb-2'>Order Status</h3>
                    <div className='flex items-center gap-3 flex-wrap'>
                      <Badge className={getStatusColor(selectedOrder.status)}>
                        {selectedOrder.status.charAt(0).toUpperCase() +
                          selectedOrder.status.slice(1)}
                      </Badge>
                      {isAdmin && (
                        <Select
                          disabled={isUpdating}
                          onValueChange={(value) =>
                            updateOrderStatus(selectedOrder.id, value)
                          }>
                          <SelectTrigger className='h-8 w-[160px]'>
                            <SelectValue placeholder='Update status' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='pending'>Pending</SelectItem>
                            <SelectItem value='processing'>
                              Processing
                            </SelectItem>
                            <SelectItem value='shipped'>Shipped</SelectItem>
                            <SelectItem value='delivered'>Delivered</SelectItem>
                            <SelectItem value='cancelled'>Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className='font-medium text-sm mb-2'>Order Summary</h3>
                    <div className='space-y-1 text-sm'>
                      <div className='flex justify-between'>
                        <span className='font-medium'>Subtotal</span>
                        <span>
                          {Number.parseFloat(selectedOrder.subtotal).toFixed(2)}{" "}
                          EGP
                        </span>
                      </div>
                      {selectedOrder.discount &&
                        Number.parseFloat(selectedOrder.discount) > 0 && (
                          <div className='flex justify-between text-green-600'>
                            <span className='font-medium'>Discount</span>
                            <span>
                              -
                              {Number.parseFloat(
                                selectedOrder.discount,
                              ).toFixed(2)}{" "}
                              EGP
                            </span>
                          </div>
                        )}
                      <div className='flex justify-between'>
                        <span className='font-medium'>Shipping</span>
                        <span>
                          {Number.parseFloat(selectedOrder.shipping).toFixed(2)}{" "}
                          EGP
                        </span>
                      </div>
                      <div className='flex justify-between font-bold pt-1 border-t'>
                        <span>Total</span>
                        <span>
                          {Number.parseFloat(selectedOrder.total).toFixed(2)}{" "}
                          EGP
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Bosta Delivery Panel (mobile sheet) ── */}
                  {bostaEnabled && isAdmin && (
                    <div>
                      <div className='flex items-center justify-between mb-2'>
                        <h3 className='font-medium text-sm flex items-center gap-2'>
                          <Truck className='w-4 h-4 text-orange-500' />
                          Bosta Delivery
                        </h3>
                        {selectedOrder.bostaSyncStatus !== "sent" && !selectedOrder.bostaDeliveryId ? (
                          canSendToBosta(selectedOrder) ? (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs gap-1'
                              disabled={bostaActionLoading === selectedOrder.id}
                              onClick={() => sendOrderToBosta(selectedOrder.id)}>
                              {bostaActionLoading === selectedOrder.id ? <Loader2 className='w-3 h-3 animate-spin' /> : <Send className='w-3 h-3' />}
                              Send
                            </Button>
                          ) : (
                            <span
                              title='Online payment must be confirmed paid before this order can be sent to Bosta'
                              className='inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1'>
                              <Lock className='w-3 h-3' />
                              Awaiting payment
                            </span>
                          )
                        ) : selectedOrder.bostaDeliveryId ? (
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-7 text-xs gap-1 text-destructive hover:text-destructive'
                            disabled={bostaActionLoading === selectedOrder.id}
                            onClick={() => cancelBostaDelivery(selectedOrder.id)}>
                            {bostaActionLoading === selectedOrder.id ? <Loader2 className='w-3 h-3 animate-spin' /> : <XCircle className='w-3 h-3' />}
                            Cancel
                          </Button>
                        ) : null}
                      </div>

                      <div className='mb-2 rounded-lg border bg-muted/30 p-3 space-y-2 text-sm'>
                        <div className='flex items-center justify-between'>
                          <span className='text-muted-foreground'>Sync status</span>
                          {getBostaSyncBadge(selectedOrder)}
                        </div>
                        {selectedOrder.bostaSyncError && (
                          <p className='text-xs text-red-700 break-words'>{selectedOrder.bostaSyncError}</p>
                        )}
                      </div>

                      {selectedOrder.bostaTrackingNumber ? (
                        <div className='bg-orange-50 border border-orange-100 rounded-lg p-3 space-y-2 text-sm'>
                          <div className='flex items-center justify-between'>
                            <span className='text-muted-foreground'>Tracking #</span>
                            <div className='flex items-center gap-1.5'>
                              <span className='font-mono font-semibold text-orange-700'>{selectedOrder.bostaTrackingNumber}</span>
                              <a href={`https://bosta.co/tracking-shipment?track=${selectedOrder.bostaTrackingNumber}&lang=en`} target='_blank' rel='noopener noreferrer' className='text-orange-500'>
                                <ExternalLink className='w-3.5 h-3.5' />
                              </a>
                            </div>
                          </div>
                          {selectedOrder.bostaStatus && (
                            <div className='flex items-center justify-between'>
                              <span className='text-muted-foreground'>Delivery status</span>
                              <Badge className='bg-orange-100 text-orange-800 border-orange-200 text-xs'>{selectedOrder.bostaStatus.replace(/_/g, " ")}</Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className='text-sm text-muted-foreground'>
                          {selectedOrder.bostaSyncStatus === "failed"
                            ? "Last send failed — tap Send to retry."
                            : "Not sent to Bosta yet."}
                        </p>
                      )}
                    </div>
                  )}

                  {selectedOrder.notes && (
                    <div>
                      <h3 className='font-medium text-sm mb-2'>Order Notes</h3>
                      <p className='text-sm text-muted-foreground'>
                        {selectedOrder.notes}
                      </p>
                    </div>
                  )}

                  {isAdmin && (
                    <div>
                      <h3 className='font-medium text-sm mb-3 flex items-center gap-2'>
                        <History className='w-4 h-4 text-muted-foreground' />
                        Activity Log
                      </h3>
                      <OrderActivityLog orderId={selectedOrder.id} />
                    </div>
                  )}
                </div>

                <div className='border-t p-4 sticky bottom-0 bg-background'>
                  <Button
                    variant='outline'
                    className='w-full'
                    onClick={() => setIsDetailsOpen(false)}>
                    Close
                  </Button>
                </div>
                </>
                )}
              </>
            )}
          </SheetContent>
        </Sheet>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              order
              <span className='font-mono font-semibold'>
                {" "}
                {orderToDeleteId?.substring(0, 8)}...
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOrderToDeleteId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteOrder}
              disabled={isUpdating}>
              {isUpdating ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </div>
    </AlertDialog>
  );
}
