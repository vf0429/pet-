'use client'

import { AnalyticsPeriod } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { getAnalyticsPeriodLabel } from '@/lib/i18n-labels'

interface AnalyticsToolbarProps {
  title: string
  subtitle: string
  period: AnalyticsPeriod
  onPeriodChange: (period: AnalyticsPeriod) => void
  isLoading?: boolean
}

const PERIOD_OPTIONS: Array<{ value: AnalyticsPeriod }> = [
  { value: '7d' },
  { value: '30d' },
]

export default function AnalyticsToolbar({
  title,
  subtitle,
  period,
  onPeriodChange,
  isLoading = false,
}: AnalyticsToolbarProps) {
  const { locale, pick } = useI18n()

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{pick('Merchant / Analytics', '商戶 / 數據分析')}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1 sm:w-auto">
        {PERIOD_OPTIONS.map((option) => {
          const isActive = option.value === period
          return (
            <button
              key={option.value}
              type="button"
              disabled={isLoading}
              onClick={() => onPeriodChange(option.value)}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition sm:flex-none ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {getAnalyticsPeriodLabel(locale, option.value)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
