'use client'

import { create } from 'zustand'
import {
  MerchantSyncStatusVM,
  PendingTaskVM,
  getMerchantSyncStatus,
  getMerchantPendingTasks,
  ApiError,
} from '@/lib/api'

// Deduplication window in milliseconds (30 seconds as per Phase 4 contract)
const DEDUPE_WINDOW_MS = 30_000

// Max visible toasts at once
const MAX_VISIBLE_TOASTS = 3

interface MerchantRealtimeState {
  // Sync status (for dashboard cards)
  syncStatus: MerchantSyncStatusVM | null
  isLoadingSyncStatus: boolean
  syncStatusError: string | null

  // Pending tasks
  pendingTasks: PendingTaskVM[]
  lastCursor: string | null
  isPollingTasks: boolean
  pollingError: string | null

  // Active toasts (visible, deduped)
  activeToasts: PendingTaskVM[]

  // Deduplication: track recently shown dedupe keys with timestamps
  recentlyShownKeys: Map<string, number>

  // Actions
  fetchSyncStatus: () => Promise<void>
  fetchPendingTasks: () => Promise<void>
  enqueueToasts: (tasks: PendingTaskVM[]) => void
  dismissToast: (id: string) => void
  clearTransientTasks: () => void
  clearAll: () => void
}

export const useMerchantRealtimeStore = create<MerchantRealtimeState>((set, get) => ({
  syncStatus: null,
  isLoadingSyncStatus: false,
  syncStatusError: null,

  pendingTasks: [],
  lastCursor: null,
  isPollingTasks: false,
  pollingError: null,

  activeToasts: [],
  recentlyShownKeys: new Map(),

  fetchSyncStatus: async () => {
    set({ isLoadingSyncStatus: true, syncStatusError: null })
    try {
      const status = await getMerchantSyncStatus()
      set({ syncStatus: status, isLoadingSyncStatus: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load sync status'
      set({ syncStatusError: message, isLoadingSyncStatus: false })
    }
  },

  fetchPendingTasks: async () => {
    const { lastCursor, recentlyShownKeys } = get()
    const now = Date.now()

    // Clean up expired dedupe keys
    const expiredKeys = Array.from(recentlyShownKeys.entries())
      .filter(([, timestamp]) => now - timestamp > DEDUPE_WINDOW_MS)
    if (expiredKeys.length > 0) {
      const updated = new Map(recentlyShownKeys)
      expiredKeys.forEach(([key]) => updated.delete(key))
      set({ recentlyShownKeys: updated })
    }

    set({ isPollingTasks: true, pollingError: null })
    try {
      const response = await getMerchantPendingTasks({ cursor: lastCursor })

      // Deduplicate: filter out tasks whose dedupe_key is in the recent window
      const newTasks = response.tasks.filter((task) => {
        const shownAt = recentlyShownKeys.get(task.dedupeKey)
        if (shownAt && now - shownAt < DEDUPE_WINDOW_MS) {
          return false // Already shown recently
        }
        return true
      })

      set((state) => ({
        pendingTasks: newTasks,
        lastCursor: response.cursor,
        isPollingTasks: false,
      }))

      // Enqueue toasts for new tasks
      if (newTasks.length > 0) {
        get().enqueueToasts(newTasks)
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load pending tasks'
      set({ pollingError: message, isPollingTasks: false })
    }
  },

  enqueueToasts: (tasks: PendingTaskVM[]) => {
    set((state) => {
      const now = Date.now()
      const updatedRecentlyShown = new Map(state.recentlyShownKeys)

      // Mark these tasks as shown
      tasks.forEach((task) => {
        updatedRecentlyShown.set(task.dedupeKey, now)
      })

      // Merge with existing active toasts (up to MAX_VISIBLE_TOASTS)
      const merged = [...state.activeToasts, ...tasks].slice(0, MAX_VISIBLE_TOASTS)

      return {
        activeToasts: merged,
        recentlyShownKeys: updatedRecentlyShown,
      }
    })
  },

  dismissToast: (id: string) => {
    set((state) => ({
      activeToasts: state.activeToasts.filter((t) => t.id !== id),
    }))
  },

  clearTransientTasks: () => {
    set({ pendingTasks: [], lastCursor: null })
  },

  clearAll: () => {
    set({
      syncStatus: null,
      isLoadingSyncStatus: false,
      syncStatusError: null,
      pendingTasks: [],
      lastCursor: null,
      isPollingTasks: false,
      pollingError: null,
      activeToasts: [],
      recentlyShownKeys: new Map(),
    })
  },
}))
