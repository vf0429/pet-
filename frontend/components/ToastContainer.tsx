'use client'

import { useMerchantRealtimeStore } from '@/store/realtime'
import ToastNotification from './ToastNotification'

/**
 * Global Toast container mounted in layout.
 * Renders up to MAX_VISIBLE_TOASTS (3) active toasts stacked in the top-right corner.
 */
export default function ToastContainer() {
  const { activeToasts, dismissToast } = useMerchantRealtimeStore()

  if (activeToasts.length === 0) {
    return null
  }

  return (
    <div
      aria-label="Notifications"
      className="fixed right-4 top-20 z-50 flex flex-col gap-3"
    >
      {activeToasts.map((task) => (
        <ToastNotification
          key={task.id}
          task={task}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  )
}
