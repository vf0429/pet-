'use client'

import { useEffect } from 'react'

import AnalyticsMetricCard from '@/components/analytics/AnalyticsMetricCard'
import AnalyticsState from '@/components/analytics/AnalyticsState'
import AnalyticsToolbar from '@/components/analytics/AnalyticsToolbar'
import ShopAnalyticsCharts from '@/components/analytics/ShopAnalyticsCharts'
import { useShopAnalyticsStore } from '@/store/analytics'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('zh-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="mt-3 h-8 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-64 rounded bg-slate-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    </div>
  )
}

export default function ShopAnalyticsPage() {
  const { data, period, isLoading, error, setPeriod, fetchAnalytics } = useShopAnalyticsStore()

  useEffect(() => {
    fetchAnalytics({ period })
  }, [fetchAnalytics, period])

  const hasData =
    !!data &&
    (data.summary.totalOrders > 0 ||
      data.dailyRevenue.length > 0 ||
      data.categoryBreakdown.length > 0 ||
      data.topProducts.length > 0)

  return (
    <div className="space-y-6">
      <AnalyticsToolbar
        title="销售数据分析"
        subtitle="查看销售趋势、品类构成与热销商品表现。"
        period={period}
        onPeriodChange={setPeriod}
        isLoading={isLoading}
      />

      {isLoading && !data ? <PageSkeleton /> : null}

      {!isLoading && error ? (
        <AnalyticsState
          title="数据加载失败"
          description={error}
          actionLabel="重试"
          onAction={() => fetchAnalytics({ period })}
          tone="error"
        />
      ) : null}

      {!isLoading && !error && data && !hasData ? (
        <AnalyticsState title="暂无数据，请选择其他时间范围" />
      ) : null}

      {!error && data && hasData ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsMetricCard label="总营收" value={formatCurrency(data.summary.totalRevenue)} accentClassName="bg-blue-600" />
            <AnalyticsMetricCard label="总订单数" value={String(data.summary.totalOrders)} accentClassName="bg-blue-500" />
            <AnalyticsMetricCard label="客单价" value={formatCurrency(data.summary.avgOrderValue)} accentClassName="bg-blue-400" />
            <AnalyticsMetricCard label="复购率" value={formatPercent(data.summary.repeatPurchaseRate)} accentClassName="bg-blue-300" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-blue-50/70 px-4 py-3 text-sm text-slate-600 shadow-sm">
            统计周期：{data.period.from} 至 {data.period.to}
          </div>

          <ShopAnalyticsCharts data={data} />
        </>
      ) : null}
    </div>
  )
}
