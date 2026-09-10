import { useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  Zap,
  AlertTriangle,
  Users,
  Eye,
  ShoppingCart,
  MousePointerClick,
  Search,
  UserPlus,
  LogIn,
  Tag,
  LayoutGrid,
  Megaphone,
  Mail,
  Hash,
  ArchiveX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  sessionId: string;
  eventName: string;
  eventId: string;
  pageUrl: string | null;
  deviceType: string | null;
  createdAt: Date;
  deliveryId: string | null;
  platform: string | null;
  sent: boolean | null;
  sentAt: Date | null;
  error: string | null;
}

interface EventTypeCount {
  eventName: string;
  total: number;
  uniqueSessions: number;
}

interface DeliveryStats {
  events24h: number;
  events7d: number;
  events30d: number;
  sessions24h: number;
  sessions7d: number;
  sessions30d: number;
  eventTypeCounts: EventTypeCount[];
  platformStats: { platform: string; sent: boolean; total: number }[];
}

const PAGE_SIZE = 25;

// ─── Human-readable event name mappings ─────────────────────────────────────

const EVENT_DISPLAY_NAMES: Record<string, string> = {
  page_viewed: "Page Viewed",
  product_viewed: "Product Viewed",
  product_list_viewed: "Product List Viewed",
  product_added_to_cart: "Added to Cart",
  product_removed_from_cart: "Removed from Cart",
  cart_viewed: "Cart Viewed",
  checkout_started: "Checkout Started",
  checkout_shipping_submitted: "Shipping Submitted",
  checkout_payment_submitted: "Payment Submitted",
  checkout_completed: "Checkout Completed",
  search_submitted: "Search",
  registration_completed: "Registration",
  login_completed: "Login",
  promo_code_applied: "Promo Code Applied",
  collection_viewed: "Collection Viewed",
  promotion_viewed: "Promotion Viewed",
  promotion_clicked: "Promotion Clicked",
  newsletter_subscribed: "Newsletter Signup",
  custom_event: "Custom Event",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  page_viewed: <Eye className='w-3.5 h-3.5' />,
  product_viewed: <Eye className='w-3.5 h-3.5' />,
  product_list_viewed: <LayoutGrid className='w-3.5 h-3.5' />,
  product_added_to_cart: <ShoppingCart className='w-3.5 h-3.5' />,
  product_removed_from_cart: <ShoppingCart className='w-3.5 h-3.5' />,
  cart_viewed: <ShoppingCart className='w-3.5 h-3.5' />,
  checkout_started: <MousePointerClick className='w-3.5 h-3.5' />,
  checkout_shipping_submitted: <MousePointerClick className='w-3.5 h-3.5' />,
  checkout_payment_submitted: <MousePointerClick className='w-3.5 h-3.5' />,
  checkout_completed: <CheckCircle2 className='w-3.5 h-3.5' />,
  search_submitted: <Search className='w-3.5 h-3.5' />,
  registration_completed: <UserPlus className='w-3.5 h-3.5' />,
  login_completed: <LogIn className='w-3.5 h-3.5' />,
  promo_code_applied: <Tag className='w-3.5 h-3.5' />,
  collection_viewed: <LayoutGrid className='w-3.5 h-3.5' />,
  promotion_viewed: <Megaphone className='w-3.5 h-3.5' />,
  promotion_clicked: <Megaphone className='w-3.5 h-3.5' />,
  newsletter_subscribed: <Mail className='w-3.5 h-3.5' />,
  custom_event: <Hash className='w-3.5 h-3.5' />,
};

const EVENT_COLORS: Record<string, string> = {
  page_viewed: "bg-blue-50 text-blue-700 border-blue-200",
  product_viewed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  product_list_viewed: "bg-violet-50 text-violet-700 border-violet-200",
  product_added_to_cart: "bg-emerald-50 text-emerald-700 border-emerald-200",
  product_removed_from_cart: "bg-orange-50 text-orange-700 border-orange-200",
  cart_viewed: "bg-teal-50 text-teal-700 border-teal-200",
  checkout_started: "bg-amber-50 text-amber-700 border-amber-200",
  checkout_completed: "bg-green-50 text-green-700 border-green-200",
  search_submitted: "bg-cyan-50 text-cyan-700 border-cyan-200",
  registration_completed: "bg-pink-50 text-pink-700 border-pink-200",
  login_completed: "bg-purple-50 text-purple-700 border-purple-200",
  promo_code_applied: "bg-lime-50 text-lime-700 border-lime-200",
  newsletter_subscribed: "bg-rose-50 text-rose-700 border-rose-200",
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google_ga4: "Google GA4",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  custom: "Custom",
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-100 text-blue-800",
  google_ga4: "bg-amber-100 text-amber-800",
  tiktok: "bg-stone-100 text-stone-800",
  snapchat: "bg-yellow-100 text-yellow-800",
  pinterest: "bg-red-100 text-red-800",
  custom: "bg-gray-100 text-gray-800",
};

