'use client'

import { useEffect, useState } from 'react'

import { useI18n } from '@/lib/i18n'
import { useClinicFollowupsStore } from '@/store/clinic'
import { FollowupStatus } from '@/lib/api'

const STATUS_TABS = ['', 'pending', 'done', 'skipped'] as const

export default function FollowupsPage() {
  const {
    followups,
    total,
    page,
    perPage,
    activeTab,
    isLoading,
    fetchFollowups,
    updateStatus,
    isUpdating,
    setActiveTab,
  } = useClinicFollowupsStore()

  const { pick, formatDate, formatDateTime } = useI18n()
  const [searchInput] = useState('')

  useEffect(() => {
    fetchFollowups()
  }, [activeTab, page, perPage, fetchFollowups])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as 'all' | FollowupStatus | 'overdue')
  }

  const handleStatusChange = async (followupId: number, newStatus: 'done' | 'skipped') => {
    try {
      await updateStatus(followupId, newStatus)
    } catch {
      alert(pick('Unable to update status. Please try again.', '狀態更新失敗，請重試'))
    }
  }

  const handleSendReminder = (followupId: number) => {
    alert(pick(`Follow-up reminder sent #${followupId}`, `已發送回訪提醒 #${followupId}`))
  }

  const isOverdue = (dueAt: string) => new Date(dueAt) < new Date()

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{pick('Follow-up management', '回訪管理')}</h1>
        <p className="mt-1 text-sm text-slate-500">{pick('Track and manage all pet follow-up plans', '追蹤和管理所有患寵回訪計劃')}</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 bg-white px-6 py-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab === ''
              ? pick('All', '全部')
              : tab === 'pending'
                ? pick('Pending follow-up', '待回訪')
                : tab === 'done'
                  ? pick('Completed', '已完成')
                  : pick('Skipped', '已跳過')}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Follow-up date', '回訪日期')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Pet', '寵物名')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Owner', '主人')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Last visit', '上次就診')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Reason', '回訪原因')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Doctor', '負責醫生')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Status', '狀態')}</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">{pick('Actions', '操作')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-500">{pick('Loading...', '載入中...')}</td>
              </tr>
            ) : followups.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-500">{pick('No follow-up records', '沒有回訪紀錄')}</td>
              </tr>
            ) : (
              followups.map((followup) => {
                const overdue = followup.status === 'pending' && isOverdue(followup.dueAt)
                return (
                  <tr key={followup.id} className="hover:bg-slate-50">
                    <td className={`px-6 py-4 text-sm font-medium ${overdue ? 'text-red-600' : 'text-slate-900'}`}>
                      {formatDate(followup.dueAt)}
                      {overdue && <span className="ml-2 inline text-xs text-red-600">({pick('Overdue', '已逾期')})</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">{followup.petName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{followup.petOwnerName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{formatDateTime(followup.lastVisitDate)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{followup.reason}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{followup.doctorName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {followup.status === 'pending'
                        ? pick('Pending follow-up', '待回訪')
                        : followup.status === 'done'
                          ? pick('Completed', '已完成')
                          : pick('Skipped', '已跳過')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {followup.status === 'pending' && (
                          <>
                            <button onClick={() => handleStatusChange(followup.id, 'done')} disabled={isUpdating} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200 disabled:opacity-50">
                              {pick('Mark completed', '標記已回訪')}
                            </button>
                            <button onClick={() => handleSendReminder(followup.id)} className="rounded bg-sky-100 px-2 py-1 text-xs text-sky-700 hover:bg-sky-200">
                              {pick('Send reminder', '發送提醒')}
                            </button>
                            <button onClick={() => handleStatusChange(followup.id, 'skipped')} disabled={isUpdating} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                              {pick('Skip', '跳過')}
                            </button>
                          </>
                        )}
                        {followup.status === 'done' && <span className="text-xs text-slate-500">{pick('Completed', '已完成')}</span>}
                        {followup.status === 'skipped' && <span className="text-xs text-slate-500">{pick('Skipped', '已跳過')}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {total > perPage && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <span className="text-sm text-slate-600">{pick('{total} total | Page {page}', '共 {total} 筆｜第 {page} 頁', { total, page })}</span>
        </div>
      )}
    </div>
  )
}
