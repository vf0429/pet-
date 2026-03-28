'use client'

import { useEffect } from 'react'

import AnalyticsMetricCard from '@/components/analytics/AnalyticsMetricCard'
import AnalyticsState from '@/components/analytics/AnalyticsState'
import AnalyticsToolbar from '@/components/analytics/AnalyticsToolbar'
import ClinicAnalyticsCharts from '@/components/analytics/ClinicAnalyticsCharts'
import { useClinicAnalyticsStore } from '@/store/analytics'

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`
const formatMinutes = (value: number | null) => (value === null ? '--' : `${Math.round(value)} 分钟`)

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

export default function ClinicAnalyticsPage() {
  const { data, period, isLoading, error, setPeriod, fetchAnalytics } = useClinicAnalyticsStore()

  useEffect(() => {
    fetchAnalytics({ period })
  }, [fetchAnalytics, period])

  const hasData =
    !!data &&
    (data.summary.totalVisits > 0 ||
      data.dailyVisits.length > 0 ||
      data.diagnosisBreakdown.length > 0 ||
      data.doctorWorkload.length > 0 ||
      data.appointmentAttendance.length > 0)

  return (
    <div className="space-y-6">
      <AnalyticsToolbar
        title="诊疗数据分析"
        subtitle="查看就诊趋势、病种分布、医生负载与预约到场表现。"
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
            <AnalyticsMetricCard label="总就诊数" value={String(data.summary.totalVisits)} accentClassName="bg-cyan-600" />
            <AnalyticsMetricCard label="平均就诊时长" value={formatMinutes(data.summary.avgVisitDurationMin)} accentClassName="bg-cyan-500" />
            <AnalyticsMetricCard label="复诊率" value={formatPercent(data.summary.revisitRate30d)} accentClassName="bg-cyan-400" />
            <AnalyticsMetricCard label="处方率" value={formatPercent(data.summary.prescriptionRate)} accentClassName="bg-cyan-300" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-cyan-50/70 px-4 py-3 text-sm text-slate-600 shadow-sm">
            统计周期：{data.period.from} 至 {data.period.to}
          </div>

          <ClinicAnalyticsCharts data={data} />
        </>
      ) : null}
    </div>
  )
}
