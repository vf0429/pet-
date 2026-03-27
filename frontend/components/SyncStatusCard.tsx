'use client'

import { MerchantSyncStatusVM, SyncChannelVM } from '@/lib/api'

interface SyncStatusCardProps {
  syncStatus: MerchantSyncStatusVM | null
  isLoading?: boolean
  businessType: 'shop' | 'clinic'
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never'
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString('en-HK')
}

function getChannelStatus(channel: SyncChannelVM): 'healthy' | 'warning' | 'error' {
  if (channel.deadLetterCount > 0) return 'error'
  if (channel.failedCount > 0) return 'warning'
  if (channel.pendingCount > 0) return 'warning'
  return 'healthy'
}

function getStatusColor(status: 'healthy' | 'warning' | 'error'): {
  dot: string
  text: string
} {
  switch (status) {
    case 'healthy':
      return { dot: 'bg-emerald-500', text: 'text-emerald-700' }
    case 'warning':
      return { dot: 'bg-amber-500', text: 'text-amber-700' }
    case 'error':
      return { dot: 'bg-rose-500', text: 'text-rose-700' }
  }
}

function SyncRow({ label, channel }: { label: string; channel: SyncChannelVM }) {
  const status = getChannelStatus(channel)
  const colors = getStatusColor(status)

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        <span className="text-slate-600">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-right">
        {channel.pendingCount > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {channel.pendingCount} pending
          </span>
        )}
        {channel.failedCount > 0 && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            {channel.failedCount} failed
          </span>
        )}
        <span className="text-xs text-slate-400">{formatRelativeTime(channel.lastSyncedAt)}</span>
      </div>
    </div>
  )
}

export default function SyncStatusCard({ syncStatus, isLoading, businessType }: SyncStatusCardProps) {
  const isShop = businessType === 'shop'

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="mb-2 h-4 w-32 rounded bg-slate-200" />
          <div className="h-3 w-48 rounded bg-slate-200" />
          <div className="h-3 w-40 rounded bg-slate-200" />
        </div>
      </div>
    )
  }

  if (!syncStatus) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-slate-500">App 同步状态</h3>
        <p className="mt-2 text-xs text-slate-400">No data available</p>
      </div>
    )
  }

  const pushStatus = syncStatus.push
  const pushHealthy = pushStatus.consumerStatus === 'healthy'
  const pushColor = pushHealthy ? 'text-emerald-700' : pushStatus.consumerStatus === 'degraded' ? 'text-amber-700' : 'text-rose-700'
  const pushDotColor = pushHealthy ? 'bg-emerald-500' : pushStatus.consumerStatus === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">App 同步状态</h3>
        {syncStatus.apiKey && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {syncStatus.apiKey.masked}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {isShop ? (
          <SyncRow label="订单" channel={syncStatus.orders} />
        ) : (
          <>
            <SyncRow label="预约" channel={syncStatus.appointments} />
            <SyncRow label="病历" channel={syncStatus.medicalRecords} />
          </>
        )}
      </div>

      {/* Push status */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${pushDotColor}`} />
            <span className="text-slate-600">推送服务</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {pushStatus.notificationsSentToday} sent today
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pushColor} bg-slate-50`}>
              {pushStatus.consumerStatus}
            </span>
          </div>
        </div>
        {pushStatus.lastSuccessAt && (
          <p className="mt-1 text-xs text-slate-400">
            Last success: {formatRelativeTime(pushStatus.lastSuccessAt)}
          </p>
        )}
      </div>

      {/* Generated at */}
      <p className="mt-3 text-xs text-slate-400">
        Updated {formatRelativeTime(syncStatus.generatedAt)}
      </p>
    </div>
  )
}
