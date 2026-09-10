import React, { useState, useEffect } from "react";
import { TopSellingProductsCard } from "#root/components/dashboard/TopSellingProductsCard";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import { Button } from "#root/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  Eye,
  ShoppingCart,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  DollarSign,
  Loader2,
  BarChart3,
  Users,
  Repeat2,
  UserPlus,
  ArchiveX,
} from "lucide-react";
import { trpc } from "#root/shared/trpc/client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OverviewData {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalOrders7d: number;
  totalRevenue7d: number;
  totalProducts: number;
  sessions30d: number;
  purchaseSessions30d: number;
  conversionRate30d: number;
}

interface FunnelStage {
  eventName: string;
  total: number;
  uniqueSessions: number;
}

interface EventRow {
  eventName: string | null;
  total: number;
  uniqueSessions: number;
}

interface EventBreakdownData {
  events: EventRow[];
  totalEvents: number;
  totalSessions: number;
}

interface PlatformRow {
  platform: string;
  status: string;
  successRate: number;
  failedCount: number;
  lastEventAt: string | null;
  enabled: boolean;
}

interface TopSellingRow {
  id: string;
  name: string;
  price: number;
  sold: number;
  revenue: number;
}

interface TopViewedRow {
  productId: string;
  productName: string;
  viewCount: number;
}

interface TopTrackedData {
  mostViewed: TopViewedRow[];
  mostCarted: { productId: string; productName: string; cartCount: number }[];
}

