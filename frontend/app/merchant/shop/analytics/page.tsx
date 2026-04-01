'use client'

import { useEffect } from 'react'

import AnalyticsMetricCard from '@/components/analytics/AnalyticsMetricCard'
import AnalyticsState from '@/components/analytics/AnalyticsState'
import AnalyticsToolbar from '@/components/analytics/AnalyticsToolbar'
import ShopAnalyticsCharts from '@/components/analytics/ShopAnalyticsCharts'
import { useI18n } from '@/lib/i18n'
import { useShopAnalyticsStore } from '@/store/analytics'

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
  const { pick, formatCurrency } = useI18n()

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
        title={pick('Sales analytics', '銷售數據分析')}
        subtitle={pick('Review sales trends, category mix, and best-performing products.', '查看銷售趨勢、品類構成與熱銷商品表現。')}
        period={period}
        onPeriodChange={setPeriod}
        isLoading={isLoading}
      />

      {isLoading && !data ? <PageSkeleton /> : null}

      {!isLoading && error ? (
        <AnalyticsState
          title={pick('Unable to load data', '資料載入失敗')}
          description={error}
          actionLabel={pick('Retry', '重試')}
          onAction={() => fetchAnalytics({ period })}
          tone="error"
        />
      ) : null}

      {!isLoading && !error && data && !hasData ? (
        <AnalyticsState title={pick('No data for the selected range', '目前沒有資料，請選擇其他時間範圍')} />
      ) : null}

      {!error && data && hasData ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsMetricCard label={pick('Total revenue', '總營收')} value={formatCurrency(data.summary.totalRevenue)} accentClassName="bg-blue-600" />
            <AnalyticsMetricCard label={pick('Total orders', '總訂單數')} value={String(data.summary.totalOrders)} accentClassName="bg-blue-500" />
            <AnalyticsMetricCard label={pick('Average order value', '客單價')} value={formatCurrency(data.summary.avgOrderValue)} accentClassName="bg-blue-400" />
            <AnalyticsMetricCard label={pick('Repeat purchase rate', '回購率')} value={formatPercent(data.summary.repeatPurchaseRate)} accentClassName="bg-blue-300" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-blue-50/70 px-4 py-3 text-sm text-slate-600 shadow-sm">
            {pick('Reporting period: {from} to {to}', '統計週期：{from} 至 {to}', { from: data.period.from, to: data.period.to })}
          </div>

          <ShopAnalyticsCharts data={data} />
        </>
      ) : null}
    </div>
  )
}
