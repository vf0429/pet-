'use client'

import { MerchantSyncStatusVM, SyncChannelVM } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { getPushConsumerStatusLabel } from '@/lib/i18n-labels'

interface SyncStatusCardProps {
  syncStatus: MerchantSyncStatusVM | null
  isLoading?: boolean
  businessType: 'shop' | 'clinic'
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
  const { pick, formatRelativeTime } = useI18n()

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        <span className="text-slate-600">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-right">
        {channel.pendingCount > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {pick('{count} pending', '{count} 筆待處理', { count: channel.pendingCount })}
          </span>
        )}
        {channel.failedCount > 0 && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            {pick('{count} failed', '{count} 筆失敗', { count: channel.failedCount })}
          </span>
        )}
        <span className="text-xs text-slate-400">{formatRelativeTime(channel.lastSyncedAt)}</span>
      </div>
    </div>
  )
}

export default function SyncStatusCard({ syncStatus, isLoading, businessType }: SyncStatusCardProps) {
  const isShop = businessType === 'shop'
  const { pick, formatRelativeTime, locale } = useI18n()

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
        <h3 className="text-sm font-medium text-slate-500">{pick('App sync status', 'App 同步狀態')}</h3>
        <p className="mt-2 text-xs text-slate-400">{pick('No data available', '目前沒有資料')}</p>
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
        <h3 className="text-sm font-semibold text-slate-900">{pick('App sync status', 'App 同步狀態')}</h3>
        {syncStatus.apiKey && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {syncStatus.apiKey.masked}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {isShop ? (
          <SyncRow label={pick('Orders', '訂單')} channel={syncStatus.orders} />
        ) : (
          <>
            <SyncRow label={pick('Appointments', '預約')} channel={syncStatus.appointments} />
            <SyncRow label={pick('Medical records', '病歷')} channel={syncStatus.medicalRecords} />
          </>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${pushDotColor}`} />
            <span className="text-slate-600">{pick('Push service', '推送服務')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {pick('{count} sent today', '今日已發送 {count} 筆', { count: pushStatus.notificationsSentToday })}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pushColor} bg-slate-50`}>
              {getPushConsumerStatusLabel(locale, pushStatus.consumerStatus)}
            </span>
          </div>
        </div>
        {pushStatus.lastSuccessAt && (
          <p className="mt-1 text-xs text-slate-400">
            {pick('Last success: {time}', '上次成功：{time}', { time: formatRelativeTime(pushStatus.lastSuccessAt) })}
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {pick('Updated {time}', '更新於 {time}', { time: formatRelativeTime(syncStatus.generatedAt) })}
      </p>
    </div>
  )
}
