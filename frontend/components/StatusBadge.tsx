'use client'

import { ShopOrderStatus } from '@/lib/api'

interface StatusBadgeProps {
  status: ShopOrderStatus | string
  size?: 'sm' | 'md'
  className?: string
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: {
    label: '待付款',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  paid: {
    label: '已付款',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  preparing: {
    label: '备货中',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  shipped: {
    label: '配送中',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  completed: {
    label: '已完成',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: '已取消',
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
  const config = STATUS_CONFIG[status] || {
    label: status,
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
      {config.label}
    </span>
  )
}

// Helper to get action buttons text
export function getStatusActionLabel(status: ShopOrderStatus): string {
  switch (status) {
    case 'paid':
      return '确认备货'
    case 'preparing':
      return '发货'
    case 'shipped':
      return '完成订单'
    case 'pending':
      return '取消订单'
    default:
      return ''
  }
}

// Helper to check if status can be cancelled
export function canCancel(status: ShopOrderStatus): boolean {
  return ['pending', 'paid', 'preparing'].includes(status)
}

// Helper to check if status allows preparing action (paid → preparing)
export function canPrepare(status: ShopOrderStatus): boolean {
  return status === 'paid'
}

// Helper to check if status allows shipping action
export function canShip(status: ShopOrderStatus): boolean {
  return status === 'preparing'
}

// Helper to check if status allows completion
export function canComplete(status: ShopOrderStatus): boolean {
  return status === 'shipped'
}
