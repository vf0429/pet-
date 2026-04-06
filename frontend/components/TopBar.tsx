'use client'

import { useI18n } from '@/lib/i18n'

interface TopBarProps {
  title: string
  subtitle?: string
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { locale, setLocale, pick } = useI18n()
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <div>
        <p className="text-lg font-semibold text-slate-900">{title}</p>
        {subtitle ? (
          <p className="text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLocale(locale === 'en' ? 'zh-HK' : 'en')}
          className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
        >
          {locale === 'en' ? '繁中' : 'EN'}
        </button>
        <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
          {pick('Session active', '工作階段啟用中')}
        </span>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          aria-label={pick('Notifications', '通知')}
        >
          <span className="text-lg">🔔</span>
        </button>
      </div>
    </header>
  )
}
