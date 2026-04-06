'use client'

import { useEffect } from 'react'

import AnalyticsMetricCard from '@/components/analytics/AnalyticsMetricCard'
import AnalyticsState from '@/components/analytics/AnalyticsState'
import AnalyticsToolbar from '@/components/analytics/AnalyticsToolbar'
import ClinicAnalyticsCharts from '@/components/analytics/ClinicAnalyticsCharts'
import { useI18n } from '@/lib/i18n'
import { useClinicAnalyticsStore } from '@/store/analytics'

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

export default function ClinicAnalyticsPage() {
  const { data, period, isLoading, error, setPeriod, fetchAnalytics } = useClinicAnalyticsStore()
  const { pick } = useI18n()

  const formatMinutes = (value: number | null) => (value === null ? '--' : pick('{value} mins', '{value} 分鐘', { value: Math.round(value) }))

  useEffect(() => {
    fetchAnalytics({ period })
  }, [fetchAnalytics, period])

  const hasData =
    !!data &&
    (data.summary.totalVisits > 0 ||
      (data.dailyVisits?.length ?? 0) > 0 ||
      (data.diagnosisBreakdown?.length ?? 0) > 0 ||
      (data.doctorWorkload?.length ?? 0) > 0 ||
      (data.appointmentAttendance?.length ?? 0) > 0)

  return (
    <div className="space-y-6">
      <AnalyticsToolbar
        title={pick('Clinical analytics', '診療數據分析')}
        subtitle={pick('Review visit trends, diagnosis mix, doctor workload, and appointment attendance.', '查看就診趨勢、病種分佈、醫生負載與預約到場表現。')}
        period={period}
        onPeriodChange={setPeriod}
        isLoading={isLoading}
      />

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
            <AnalyticsMetricCard label={pick('Total visits', '總就診數')} value={String(data.summary.totalVisits)} accentClassName="bg-cyan-600" />
            <AnalyticsMetricCard label={pick('Average visit duration', '平均就診時長')} value={formatMinutes(data.summary.avgVisitDurationMin)} accentClassName="bg-cyan-500" />
            <AnalyticsMetricCard label={pick('Revisit rate', '覆診率')} value={formatPercent(data.summary.revisitRate30d)} accentClassName="bg-cyan-400" />
            <AnalyticsMetricCard label={pick('Prescription rate', '處方率')} value={formatPercent(data.summary.prescriptionRate)} accentClassName="bg-cyan-300" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-cyan-50/70 px-4 py-3 text-sm text-slate-600 shadow-sm">
            {pick('Reporting period: {from} to {to}', '統計週期：{from} 至 {to}', { from: data.period.from, to: data.period.to })}
          </div>

          <ClinicAnalyticsCharts data={data} />
        </>
      ) : null}
    </div>
  )
}
