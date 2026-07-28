'use client'

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Locale = 'en' | 'zh-HK'

const STORAGE_KEY = 'pawrd-merchant-locale'
const DEFAULT_LOCALE: Locale = 'en'

export function normalizeLocale(input?: string | null): Locale {
  if (!input) return DEFAULT_LOCALE
  const value = input.toLowerCase()
  if (value === 'zh-hk' || value === 'zh-tw' || value === 'zh-mo' || value === 'zh-hant') {
    return 'zh-HK'
  }
  if (value.startsWith('zh')) {
    return 'zh-HK'
  }
  return 'en'
}

export function getPreferredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored) return normalizeLocale(stored)
  return normalizeLocale(window.navigator.language)
}

export function pickByLocale(locale: Locale, en: string, zhHK: string): string {
  return locale === 'zh-HK' ? zhHK : en
}

function interpolate(template: string, params?: Record<string, string | number | null | undefined>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === null || value === undefined ? '' : String(value)
  })
}

export function translate(locale: Locale, en: string, zhHK: string, params?: Record<string, string | number | null | undefined>) {
  return interpolate(pickByLocale(locale, en, zhHK), params)
}

export function formatDateByLocale(locale: Locale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function formatTimeByLocale(locale: Locale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return formatDateByLocale(locale, value, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  })
}

export function formatDateTimeByLocale(locale: Locale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return formatDateByLocale(locale, value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

export function formatCurrencyByLocale(locale: Locale, amount: number, currency: string = 'HKD') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatRelativeTimeByLocale(locale: Locale, isoString: string | null): string {
  if (!isoString) return pickByLocale(locale, 'Never', '從未')

  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return pickByLocale(locale, 'Just now', '剛剛')
  if (diffMin < 60) return locale === 'zh-HK' ? `${diffMin} 分鐘前` : `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return locale === 'zh-HK' ? `${diffHr} 小時前` : `${diffHr}h ago`

  return formatDateByLocale(locale, date)
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  pick: (en: string, zhHK: string, params?: Record<string, string | number | null | undefined>) => string
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
  formatTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
  formatDateTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
  formatCurrency: (amount: number, currency?: string) => string
  formatRelativeTime: (isoString: string | null) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    const nextLocale = getPreferredLocale()
    setLocaleState(nextLocale)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
  }, [])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    pick: (en, zhHK, params) => translate(locale, en, zhHK, params),
    formatDate: (value, options) => formatDateByLocale(locale, value, options),
    formatTime: (value, options) => formatTimeByLocale(locale, value, options),
    formatDateTime: (value, options) => formatDateTimeByLocale(locale, value, options),
    formatCurrency: (amount, currency) => formatCurrencyByLocale(locale, amount, currency),
    formatRelativeTime: (isoString) => formatRelativeTimeByLocale(locale, isoString),
  }), [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
