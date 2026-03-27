'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PendingTaskVM, ToastVariant } from '@/lib/api'

interface ToastNotificationProps {
  task: PendingTaskVM
  onDismiss: (id: string) => void
  autoDismissMs?: number
}

const TOAST_AUTO_DISMISS_MS = 5_000

function getVariantStyles(variant: ToastVariant): {
  borderColor: string
  bgColor: string
  iconBg: string
  iconColor: string
  titleColor: string
  icon: React.ReactNode
} {
  switch (variant) {
    case 'new_order':
      return {
        borderColor: 'border-sky-200',
        bgColor: 'bg-white',
        iconBg: 'bg-sky-100',
        iconColor: 'text-sky-600',
        titleColor: 'text-slate-900',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        ),
      }
    case 'new_appointment':
      return {
        borderColor: 'border-cyan-200',
        bgColor: 'bg-white',
        iconBg: 'bg-cyan-100',
        iconColor: 'text-cyan-600',
        titleColor: 'text-slate-900',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      }
    case 'sync_failed':
      return {
        borderColor: 'border-rose-200',
        bgColor: 'bg-white',
        iconBg: 'bg-rose-100',
        iconColor: 'text-rose-600',
        titleColor: 'text-slate-900',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
      }
    case 'followup_overdue':
      return {
        borderColor: 'border-amber-200',
        bgColor: 'bg-white',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        titleColor: 'text-slate-900',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      }
    case 'medical_record_pushed':
      return {
        borderColor: 'border-emerald-200',
        bgColor: 'bg-white',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        titleColor: 'text-slate-900',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      }
    default:
      return {
        borderColor: 'border-slate-200',
        bgColor: 'bg-white',
        iconBg: 'bg-slate-100',
        iconColor: 'text-slate-600',
        titleColor: 'text-slate-900',
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      }
  }
}

export default function ToastNotification({
  task,
  onDismiss,
  autoDismissMs = TOAST_AUTO_DISMISS_MS,
}: ToastNotificationProps) {
  const router = useRouter()
  const [isExiting, setIsExiting] = useState(false)
  const styles = getVariantStyles(task.toastVariant)

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(task.id)
    }, 300)
  }

  const handleAction = () => {
    if (task.actionHref) {
      router.push(task.actionHref)
    }
    handleDismiss()
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss()
    }, autoDismissMs)

    return () => clearTimeout(timer)
  }, [autoDismissMs])

  return (
    <div
      className={`
        relative flex w-80 items-start gap-3 rounded-xl border p-4 shadow-lg
        ${styles.borderColor} ${styles.bgColor}
        transition-all duration-300
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
      role="alert"
      aria-live="polite"
    >
      {/* Icon */}
      <div className={`shrink-0 rounded-lg p-2 ${styles.iconBg} ${styles.iconColor}`}>
        {styles.icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${styles.titleColor}`}>{task.title}</p>
        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{task.summary}</p>

        {task.actionLabel && task.actionHref && (
          <button
            type="button"
            onClick={handleAction}
            className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {task.actionLabel}
          </button>
        )}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
