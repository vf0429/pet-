'use client'

import { create } from 'zustand'

import {
  AnalyticsPeriod,
  ApiError,
  ClinicAnalyticsVM,
  GetAnalyticsParams,
  ShopAnalyticsVM,
  getClinicAnalytics,
  getShopAnalytics,
} from '@/lib/api'
import { getPreferredLocale, translate } from '@/lib/i18n'

interface ShopAnalyticsState {
  period: AnalyticsPeriod
  data: ShopAnalyticsVM | null
  isLoading: boolean
  error: string | null
  setPeriod: (period: AnalyticsPeriod) => void
  fetchAnalytics: (params?: GetAnalyticsParams) => Promise<void>
  clear: () => void
}

interface ClinicAnalyticsState {
  period: AnalyticsPeriod
  data: ClinicAnalyticsVM | null
  isLoading: boolean
  error: string | null
  setPeriod: (period: AnalyticsPeriod) => void
  fetchAnalytics: (params?: GetAnalyticsParams) => Promise<void>
  clear: () => void
}

export const useShopAnalyticsStore = create<ShopAnalyticsState>((set, get) => ({
  period: '7d',
  data: null,
  isLoading: false,
  error: null,

  setPeriod: (period) => set({ period }),

  fetchAnalytics: async (params) => {
    const period = params?.period ?? get().period
    set({ isLoading: true, error: null })

    try {
      const data = await getShopAnalytics({ ...params, period })
      set({ data, isLoading: false, period })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : translate(getPreferredLocale(), 'Unable to load data', '資料載入失敗')
      set({ error: message, isLoading: false, period })
    }
  },

  clear: () => set({ data: null, error: null, isLoading: false, period: '7d' }),
}))

export const useClinicAnalyticsStore = create<ClinicAnalyticsState>((set, get) => ({
  period: '7d',
  data: null,
  isLoading: false,
  error: null,

  setPeriod: (period) => set({ period }),

  fetchAnalytics: async (params) => {
    const period = params?.period ?? get().period
    set({ isLoading: true, error: null })

    try {
      const data = await getClinicAnalytics({ ...params, period })
      set({ data, isLoading: false, period })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : translate(getPreferredLocale(), 'Unable to load data', '資料載入失敗')
      set({ error: message, isLoading: false, period })
    }
  },

  clear: () => set({ data: null, error: null, isLoading: false, period: '7d' }),
}))
