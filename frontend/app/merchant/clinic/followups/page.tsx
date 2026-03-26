'use client'

import { useEffect, useState, useCallback } from 'react'
import { useClinicFollowupsStore } from '@/store/clinic'
import { FollowupStatus } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

const STATUS_TABS: { label: string; value: string }[] = [
  { label: '全部', value: '' },
  { label: '待回访', value: 'pending' },
  { label: '已完成', value: 'done' },
  { label: '已跳过', value: 'skipped' },
]

const FOLLOWUP_STATUS_LABELS: Record<FollowupStatus, string> = {
  pending: '待回访',
  done: '已完成',
  skipped: '已跳过',
}

export default function FollowupsPage() {
  const {
    followups,
    total,
    page,
    perPage,
    activeTab,
    isLoading,
    error,
    fetchFollowups,
    updateStatus,
    isUpdating,
    setActiveTab,
  } = useClinicFollowupsStore()

  const [searchInput, setSearchInput] = useState('')

  // Fetch followups when tab changes
  useEffect(() => {
    fetchFollowups()
  }, [activeTab, page, perPage, fetchFollowups])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as 'all' | FollowupStatus | 'overdue')
  }

  const handleStatusChange = async (
    followupId: number,
    newStatus: 'done' | 'skipped'
  ) => {
    try {
      await updateStatus(followupId, newStatus)
    } catch {
      alert('状态更新失败，请重试')
    }
  }

  const handleSendReminder = (followupId: number) => {
    // Mock implementation
    alert(`已发送回访提醒 #${followupId}`)
  }

  const isOverdue = (dueAt: string) => new Date(dueAt) < new Date()

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleDateString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">回访管理</h1>
        <p className="mt-1 text-sm text-slate-500">追踪和管理所有患宠回访计划</p>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 border-b border-slate-200 bg-white px-6 py-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              handleTabChange(tab.value)
            }}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.value
                ? 'border-b-2 border-sky-500 text-sky-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                回访日期
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                宠物名
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                主人
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                上次就诊
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                回访原因
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                负责医生
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                状态
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                  加载中...
                </td>
              </tr>
            ) : followups.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                  没有回访记录
                </td>
              </tr>
            ) : (
              followups.map((followup) => {
                const overdue =
                  followup.status === 'pending' && isOverdue(followup.dueAt)
                return (
                  <tr key={followup.id} className="hover:bg-slate-50">
                    <td
                      className={`px-6 py-4 text-sm font-medium ${
                        overdue ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {formatDate(followup.dueAt)}
                      {overdue && (
                        <span className="ml-2 inline text-xs text-red-600">
                          (已超期)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {followup.petName}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {followup.petOwnerName}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDateTime(followup.lastVisitDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {followup.reason}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {followup.doctorName}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge
                        status={followup.status}
                        size="sm"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {followup.status === 'pending' && (
                          <>
                            <button
                              onClick={() =>
                                handleStatusChange(
                                  followup.id,
                                  'done'
                                )
                              }
                              disabled={isUpdating}
                              className="rounded px-2 py-1 text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                            >
                              标记已回访
                            </button>
                            <button
                              onClick={() =>
                                handleSendReminder(followup.id)
                              }
                              className="rounded px-2 py-1 text-xs bg-sky-100 text-sky-700 hover:bg-sky-200"
                            >
                              发送提醒
                            </button>
                            <button
                              onClick={() =>
                                handleStatusChange(
                                  followup.id,
                                  'skipped'
                                )
                              }
                              disabled={isUpdating}
                              className="rounded px-2 py-1 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                            >
                              跳过
                            </button>
                          </>
                        )}
                        {followup.status === 'done' && (
                          <span className="text-xs text-slate-500">
                            已于 {formatDateTime(followup.resultNote || '')}
                            完成
                          </span>
                        )}
                        {followup.status === 'skipped' && (
                          <span className="text-xs text-slate-500">
                            已跳过
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > perPage && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <span className="text-sm text-slate-600">
            共 {total} 条 | 第 {page} 页
          </span>
        </div>
      )}
    </div>
  )
}
