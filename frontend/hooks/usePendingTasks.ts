'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useMerchantRealtimeStore } from '@/store/realtime'

const DEFAULT_POLL_INTERVAL_MS = 30_000 // 30 seconds
const BACKGROUND_POLL_INTERVAL_MS = 120_000 // 2 minutes when hidden

/**
 * Hook that manages polling for pending tasks.
 * Starts polling on mount, stops on unmount.
 * Reduces poll frequency when the document is hidden.
 */
export function usePendingTasks(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS) {
  const { fetchPendingTasks, isPollingTasks } = useMerchantRealtimeStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDocumentHidden = useRef<boolean>(false)

  const startPolling = useCallback(() => {
    if (intervalRef.current) return

    // Immediate first fetch
    fetchPendingTasks()

    const interval = isDocumentHidden.current
      ? BACKGROUND_POLL_INTERVAL_MS
      : pollIntervalMs

    intervalRef.current = setInterval(() => {
      fetchPendingTasks()
    }, interval)
  }, [fetchPendingTasks, pollIntervalMs])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const restartPolling = useCallback(() => {
    stopPolling()
    startPolling()
  }, [stopPolling, startPolling])

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      isDocumentHidden.current = document.hidden

      if (document.hidden) {
        // Switch to background interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = setInterval(() => {
            fetchPendingTasks()
          }, BACKGROUND_POLL_INTERVAL_MS)
        }
      } else {
        // Switch back to normal interval and fetch immediately
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = setInterval(() => {
            fetchPendingTasks()
          }, pollIntervalMs)
        }
        // Fetch immediately when becoming visible
        fetchPendingTasks()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchPendingTasks, pollIntervalMs])

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling()

    return () => {
      stopPolling()
    }
  }, [startPolling, stopPolling])

  return {
    isPolling: isPollingTasks,
    restartPolling,
    stopPolling,
    startPolling,
  }
}
