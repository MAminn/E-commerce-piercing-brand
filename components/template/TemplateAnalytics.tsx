import type React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  MousePointer,
  Target,
  Zap,
  Calendar,
  Download,
  RefreshCw,
} from "lucide-react";
import type { TemplateCategory } from "#root/components/template-system/templateConfig";

// TODO: Implement analytics service
const analyticsService = {
  trackTemplateView: () => {},
  trackTemplateInteraction: () => {},
  getTemplateAnalytics: () => ({}),
  getAnalytics: async (filters?: any) => [] as any[],
};
const templateUtils = {
  formatAnalytics: (item: any) => item,
};
type TemplateAnalytics = Record<string, any>;

interface TemplateAnalyticsProps {
  templateId?: string;
  category?: TemplateCategory;
  showComparison?: boolean;
  timeRange?: "7d" | "30d" | "90d" | "1y";
}

interface AnalyticsData {
  date: string;
  views: number;
  conversions: number;
  conversionRate: number;
  performanceScore: number;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  description?: string;
}

function MetricCard({
  title,
  value,
  change,
  icon,
  trend,
  description,
}: MetricCardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case "up":
        return "text-green-600";
      case "down":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return <TrendingUp className='w-4 h-4' />;
      case "down":
        return <TrendingDown className='w-4 h-4' />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent className='p-6'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <div className='p-2 bg-blue-100 rounded-lg'>{icon}</div>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                {title}
              </p>
              <p className='text-2xl font-bold'>{value}</p>
              {description && (
                <p className='text-xs text-muted-foreground mt-1'>
                  {description}
                </p>
              )}
            </div>
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 ${getTrendColor()}`}>
              {getTrendIcon()}
              <span className='text-sm font-medium'>
                {change > 0 ? "+" : ""}
                {change}%
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplateAnalyticsComponent({
  templateId,
  category,
  showComparison = false,
  timeRange = "30d",
}: TemplateAnalyticsProps) {
  const [analytics, setAnalytics] = useState<TemplateAnalytics[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Mock historical data for charts
  const [chartData, setChartData] = useState<AnalyticsData[]>([]);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters = templateId
        ? { templateId }
        : category
        ? { category }
        : {};
      const data = await analyticsService.getAnalytics(filters);
      setAnalytics(data);

      // Generate mock historical data for demonstration
      generateMockChartData(data[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [templateId, category]);

  const generateMockChartData = (baseAnalytics: TemplateAnalytics | null) => {
    const days =
      selectedTimeRange === "7d"
        ? 7
        : selectedTimeRange === "30d"
        ? 30
        : selectedTimeRange === "90d"
        ? 90
        : 365;
    const data: AnalyticsData[] = [];

    const baseViews = baseAnalytics
      ? Number.parseInt(baseAnalytics.views)
      : 1000;
    const baseConversions = baseAnalytics
      ? Number.parseInt(baseAnalytics.conversions)
      : 50;
    const baseScore = baseAnalytics
      ? Number.parseFloat(baseAnalytics.performanceScore)
      : 85;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      const views = Math.floor(
        (baseViews * (0.7 + Math.random() * 0.6)) / days
      );
      const conversions = Math.floor(
        (baseConversions * (0.7 + Math.random() * 0.6)) / days
      );
      const conversionRate = views > 0 ? (conversions / views) * 100 : 0;
      const performanceScore = baseScore + (Math.random() - 0.5) * 20;

      const dateString =
        date.toISOString().split("T")[0] || date.toISOString().substring(0, 10);

      data.push({
        date: dateString,
        views,
        conversions,
        conversionRate: Math.round(conversionRate * 100) / 100,
        performanceScore: Math.round(performanceScore * 10) / 10,
      });
    }

    setChartData(data);
  };

  const refreshAnalytics = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const aggregatedMetrics = analytics.reduce(
    (acc, item) => {
      const formatted = templateUtils.formatAnalytics(item);
      acc.totalViews += Number.parseInt(item.views || "0");
      acc.totalConversions += Number.parseInt(item.conversions || "0");
      acc.avgConversionRate += Number.parseFloat(item.conversionRate || "0");
      acc.avgPerformanceScore += Number.parseFloat(
        item.performanceScore || "0"
      );
      return acc;
    },
    {
      totalViews: 0,
      totalConversions: 0,
      avgConversionRate: 0,
      avgPerformanceScore: 0,
    }
  );

  if (analytics.length > 0) {
    aggregatedMetrics.avgConversionRate /= analytics.length;
    aggregatedMetrics.avgPerformanceScore /= analytics.length;
  }

  const pieData = [
    {
      name: "Conversions",
      value: aggregatedMetrics.totalConversions,
      color: "#3b82f6",
    },
    {
      name: "Views",
      value: aggregatedMetrics.totalViews - aggregatedMetrics.totalConversions,
      color: "#e5e7eb",
    },
  ];

  if (loading) {
    return (
      <div className='space-y-6'>
        <div className='flex items-center justify-center py-12'>
          <div className='text-center'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
            <p className='text-muted-foreground'>Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className='p-6'>
          <div className='text-center'>
            <p className='text-red-600 mb-4'>{error}</p>
            <Button onClick={loadAnalytics} variant='outline'>
              <RefreshCw className='w-4 h-4 mr-2' />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Template Analytics
          </h2>
          <p className='text-muted-foreground'>
            Performance insights and usage statistics
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Select
            value={selectedTimeRange}
            onValueChange={(value: "7d" | "30d" | "90d" | "1y") =>
              setSelectedTimeRange(value)
            }>
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='7d'>Last 7 days</SelectItem>
              <SelectItem value='30d'>Last 30 days</SelectItem>
              <SelectItem value='90d'>Last 90 days</SelectItem>
              <SelectItem value='1y'>Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant='outline'
            size='sm'
            onClick={refreshAnalytics}
            disabled={refreshing}>
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button variant='outline' size='sm'>
            <Download className='w-4 h-4 mr-2' />
            Export
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <MetricCard
          title='Total Views'
          value={aggregatedMetrics.totalViews.toLocaleString()}
          change={12.5}
          trend='up'
          icon={<Eye className='w-5 h-5 text-blue-600' />}
          description='Page impressions'
        />
        <MetricCard
          title='Conversions'
          value={aggregatedMetrics.totalConversions.toLocaleString()}
          change={8.2}
          trend='up'
          icon={<Target className='w-5 h-5 text-green-600' />}
          description='Goal completions'
        />
        <MetricCard
          title='Conversion Rate'
          value={`${aggregatedMetrics.avgConversionRate.toFixed(2)}%`}
          change={-2.1}
          trend='down'
          icon={<MousePointer className='w-5 h-5 text-orange-600' />}
          description='Conversion percentage'
        />
        <MetricCard
          title='Performance Score'
          value={`${aggregatedMetrics.avgPerformanceScore.toFixed(1)}/10`}
          change={5.3}
          trend='up'
          icon={<Zap className='w-5 h-5 text-purple-600' />}
          description='Overall performance'
        />
      </div>

      {/* Charts */}
      <div className='grid gap-6 md:grid-cols-2'>
        {/* Views and Conversions Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Views & Conversions Trend</CardTitle>
            <CardDescription>
              Daily views and conversions over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  dataKey='date'
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString()
                  }
                />
                <Line
                  type='monotone'
                  dataKey='views'
                  stroke='#3b82f6'
                  strokeWidth={2}
                  name='Views'
                />
                <Line
                  type='monotone'
                  dataKey='conversions'
                  stroke='#10b981'
                  strokeWidth={2}
                  name='Conversions'
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Conversion Rate Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Rate</CardTitle>
            <CardDescription>
              Conversion rate percentage over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  dataKey='date'
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString()
                  }
                  formatter={(value: number | undefined) => [
                    `${value ?? 0}%`,
                    "Conversion Rate" as const,
                  ]}
                />
                <Bar dataKey='conversionRate' fill='#f59e0b' />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance and Distribution */}
      <div className='grid gap-6 md:grid-cols-2'>
        {/* Performance Score Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Score</CardTitle>
            <CardDescription>
              Template performance score over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  dataKey='date'
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString()
                  }
                  formatter={(value: number | undefined) => [
                    `${value ?? 0}/10`,
                    "Performance Score" as const,
                  ]}
                />
                <Line
                  type='monotone'
                  dataKey='performanceScore'
                  stroke='#8b5cf6'
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Conversion Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Distribution</CardTitle>
            <CardDescription>Breakdown of views vs conversions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx='50%'
                  cy='50%'
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey='value'>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), "" as const]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className='flex justify-center gap-4 mt-4'>
              {pieData.map((entry) => (
                <div key={entry.name} className='flex items-center gap-2'>
                  <div
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className='text-sm'>{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template List */}
      {analytics.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Template Performance Comparison</CardTitle>
            <CardDescription>
              Compare performance across different templates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {analytics.map((item) => {
                const formatted = templateUtils.formatAnalytics(item);
                return (
                  <div
                    key={item.id}
                    className='flex items-center justify-between p-4 border rounded-lg'>
                    <div>
                      <h4 className='font-medium'>
                        {item.template?.name || "Unknown Template"}
                      </h4>
                      <p className='text-sm text-muted-foreground'>
                        {item.template?.description || "No description"}
                      </p>
                    </div>
                    <div className='flex items-center gap-6 text-sm'>
                      <div className='text-center'>
                        <p className='font-medium'>{formatted.views}</p>
                        <p className='text-muted-foreground'>Views</p>
                      </div>
                      <div className='text-center'>
                        <p className='font-medium'>{formatted.conversions}</p>
                        <p className='text-muted-foreground'>Conversions</p>
                      </div>
                      <div className='text-center'>
                        <p className='font-medium'>
                          {formatted.conversionRate}
                        </p>
                        <p className='text-muted-foreground'>Rate</p>
                      </div>
                      <div className='text-center'>
                        <p className='font-medium'>
                          {formatted.performanceScore}
                        </p>
                        <p className='text-muted-foreground'>Score</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
