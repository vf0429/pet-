'use client'

interface AnalyticsMetricCardProps {
  label: string
  value: string
  accentClassName: string
}

export default function AnalyticsMetricCard({
  label,
  value,
  accentClassName,
}: AnalyticsMetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`h-1.5 w-16 rounded-full ${accentClassName}`} />
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
    </div>
  )
}