function getEventDisplayName(eventName: string): string {
  return EVENT_DISPLAY_NAMES[eventName] ?? eventName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventColor(eventName: string): string {
  return EVENT_COLORS[eventName] ?? "bg-gray-50 text-gray-700 border-gray-200";
}

function getEventIcon(eventName: string): React.ReactNode {
  return EVENT_ICONS[eventName] ?? <Activity className='w-3.5 h-3.5' />;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(date).toLocaleDateString();
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminPixelEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed">("all");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // ── Fetch events ────────────────────────────────────────────

  const fetchEvents = async () => {
    try {
      const result = await trpc.pixelTracking.events.list.query({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter,
      });

      if (result.success) {
        setEvents(result.result.events as unknown as EventRow[]);
        setTotal(result.result.total);
      }
    } catch (err) {
      toast.error("Failed to load events");
    }
  };

  const fetchStats = async () => {
    try {
      const result = await trpc.pixelTracking.events.stats.query();
      if (result.success) {
        setStats(result.result as unknown as DeliveryStats);
      }
    } catch {
      // Stats are non-critical
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEvents(), fetchStats()]).finally(() => setLoading(false));
  }, [page, statusFilter]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const result = await trpc.pixelTracking.events.archiveLog.mutate();
      if (result.success) {
        toast.success("Event log archived. The view has been cleared.");
        setArchiveDialogOpen(false);
        setPage(0);
        setEvents([]);
        setTotal(0);
        await Promise.all([fetchEvents(), fetchStats()]);
      } else {
        toast.error("Failed to archive event log");
      }
    } catch {
      toast.error("Failed to archive event log");
    } finally {
      setArchiving(false);
    }
  };

  // ── Stats helpers ───────────────────────────────────────────

  const getSuccessRate = (platform: string): number => {
    if (!stats) return 0;
    const platformItems = stats.platformStats.filter((s) => s.platform === platform);
    const sent = platformItems.find((s) => s.sent)?.total ?? 0;
    const failed = platformItems.find((s) => !s.sent)?.total ?? 0;
    const t = sent + failed;
    return t === 0 ? 100 : Math.round((sent / t) * 100);
  };

  const getFailedCount = (): number => {
    if (!stats) return 0;
    return stats.platformStats
      .filter((s) => !s.sent)
      .reduce((sum, s) => sum + s.total, 0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Render ──────────────────────────────────────────────────

  if (loading && events.length === 0) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <Loader2 className='w-6 h-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='p-6 space-y-6 max-w-7xl mx-auto'>
      {/* Confirm Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Event Log?</DialogTitle>
            <DialogDescription>
              This will archive all current event records. Nothing is deleted — all data
              is preserved in the database for audit purposes. The live log view will be
              cleared and start fresh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2'>
            <Button variant='outline' onClick={() => setArchiveDialogOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleArchive} disabled={archiving}>
              {archiving ? <Loader2 className='w-4 h-4 mr-2 animate-spin' /> : <ArchiveX className='w-4 h-4 mr-2' />}
              Yes, Archive Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Event Delivery Log</h1>
          <p className='text-sm text-muted-foreground mt-1'>
            Monitor pixel event tracking and delivery status across all platforms.
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setArchiveDialogOpen(true)}
          className='text-muted-foreground hover:text-destructive'
        >
          <ArchiveX className='w-4 h-4 mr-2' />
          Reset Log
        </Button>
      </div>

      {/* Key Metrics: Events + Sessions */}
      {stats && (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Total Events */}
          <Card>
            <CardContent className='pt-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2 bg-blue-50 rounded-lg'>
                  <Zap className='w-5 h-5 text-blue-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Events Today</p>
                  <p className='text-2xl font-bold'>{stats.events24h.toLocaleString()}</p>
                  <p className='text-xs text-muted-foreground'>
                    {stats.events7d.toLocaleString()} this week &middot; {stats.events30d.toLocaleString()} this month
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unique Sessions */}
          <Card>
            <CardContent className='pt-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2 bg-violet-50 rounded-lg'>
                  <Users className='w-5 h-5 text-violet-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Unique Visitors Today</p>
                  <p className='text-2xl font-bold'>{stats.sessions24h.toLocaleString()}</p>
                  <p className='text-xs text-muted-foreground'>
                    {stats.sessions7d.toLocaleString()} this week &middot; {stats.sessions30d.toLocaleString()} this month
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events per Session */}
          <Card>
            <CardContent className='pt-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2 bg-green-50 rounded-lg'>
                  <BarChart3 className='w-5 h-5 text-green-600' />
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Avg Events / Session</p>
                  <p className='text-2xl font-bold'>
                    {stats.sessions7d > 0
                      ? (stats.events7d / stats.sessions7d).toFixed(1)
                      : "—"}
                  </p>
                  <p className='text-xs text-muted-foreground'>Based on last 7 days</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Failed Deliveries */}
          <Card>
            <CardContent className='pt-4'>
              <div className='flex items-center gap-3'>
                <div className={`p-2 rounded-lg ${getFailedCount() > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  {getFailedCount() > 0 ? (
                    <AlertTriangle className='w-5 h-5 text-red-600' />
                  ) : (
                    <CheckCircle2 className='w-5 h-5 text-green-600' />
                  )}
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Failed Deliveries</p>
                  <p className='text-2xl font-bold'>{getFailedCount()}</p>
                  <p className='text-xs text-muted-foreground'>Past 7 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Event Type Breakdown */}
      {stats && stats.eventTypeCounts && stats.eventTypeCounts.length > 0 && (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Event Breakdown (Last 30 Days)</CardTitle>
            <CardDescription>
              Total events and unique sessions per event type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
              {stats.eventTypeCounts.map((et) => (
                <div
                  key={et.eventName}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${getEventColor(et.eventName)}`}
                >
                  <div className='flex-shrink-0'>
                    {getEventIcon(et.eventName)}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm font-medium truncate'>
                      {getEventDisplayName(et.eventName)}
                    </p>
                    <p className='text-xs opacity-75'>
                      {et.total.toLocaleString()} events &middot; {et.uniqueSessions.toLocaleString()} sessions
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Success Rates */}
      {stats && stats.platformStats.length > 0 && (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Platform Success Rates (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-4'>
              {[...new Set(stats.platformStats.map((s) => s.platform))].map((platform) => (
                <div key={platform} className='flex items-center gap-2'>
                  <Badge className={PLATFORM_COLORS[platform] ?? "bg-gray-100 text-gray-800"}>
                    {PLATFORM_LABELS[platform] ?? platform}
                  </Badge>
                  <span className='text-sm font-medium'>{getSuccessRate(platform)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + Table */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-base'>Event Log</CardTitle>
            <div className='flex items-center gap-2'>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as "all" | "sent" | "failed");
                  setPage(0);
                }}
              >
                <SelectTrigger className='w-[140px] h-8'>
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All</SelectItem>
                  <SelectItem value='sent'>Sent</SelectItem>
                  <SelectItem value='failed'>Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>
            {total.toLocaleString()} events total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
              <Activity className='w-10 h-10 mb-3 opacity-50' />
              <p className='text-sm'>No tracking events recorded yet.</p>
            </div>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-[140px]'>Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='hidden md:table-cell'>Page</TableHead>
                      <TableHead className='hidden lg:table-cell'>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event, idx) => (
                      <TableRow key={`${event.id}-${event.deliveryId ?? idx}`}>
                        <TableCell className='text-xs text-muted-foreground whitespace-nowrap'>
                          <span title={new Date(event.createdAt).toLocaleString()}>
                            {formatTimeAgo(event.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className={`gap-1.5 font-normal ${getEventColor(event.eventName)}`}
                          >
                            {getEventIcon(event.eventName)}
                            {getEventDisplayName(event.eventName)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {event.platform ? (
                            <Badge
                              variant='secondary'
                              className={PLATFORM_COLORS[event.platform] ?? ""}
                            >
                              {PLATFORM_LABELS[event.platform] ?? event.platform}
                            </Badge>
                          ) : (
                            <span className='text-xs text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {event.deliveryId == null ? (
                            <Badge variant='outline' className='text-muted-foreground'>
                              <Clock className='w-3 h-3 mr-1' />
                              Pending
                            </Badge>
                          ) : event.sent ? (
                            <Badge variant='outline' className='text-green-700 border-green-200 bg-green-50'>
                              <CheckCircle2 className='w-3 h-3 mr-1' />
                              Sent
                            </Badge>
                          ) : (
                            <Badge variant='outline' className='text-red-700 border-red-200 bg-red-50'>
                              <XCircle className='w-3 h-3 mr-1' />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className='hidden md:table-cell max-w-[250px] truncate text-xs text-muted-foreground'>
                          {event.pageUrl
                            ? event.pageUrl.replace(/^https?:\/\/[^/]+/, "")
                            : "—"}
                        </TableCell>
                        <TableCell className='hidden lg:table-cell max-w-[200px] truncate text-xs text-red-600'>
                          {event.error ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className='flex items-center justify-between mt-4'>
                  <p className='text-sm text-muted-foreground'>
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className='w-4 h-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className='w-4 h-4' />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
