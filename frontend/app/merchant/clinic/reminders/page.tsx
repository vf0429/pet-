'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import CreateReminderModal from '@/components/clinic/CreateReminderModal'
import { useI18n } from '@/lib/i18n'
import { useClinicRemindersStore } from '@/store/clinic'
import { ReminderStatus } from '@/lib/api'

const STATUS_TABS: { key: ReminderStatus; labelEn: string; labelZh: string }[] = [
  { key: 'overdue', labelEn: 'Overdue', labelZh: '逾期' },
  { key: 'upcoming', labelEn: 'Upcoming (30d)', labelZh: '即將到期' },
  { key: 'fulfilled', labelEn: 'Fulfilled', labelZh: '已完成' },
]

const IMPORTANCE_COLOR: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

export default function RemindersPage() {
  const {
    reminders,
    total,
    page,
    perPage,
    hasMore,
    activeTab,
    counts,
    isLoading,
    error,
    isFulfilling,
    fetchReminders,
    fulfillReminder,
    setActiveTab,
    setPage,
  } = useClinicRemindersStore()

  const { pick } = useI18n()
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchReminders()
  }, [activeTab, page, fetchReminders])

  const handleFulfill = async (id: number) => {
    try {
      await fulfillReminder(id)
    } catch {
      alert(pick('Failed to mark reminder as done. Please try again.', '標記失敗，請重試'))
    }
  }

  const formatDue = (dueAt: string | null, daysUntilDue: number | null): string => {
    if (!dueAt) return pick('No due date', '無到期日')
    const dateStr = new Date(dueAt).toLocaleDateString()
    if (daysUntilDue === null) return dateStr
    if (daysUntilDue < 0) {
      return `${dateStr} (${pick(`${Math.abs(daysUntilDue)}d overdue`, `逾期 ${Math.abs(daysUntilDue)} 天`)})`
    }
    if (daysUntilDue === 0) return `${dateStr} (${pick('today', '今天')})`
    return `${dateStr} (${pick(`in ${daysUntilDue}d`, `${daysUntilDue} 天後`)})`
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {pick('Health Reminders', '健康提醒')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {pick('Track vaccinations, deworming, and follow-up care for all patients.', '追蹤所有患者的疫苗、驅蟲及後續護理。')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {pick('+ Add Reminder', '+ 新增提醒')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white px-6">
        <div className="flex gap-0">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const count = counts[tab.key as keyof typeof counts] ?? 0
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {pick(tab.labelEn, tab.labelZh)}
                {count > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      tab.key === 'overdue'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            {pick('Loading...', '載入中...')}
          </div>
        ) : reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="text-lg font-medium">{pick('No reminders found', '沒有提醒')}</p>
            <p className="mt-1 text-sm">
              {activeTab === 'overdue'
                ? pick('All caught up!', '全部跟上了！')
                : pick('Nothing to show in this category.', '此分類沒有資料。')}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">{pick('Patient', '患者')}</th>
                    <th className="px-4 py-3">{pick('Owner', '主人')}</th>
                    <th className="px-4 py-3">{pick('Reminder', '提醒')}</th>
                    <th className="px-4 py-3">{pick('Category', '類別')}</th>
                    <th className="px-4 py-3">{pick('Importance', '重要性')}</th>
                    <th className="px-4 py-3">{pick('Due Date', '到期日')}</th>
                    {activeTab !== 'fulfilled' && (
                      <th className="px-4 py-3 text-right">{pick('Action', '操作')}</th>
                    )}
                    {activeTab === 'fulfilled' && (
                      <th className="px-4 py-3">{pick('Fulfilled At', '完成時間')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reminders.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/merchant/clinic/patients/${r.patientId}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {r.patientName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.ownerName}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 capitalize">
                          {r.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            IMPORTANCE_COLOR[r.importance] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.importance}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span
                          className={
                            r.daysUntilDue !== null && r.daysUntilDue < 0
                              ? 'font-medium text-rose-600'
                              : ''
                          }
                        >
                          {formatDue(r.dueAt, r.daysUntilDue)}
                        </span>
                      </td>
                      {activeTab !== 'fulfilled' ? (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={isFulfilling}
                            onClick={() => handleFulfill(r.id)}
                            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {pick('Mark Done', '標記完成')}
                          </button>
                        </td>
                      ) : (
                        <td className="px-4 py-3 text-slate-500">
                          {r.lastFulfilledAt
                            ? new Date(r.lastFulfilledAt).toLocaleDateString()
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  {pick(`${total} reminders total`, `共 ${total} 條提醒`)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
                  >
                    {pick('Prev', '上一頁')}
                  </button>
                  <span className="px-2 py-1.5 text-xs">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={!hasMore}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
                  >
                    {pick('Next', '下一頁')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateReminderModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            fetchReminders()
          }}
        />
      )}
    </div>
  )
}
