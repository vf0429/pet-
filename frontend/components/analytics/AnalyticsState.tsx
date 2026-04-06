'use client'

interface AnalyticsStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  tone?: 'empty' | 'error'
}

export default function AnalyticsState({
  title,
  description,
  actionLabel,
  onAction,
  tone = 'empty',
}: AnalyticsStateProps) {
  const toneClass =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-white text-slate-600'

  return (
    <div className={`rounded-2xl border p-6 text-center shadow-sm ${toneClass}`}>
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="mt-2 text-sm">{description}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
