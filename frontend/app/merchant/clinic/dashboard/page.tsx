'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useClinicDashboardStore } from '@/store/clinic'
import { useMerchantRealtimeStore } from '@/store/realtime'
import { usePendingTasks } from '@/hooks/usePendingTasks'
import KPICard from '@/components/KPICard'
import StatusBadge from '@/components/StatusBadge'
import SyncStatusCard from '@/components/SyncStatusCard'
import { useI18n } from '@/lib/i18n'
import { getVisitTypeLabel } from '@/lib/i18n-labels'

export default function ClinicDashboardPage() {
  const {
    stats,
    isLoadingStats,
    statsError,
    fetchDashboardData,
  } = useClinicDashboardStore()

  // Phase 4B: Start pending tasks polling and get sync status
  const { syncStatus, isLoadingSyncStatus, fetchSyncStatus } = useMerchantRealtimeStore()
  usePendingTasks('clinic')
  const { pick, formatTime, formatRelativeTime, locale } = useI18n()

  // Fetch sync status on mount
  useEffect(() => {
    fetchSyncStatus('clinic')
  }, [fetchSyncStatus])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])


  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clinic Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">{pick('Overview of your clinic operations today', '查看今日診所營運概況')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title={pick('Appointments today', '今日預約')}
          value={stats?.todayAppointments ?? '-'}
          delta={stats?.todayAppointmentsDelta !== undefined ? stats.todayAppointmentsDelta : undefined}
          deltaLabel={pick('vs yesterday', '較昨日')}
          isLoading={isLoadingStats}
          href="/merchant/clinic/appointments"
          icon={
            <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <KPICard
          title={pick('Visits in progress', '目前就診中')}
          value={stats?.inProgressVisits ?? '-'}
          isLoading={isLoadingStats}
          href="/merchant/clinic/appointments?status=in_progress"
          icon={
            <svg className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          }
        />
        <KPICard
          title={pick('Pending follow-ups', '待處理回訪')}
          value={stats?.pendingFollowupsOverdue ?? '-'}
          isLoading={isLoadingStats}
          href="/merchant/clinic/followups"
          icon={
            <svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <KPICard
          title={pick('New patients this month', '本月新患者')}
          value={stats?.newPatientsThisMonth ?? '-'}
          isLoading={isLoadingStats}
          icon={
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      </div>

      {/* Error State */}
      {statsError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{statsError}</p>
          <button
            type="button"
            onClick={fetchDashboardData}
            className="mt-2 text-sm font-medium text-rose-700 underline"
          >
            {pick('Retry', '重試')}
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today Appointments List */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{pick("Today's appointments", "今日預約")}</h2>
              <Link
                href="/merchant/clinic/appointments"
                className="text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                {pick('View all', '查看全部')}
              </Link>
            </div>

            {isLoadingStats ? (
              <div className="p-5">
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-slate-200" />
                      <div className="flex-1">
                        <div className="mb-1 h-4 w-24 rounded bg-slate-200" />
                        <div className="h-3 w-32 rounded bg-slate-200" />
                      </div>
                      <div className="h-6 w-16 rounded-full bg-slate-200" />
                    </div>
                  ))}
                </div>
              </div>
            ) : !stats?.todayAppointmentList?.length ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">{pick('No appointments today', '今日沒有預約')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.todayAppointmentList.map((appt) => (
                  <Link
                    key={appt.id}
                    href={`/merchant/clinic/appointments?selected=${appt.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{appt.petName}</p>
                        <span className="text-sm text-slate-400">·</span>
                        <p className="text-sm text-slate-500">{appt.petOwnerName}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {appt.doctorName} · {formatTime(appt.scheduledAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={appt.status} size="sm" />
                      <span className="text-xs text-slate-400 capitalize">{getVisitTypeLabel(locale, appt.visitType)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: App Sync Status + Quick Actions */}
        <div>
          {/* App Sync Status - Real SyncStatusCard */}
          <SyncStatusCard
            syncStatus={syncStatus}
            isLoading={isLoadingSyncStatus}
            businessType="clinic"
          />

          {/* Quick Stats Card */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">{pick('Quick actions', '快速操作')}</h3>
            <div className="mt-3 space-y-2">
              <Link
                href="/merchant/clinic/appointments"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {pick('Appointments', '預約管理')}
              </Link>
              <Link
                href="/merchant/clinic/followups"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {pick('Follow-ups', '回訪管理')}
              </Link>
              <Link
                href="/merchant/clinic/pharmacy"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                {pick('Pharmacy inventory', '藥房庫存')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
