import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Coins,
  Layers,
  Loader2,
  Package,
  Receipt,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "#root/shared/trpc/client";
import { STORE_CURRENCY } from "#root/shared/config/branding";
import type { BundleAnalyticsResult } from "#root/backend/bundles/analytics";
import {
  COUNTED_ORDER_RULE,
  type BundleAnalyticsPeriod,
  isDiscountGranted,
} from "#root/shared/bundles/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#root/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { Badge } from "#root/components/ui/badge";
import { Button } from "#root/components/ui/button";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";

/**
 * Bundles & Stacks analytics.
 *
 * Every number on this page is derived from placed orders and their
 * `order_bundle` snapshots — never from tracking events, and never from the
 * campaign's CURRENT pricing. A tier repriced yesterday leaves last month's
 * sales exactly as they were sold. Admin copy is English-only, matching the
 * rest of the dashboard.
 */

const PERIODS: { value: BundleAnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const TYPE_LABEL: Record<string, string> = {
  build_your_stack: "Build Your Stack",
  curated_stack: "Curated Stack",
};

const money = (n: number) =>
  `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${STORE_CURRENCY}`;

const count = (n: number) => n.toLocaleString();

export function Page() {
  const [period, setPeriod] = useState<BundleAnalyticsPeriod>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<BundleAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A custom range only queries once both ends are filled in — otherwise the
    // page would flash an "all time" result the merchant did not ask for.
    if (period === "custom" && !(from && to)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    trpc.bundle.analytics
      .query({
        period,
        from: period === "custom" ? from : undefined,
        to: period === "custom" ? to : undefined,
        limit: 25,
      })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.result) {
          setData(result.result);
          setError(null);
        } else {
          setError("Could not load bundle analytics.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load bundle analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, from, to]);

  return (
    <div className='p-6 max-w-7xl mx-auto space-y-6' data-testid='bundle-analytics'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Bundles &amp; Stacks Analytics</h1>
          <p className='text-muted-foreground text-sm'>
            Sales measured from placed orders and their bundle snapshots. {COUNTED_ORDER_RULE}
          </p>
        </div>
        <Button variant='outline' size='sm' className='gap-2' asChild>
          <a href='/dashboard/bundles'>
            <ArrowLeft className='h-4 w-4' />
            Back to campaigns
          </a>
        </Button>
      </div>

      {/* ── Date range ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className='flex flex-wrap items-end gap-3 pt-6'>
          <div className='flex flex-wrap gap-2'>
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                size='sm'
                variant={period === p.value ? "primary" : "outline"}
                onClick={() => setPeriod(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className='flex flex-wrap items-end gap-3'>
              <div className='space-y-1'>
                <Label className='text-xs' htmlFor='range-from'>
                  From
                </Label>
                <Input
                  id='range-from'
                  type='date'
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className='w-40'
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs' htmlFor='range-to'>
                  To (inclusive)
                </Label>
                <Input
                  id='range-to'
                  type='date'
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className='w-40'
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className='flex items-center justify-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
        </div>
      )}

      {error && !loading && <p className='text-sm text-destructive'>{error}</p>}

      {period === "custom" && !(from && to) && !loading && (
        <p className='text-sm text-muted-foreground'>Choose both dates to run the report.</p>
      )}

      {data && !loading && (
        <>
          {/* ── Headline metrics ─────────────────────────────────────── */}
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3' data-testid='bundle-totals'>
            <Metric
              label='Bundle revenue'
              value={money(data.totals.revenue)}
              sub='Charged bundle totals, children never re-counted'
              icon={<Coins className='h-4 w-4' />}
            />
            <Metric
              label='Bundle instances'
              value={count(data.totals.instances)}
              sub='Each stack bought counts once'
              icon={<Layers className='h-4 w-4' />}
            />
            <Metric
              label='Orders with bundles'
              value={count(data.totals.orders)}
              sub='Distinct orders containing a bundle'
              icon={<Receipt className='h-4 w-4' />}
            />
            <Metric
              label='Pieces sold in bundles'
              value={count(data.totals.pieces)}
              sub='Units, from the tier quantity on each snapshot'
              icon={<Package className='h-4 w-4' />}
            />
            <Metric
              label='Average bundle value'
              value={money(data.totals.averageBundleValue)}
              sub='Revenue ÷ instances'
              icon={<Boxes className='h-4 w-4' />}
            />
            <Metric
              label={
                isDiscountGranted(data.totals.savings)
                  ? "Bundle discount granted"
                  : data.totals.savings < 0
                    ? "Charged above regular value"
                    : "Difference vs regular value"
              }
              value={money(Math.abs(data.totals.savings))}
              sub={`Regular value at purchase ${money(data.totals.regularValue)}`}
              icon={<Sparkles className='h-4 w-4' />}
            />
          </div>

          {/* ── Revenue over time ────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Bundle revenue over time</CardTitle>
              <CardDescription>
                {data.range.bucket === "day"
                  ? "Daily"
                  : data.range.bucket === "week"
                    ? "Weekly"
                    : "Monthly"}{" "}
                buckets by order date (UTC).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.series.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No bundle sales in this range.</p>
              ) : (
                <ResponsiveContainer width='100%' height={240}>
                  <BarChart data={data.series}>
                    <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
                    <XAxis dataKey='date' fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} width={70} />
                    <Tooltip
                      formatter={(value) => money(Number(value ?? 0))}
                      labelFormatter={(label) => String(label)}
                    />
                    <Bar dataKey='revenue' fill='currentColor' className='fill-primary' radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* ── Performance by campaign ──────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Performance by campaign</CardTitle>
              <CardDescription>
                Historical identity from each sale&rsquo;s snapshot — deleted campaigns keep their sales.
              </CardDescription>
            </CardHeader>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className='text-right'>Instances</TableHead>
                    <TableHead className='text-right'>Orders</TableHead>
                    <TableHead className='text-right'>Pieces</TableHead>
                    <TableHead className='text-right'>Revenue</TableHead>
                    <TableHead className='text-right'>Avg value</TableHead>
                    <TableHead className='text-right'>Regular value</TableHead>
                    <TableHead className='text-right'>Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byCampaign.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className='py-8 text-center text-sm text-muted-foreground'>
                        No bundle sales in this range.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.byCampaign.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className='font-medium'>
                        {row.campaignId ? (
                          <a className='hover:underline' href={`/dashboard/bundles?campaign=${row.campaignId}`}>
                            {row.title}
                          </a>
                        ) : (
                          <span className='flex items-center gap-2'>
                            {row.title}
                            <Badge variant='outline' className='text-[10px]'>
                              Deleted
                            </Badge>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className='text-muted-foreground'>{TYPE_LABEL[row.type] ?? row.type}</TableCell>
                      <TableCell className='text-right'>{count(row.instances)}</TableCell>
                      <TableCell className='text-right'>{count(row.orders)}</TableCell>
                      <TableCell className='text-right'>{count(row.pieces)}</TableCell>
                      <TableCell className='text-right font-medium'>{money(row.revenue)}</TableCell>
                      <TableCell className='text-right'>{money(row.averageBundleValue)}</TableCell>
                      <TableCell className='text-right text-muted-foreground'>{money(row.regularValue)}</TableCell>
                      <TableCell className='text-right'>{money(row.savings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Type comparison ──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Build Your Stack vs Curated Stack</CardTitle>
            </CardHeader>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className='text-right'>Instances</TableHead>
                    <TableHead className='text-right'>Revenue</TableHead>
                    <TableHead className='text-right'>Pieces</TableHead>
                    <TableHead className='text-right'>Avg value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byType.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className='py-8 text-center text-sm text-muted-foreground'>
                        No bundle sales in this range.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.byType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className='font-medium'>{TYPE_LABEL[row.type] ?? row.type}</TableCell>
                      <TableCell className='text-right'>{count(row.instances)}</TableCell>
                      <TableCell className='text-right font-medium'>{money(row.revenue)}</TableCell>
                      <TableCell className='text-right'>{count(row.pieces)}</TableCell>
                      <TableCell className='text-right'>{money(row.averageBundleValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Tier performance ─────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Tier performance</CardTitle>
              <CardDescription>
                Build Your Stack only, grouped by the tier size as sold. A repriced tier keeps every sale at the
                price it was actually charged.
              </CardDescription>
            </CardHeader>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className='text-right'>Instances</TableHead>
                    <TableHead className='text-right'>Pieces</TableHead>
                    <TableHead className='text-right'>Revenue</TableHead>
                    <TableHead className='text-right'>Avg value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byTier.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className='py-8 text-center text-sm text-muted-foreground'>
                        No Build Your Stack sales in this range.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.byTier.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className='font-medium'>{row.title}</TableCell>
                      <TableCell>{row.quantity}-piece</TableCell>
                      <TableCell className='text-right'>{count(row.instances)}</TableCell>
                      <TableCell className='text-right'>{count(row.pieces)}</TableCell>
                      <TableCell className='text-right font-medium'>{money(row.revenue)}</TableCell>
                      <TableCell className='text-right'>{money(row.averageBundleValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Product insight ──────────────────────────────────────── */}
          <div className='grid gap-6 lg:grid-cols-2'>
            <ProductTable
              title='Most selected in Build Your Stack'
              description='Products shoppers picked themselves inside a stack they built.'
              rows={data.mostSelectedInBuildYourStack}
            />
            <ProductTable
              title='Most included across all bundles'
              description='Every product that shipped inside a bundle, including merchant-composed curated stacks.'
              rows={data.mostIncludedInBundles}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
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
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted'>{icon}</div>
        <div className='min-w-0'>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='text-2xl font-bold'>{value}</p>
          {sub && <p className='text-xs text-muted-foreground'>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: BundleAnalyticsResult["mostSelectedInBuildYourStack"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='p-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className='text-right'>Units</TableHead>
              <TableHead className='text-right'>Bundles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className='py-8 text-center text-sm text-muted-foreground'>
                  No data in this range.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.productId}>
                <TableCell className='font-medium'>{row.name}</TableCell>
                <TableCell className='text-right'>{count(row.units)}</TableCell>
                <TableCell className='text-right text-muted-foreground'>{count(row.instances)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
