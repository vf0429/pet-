'use client'

import { ShopOrderStatus } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { getOrderActionLabel, getOrderStatusLabel } from '@/lib/i18n-labels'

interface StatusBadgeProps {
  status: ShopOrderStatus | string
  size?: 'sm' | 'md'
  className?: string
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  pending: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  paid: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  preparing: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  shipped: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  completed: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    dot: 'bg-slate-400',
  },
}

export default function StatusBadge({
  status,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const { locale } = useI18n()
  const config = STATUS_CONFIG[status] || {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {getOrderStatusLabel(locale, status)}
    </span>
  )
}

export function getStatusActionLabel(status: ShopOrderStatus, locale: 'en' | 'zh-HK' = 'en'): string {
  return getOrderActionLabel(locale, status)
}

export function canCancel(status: ShopOrderStatus): boolean {
  return ['pending', 'paid', 'preparing'].includes(status)
}

export function canPrepare(status: ShopOrderStatus): boolean {
  return status === 'paid'
}

export function canShip(status: ShopOrderStatus): boolean {
  return status === 'preparing'
}

export function canComplete(status: ShopOrderStatus): boolean {
  return status === 'shipped'
}