interface LoyalCustomerRow {
  email: string;
  name: string;
  orderCount: number;
  totalSpent: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

interface CustomerData {
  totalCustomers: number;
  returningCount: number;
  newCount: number;
  returningRate: number;
  topLoyal: LoyalCustomerRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FUNNEL_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

const FUNNEL_LABELS: Record<string, string> = {
  page_viewed: "Site Visits",
  product_viewed: "Product Viewed",
  product_added_to_cart: "Added to Cart",
  checkout_started: "Checkout Started",
  checkout_completed: "Purchase Completed",
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta (CAPI)",
  google_ga4: "Google GA4 (MP)",
  tiktok: "TikTok Events",
  snapchat: "Snapchat CAPI",
  pinterest: "Pinterest CAPI",
  custom: "Custom",
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelStage[] | null>(null);
  const [eventsData, setEventsData] = useState<EventBreakdownData | null>(null);
  const [platformData, setPlatformData] = useState<PlatformRow[] | null>(null);
  const [topSellingData, setTopSellingData] = useState<TopSellingRow[]>([]);
  const [topTrackedData, setTopTrackedData] = useState<TopTrackedData | null>(
    null,
  );
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleArchiveAll = async () => {
    setArchiving(true);
    try {
      await trpc.analytics.archiveAll.mutate();
      // Refresh all data to reflect zeroed-out analytics
      setOverviewData(null);
      setFunnelData(null);
      setEventsData(null);
      setTopSellingData([]);
      setTopTrackedData(null);
      setCustomerData(null);
      setArchiveDialogOpen(false);
      // Reload
      setIsLoading(true);
      const [overview, funnel, events, platform, topSelling, topTracked] =
        await Promise.all([
          trpc.analytics.overview.query(),
          trpc.analytics.funnel.query(),
          trpc.analytics.eventBreakdown.query(),
          trpc.analytics.platformHealth.query(),
          trpc.product.topSelling.query({}),
          trpc.analytics.topTrackedProducts.query(),
        ]);
      if (overview.success) setOverviewData(overview.result);
      if (funnel.success) setFunnelData(funnel.result);
      if (events.success) setEventsData(events.result);
      if (platform.success) setPlatformData(platform.result);
      if (topSelling.success) setTopSellingData(topSelling.result);
      if (topTracked.success) setTopTrackedData(topTracked.result);
      trpc.analytics.returningCustomers.query().then((r) => {
        if (r.success) setCustomerData(r.result as CustomerData);
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to archive analytics:", err);
    } finally {
      setArchiving(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setIsLoading(true);
      try {
        const [overview, funnel, events, platform, topSelling, topTracked] =
          await Promise.all([
            trpc.analytics.overview.query(),
            trpc.analytics.funnel.query(),
            trpc.analytics.eventBreakdown.query(),
            trpc.analytics.platformHealth.query(),
            trpc.product.topSelling.query({}),
            trpc.analytics.topTrackedProducts.query(),
          ]);

        if (cancelled) return;

        if (overview.success) setOverviewData(overview.result);
        if (funnel.success) setFunnelData(funnel.result);
        if (events.success) setEventsData(events.result);
        if (platform.success) setPlatformData(platform.result);
        if (topSelling.success) setTopSellingData(topSelling.result);
        if (topTracked.success) setTopTrackedData(topTracked.result);

        // Load returning customers separately (non-blocking)
        trpc.analytics.returningCustomers.query().then((r) => {
          if (!cancelled && r.success) setCustomerData(r.result as CustomerData);
        }).catch(() => {});
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className='p-6 max-w-7xl mx-auto space-y-6' data-testid='analytics-dashboard'>
      {/* Header */}
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>
            Analytics Dashboard
          </h1>
          <p className='text-muted-foreground'>
            Overview of store performance, conversions, and tracking health.
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          className='shrink-0 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10'
          onClick={() => setArchiveDialogOpen(true)}
        >
          <ArchiveX className='h-4 w-4' />
          Reset Analytics
        </Button>
      </div>

      {isLoading && (
        <div className='flex items-center justify-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
        </div>
      )}

      {/* ── Overview Cards ────────────────────────────────────────── */}
      {overviewData && (
        <div
          className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
          data-testid='overview-cards'>
          <OverviewCard
            label='Total Orders'
            value={overviewData.totalOrders.toLocaleString()}
            sub={`${overviewData.totalOrders7d} in last 7 days`}
            icon={<Package className='h-4 w-4' />}
          />
          <OverviewCard
            label='Total Revenue'
            value={`$${overviewData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`$${overviewData.totalRevenue7d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in last 7 days`}
            icon={<DollarSign className='h-4 w-4' />}
          />
          <OverviewCard
            label='Avg. Order Value'
            value={`$${overviewData.avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<CreditCard className='h-4 w-4' />}
          />
          <OverviewCard
            label='Store Sessions'
            value={overviewData.sessions30d.toLocaleString()}
            sub='Unique visitors (last 30 days)'
            icon={<Users className='h-4 w-4' />}
          />
          <OverviewCard
            label='Conversion Rate'
            value={`${overviewData.conversionRate30d.toFixed(1)}%`}
            sub={`${overviewData.purchaseSessions30d.toLocaleString()} purchases from ${overviewData.sessions30d.toLocaleString()} sessions`}
            icon={<TrendingUp className='h-4 w-4' />}
          />
          <OverviewCard
            label='Total Products'
            value={overviewData.totalProducts.toLocaleString()}
            icon={<ShoppingCart className='h-4 w-4' />}
          />
        </div>
      )}

      {/* ── Conversion Funnel ─────────────────────────────────────── */}
      {funnelData && (
        <Card data-testid='conversion-funnel'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5' />
              Conversion Funnel
            </CardTitle>
            <CardDescription>
              Drop-off at each stage of the purchase journey (last 30 days,
              unique sessions)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {funnelData.every((s: FunnelStage) => s.uniqueSessions === 0) ? (
              <p className='text-sm text-muted-foreground py-4 text-center'>
                No funnel data in the last 30 days. Events will appear here as
                visitors interact with your store.
              </p>
            ) : (
              <>
                <div className='mb-4 grid grid-cols-5 gap-2'>
                  {funnelData.map((stage: FunnelStage, idx: number) => {
                    const prevSessions =
                      idx > 0
                        ? funnelData[idx - 1]!.uniqueSessions
                        : stage.uniqueSessions;
                    const dropOff =
                      idx > 1 && prevSessions > 0
                        ? (
                            (1 - stage.uniqueSessions / prevSessions) *
                            100
                          ).toFixed(1)
                        : null;
                    return (
                      <div key={stage.eventName} className='text-center'>
                        <p className='text-xs text-muted-foreground'>
                          {FUNNEL_LABELS[stage.eventName] ?? stage.eventName}
                        </p>
                        <p className='text-lg font-bold'>
                          {stage.uniqueSessions.toLocaleString()}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {stage.total.toLocaleString()} events
                        </p>
                        {dropOff && (
                          <p className='text-xs text-red-500'>
                            -{dropOff}% drop
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <ResponsiveContainer width='100%' height={200}>
                  <BarChart
                    data={funnelData.map((s: FunnelStage, i: number) => ({
                      name: FUNNEL_LABELS[s.eventName] ?? s.eventName,
                      value: s.uniqueSessions,
                      fill: FUNNEL_COLORS[i] ?? "#6366f1",
                    }))}
                    layout='vertical'>
                    <CartesianGrid strokeDasharray='3 3' />
                    <XAxis type='number' />
                    <YAxis dataKey='name' type='category' width={130} />
                    <Tooltip
                      formatter={(value) =>
                        typeof value === "number"
                          ? value.toLocaleString()
                          : String(value)
                      }
                    />
                    <Bar dataKey='value' radius={[0, 4, 4, 0]}>
                      {funnelData.map((_: FunnelStage, i: number) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={FUNNEL_COLORS[i] ?? "#6366f1"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Top Products ──────────────────────────────────────────── */}
      <div className='grid gap-4 lg:grid-cols-2'>
        {/* Best Selling (all sold products) */}
        <TopSellingProductsCard
          products={topSellingData}
          isLoading={isLoading}
          error={null}
        />

        {/* Most Viewed (from tracking events) */}
        {topTrackedData?.mostViewed && topTrackedData.mostViewed.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Eye className='h-5 w-5' />
                Most Viewed Products
              </CardTitle>
              <CardDescription>
                By product view events (last 30 days)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className='text-right'>Views</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topTrackedData.mostViewed.map((p: TopViewedRow) => (
                    <TableRow key={p.productId}>
                      <TableCell className='font-medium'>
                        {p.productName || p.productId}
                      </TableCell>
                      <TableCell className='text-right'>
                        {p.viewCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Customer Loyalty ──────────────────────────────────────── */}
      {customerData && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Users className='h-5 w-5' />
              Customer Loyalty
            </CardTitle>
            <CardDescription>
              Returning vs new customers — all time
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* Summary stats */}
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
              <div className='rounded-lg border p-4'>
                <p className='text-xs text-muted-foreground'>Total Customers</p>
                <p className='text-2xl font-bold mt-1'>{customerData.totalCustomers.toLocaleString()}</p>
              </div>
              <div className='rounded-lg border p-4'>
                <p className='text-xs text-muted-foreground flex items-center gap-1'>
                  <Repeat2 className='h-3 w-3' /> Returning
                </p>
                <p className='text-2xl font-bold mt-1 text-indigo-600'>{customerData.returningCount.toLocaleString()}</p>
              </div>
              <div className='rounded-lg border p-4'>
                <p className='text-xs text-muted-foreground flex items-center gap-1'>
                  <UserPlus className='h-3 w-3' /> New
                </p>
                <p className='text-2xl font-bold mt-1'>{customerData.newCount.toLocaleString()}</p>
              </div>
              <div className='rounded-lg border bg-indigo-50 p-4'>
                <p className='text-xs text-indigo-600'>Retention Rate</p>
                <p className='text-2xl font-bold mt-1 text-indigo-700'>{customerData.returningRate}%</p>
              </div>
            </div>

            {/* Top loyal customers */}
            {customerData.topLoyal.length > 0 && (
              <>
                <p className='text-sm font-medium text-muted-foreground pt-2'>Top Loyal Customers</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className='text-right'>Orders</TableHead>
                      <TableHead className='text-right'>Total Spent</TableHead>
                      <TableHead className='text-right hidden sm:table-cell'>First Order</TableHead>
                      <TableHead className='text-right hidden sm:table-cell'>Last Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.topLoyal.map((c: LoyalCustomerRow) => (
                      <TableRow key={c.email}>
                        <TableCell>
                          <p className='font-medium'>{c.name}</p>
                          <p className='text-xs text-muted-foreground'>{c.email}</p>
                        </TableCell>
                        <TableCell className='text-right'>
                          <Badge variant='secondary'>{c.orderCount}</Badge>
                        </TableCell>
                        <TableCell className='text-right font-medium'>
                          ${c.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className='text-right text-xs text-muted-foreground hidden sm:table-cell'>
                          {c.firstOrderAt ? new Date(c.firstOrderAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className='text-right text-xs text-muted-foreground hidden sm:table-cell'>
                          {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            {customerData.topLoyal.length === 0 && (
              <p className='text-sm text-muted-foreground text-center py-4'>
                No repeat customers yet. Loyalty data will appear here as customers place more orders.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Event Breakdown ───────────────────────────────────────── */}
      {eventsData && (        <Card data-testid='event-breakdown'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BarChart3 className='h-5 w-5' />
              Tracking Events (Last 30 Days)
            </CardTitle>
            <CardDescription>
              {eventsData.totalEvents.toLocaleString()} total events across{" "}
              {eventsData.totalSessions.toLocaleString()} sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventsData.events.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableHead className='text-right'>Total</TableHead>
                    <TableHead className='text-right'>
                      Unique Sessions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventsData.events.map((evt: EventRow) => (
                    <TableRow key={evt.eventName}>
                      <TableCell className='font-medium font-mono text-sm'>
                        {evt.eventName}
                      </TableCell>
                      <TableCell className='text-right'>
                        {evt.total.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right'>
                        {evt.uniqueSessions.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className='text-sm text-muted-foreground py-4 text-center'>
                No tracking events recorded yet. Events will appear here once
                visitors interact with your store.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Platform Health ───────────────────────────────────────── */}
      {platformData && (
        <Card data-testid='platform-health'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Activity className='h-5 w-5' />
              Platform Health
            </CardTitle>
            <CardDescription>
              Server-side delivery status for each pixel platform (last 7 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {platformData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Success Rate</TableHead>
                    <TableHead className='text-right'>Failed</TableHead>
                    <TableHead className='text-right'>Last Event</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {platformData.map((ph: PlatformRow) => (
                    <TableRow key={ph.platform}>
                      <TableCell className='font-medium'>
                        {PLATFORM_LABELS[ph.platform] ?? ph.platform}
                        {!ph.enabled && (
                          <Badge variant='outline' className='ml-2 text-xs'>
                            disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ph.status === "healthy"
                              ? "default"
                              : ph.status === "degraded"
                                ? "secondary"
                                : ph.status === "no_data"
                                  ? "outline"
                                  : "destructive"
                          }
                          className='gap-1'>
                          {ph.status === "healthy" && (
                            <CheckCircle className='h-3 w-3' />
                          )}
                          {ph.status === "degraded" && (
                            <AlertTriangle className='h-3 w-3' />
                          )}
                          {ph.status === "down" && (
                            <AlertTriangle className='h-3 w-3' />
                          )}
                          {ph.status === "no_data" ? "No data" : ph.status}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        {ph.successRate > 0
                          ? `${ph.successRate.toFixed(1)}%`
                          : "N/A"}
                      </TableCell>
                      <TableCell className='text-right'>
                        {ph.failedCount}
                      </TableCell>
                      <TableCell className='text-right'>
                        {ph.lastEventAt ? (
                          <span className='flex items-center justify-end gap-1'>
                            <Clock className='h-3 w-3' />
                            {formatTimeAgo(ph.lastEventAt)}
                          </span>
                        ) : (
                          "Never"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className='text-sm text-muted-foreground py-4 text-center'>
                No pixel platforms configured. Go to Pixels & Tracking to set up
                your first platform.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Archive / Reset Confirmation Dialog ───────────────────── */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-destructive'>
              <ArchiveX className='h-5 w-5' />
              Reset All Analytics
            </DialogTitle>
            <DialogDescription asChild>
              <div className='space-y-3 text-sm'>
                <p>
                  This will archive <strong>all tracking events</strong> and{" "}
                  <strong>all orders</strong>, effectively zeroing out the
                  dashboard for a clean launch.
                </p>
                <div className='rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800'>
                  <p className='font-medium'>Nothing is deleted.</p>
                  <p className='mt-0.5 text-xs'>
                    All data is preserved in the database with an{" "}
                    <code className='font-mono'>archived_at</code> timestamp for
                    audit purposes. This action cannot be undone from the UI.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              variant='outline'
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleArchiveAll}
              disabled={archiving}
              className='gap-2'
            >
              {archiving ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <ArchiveX className='h-4 w-4' />
              )}
              {archiving ? "Archiving…" : "Yes, Reset Analytics"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className='flex items-center gap-4 pt-6'>
        <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-muted'>
          {icon}
        </div>
        <div>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='text-2xl font-bold'>{value}</p>
          {sub && <p className='text-xs text-muted-foreground'>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
