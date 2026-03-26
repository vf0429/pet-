'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useClinicAppointmentsStore } from '@/store/clinic'
import { AppointmentStatus, VisitType, UpdateAppointmentStatusParams } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

const STATUS_TABS: { label: string; value: string }[] = [
  { label: '全部', value: '' },
  { label: '待确认', value: 'pending' },
  { label: '已确认', value: 'confirmed' },
  { label: '已签到', value: 'checked_in' },
  { label: '就诊中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
]

const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  vaccine: '疫苗接种',
  checkup: '常规检查',
  surgery: '手术',
  emergency: '急诊',
  dental: '牙科',
  followup: '复诊',
}

function formatDateTime(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface CancelModalProps {
  appointmentId: number
  onConfirm: (reason: string) => void
  onClose: () => void
  isLoading: boolean
}

function CancelModal({ appointmentId, onConfirm, onClose, isLoading }: CancelModalProps) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">取消预约 #{appointmentId}</h3>
        <p className="mt-1 text-sm text-slate-500">请填写取消原因</p>
        <textarea
          className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          rows={3}
          placeholder="例：顾客主动取消"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            返回
          </button>
          <button
            type="button"
            disabled={!reason.trim() || isLoading}
            onClick={() => onConfirm(reason)}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isLoading ? '处理中...' : '确认取消'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClinicAppointmentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    appointments,
    total,
    page,
    filters,
    view,
    matrixData,
    isLoading,
    error,
    isUpdatingStatus,
    statusUpdateError,
    fetchAppointments,
    updateStatus,
    setView,
    setFilters,
    setPage,
  } = useClinicAppointmentsStore()

  const [cancelTarget, setCancelTarget] = useState<number | null>(null)
  const [dateInput, setDateInput] = useState(filters.date)

  useEffect(() => {
    const statusFromUrl = searchParams.get('status') as AppointmentStatus | null
    if (statusFromUrl && statusFromUrl !== filters.status) {
      setFilters({ status: statusFromUrl })
    }
    fetchAppointments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = useCallback((status: string) => {
    setFilters({ status })
    fetchAppointments({ status: status as AppointmentStatus | undefined })
  }, [setFilters, fetchAppointments])

  const handleDateChange = useCallback((date: string) => {
    setDateInput(date)
    setFilters({ date })
    fetchAppointments({ date })
  }, [setFilters, fetchAppointments])

  const handleViewChange = useCallback((newView: 'list' | 'matrix') => {
    setView(newView)
    fetchAppointments({ view: newView })
  }, [setView, fetchAppointments])

  const handleStatusAction = useCallback(async (
    id: number,
    targetStatus: AppointmentStatus,
    cancelReason?: string
  ) => {
    const params: UpdateAppointmentStatusParams = { targetStatus, cancelReason }
    try {
      const result = await updateStatus(id, params)
      if (targetStatus === 'in_progress' && result.visitId) {
        router.push(`/merchant/clinic/visits/${result.visitId}`)
      }
    } catch {
      // error shown via statusUpdateError
    }
  }, [updateStatus, router])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">预约管理</h1>
          <p className="mt-1 text-sm text-slate-500">管理所有诊所预约，切换列表或排班矩阵视图</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View Toggle */}
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleViewChange('list')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            列表视图
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('matrix')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              view === 'matrix' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            排班矩阵
          </button>
        </div>

        {/* Date Picker */}
        <input
          type="date"
          value={dateInput}
          onChange={(e) => handleDateChange(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {/* Status Tabs (list view only) */}
      {view === 'list' && (
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                filters.status === tab.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {(error || statusUpdateError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{error || statusUpdateError}</p>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm text-slate-500">共 {total} 条预约</p>
          </div>

          {isLoading ? (
            <div className="p-5">
              <div className="animate-pulse space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-4 w-16 rounded bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 rounded bg-slate-200" />
                      <div className="h-3 w-20 rounded bg-slate-200" />
                    </div>
                    <div className="h-6 w-16 rounded-full bg-slate-200" />
                    <div className="h-8 w-20 rounded-lg bg-slate-200" />
                  </div>
                ))}
              </div>
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-slate-500">暂无预约数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-500">时间</th>
                    <th className="px-5 py-3 font-medium text-slate-500">宠物名</th>
                    <th className="px-5 py-3 font-medium text-slate-500">主人</th>
                    <th className="px-5 py-3 font-medium text-slate-500">就诊类型</th>
                    <th className="px-5 py-3 font-medium text-slate-500">分配医生</th>
                    <th className="px-5 py-3 font-medium text-slate-500">状态</th>
                    <th className="px-5 py-3 font-medium text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-900 whitespace-nowrap">
                        {formatDateTime(appt.scheduledAt)}
                      </td>
                      <td className="px-5 py-4 text-slate-900 font-medium">{appt.petName}</td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>{appt.petOwnerName}</div>
                        <div className="text-xs text-slate-400">{appt.petOwnerPhone}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {VISIT_TYPE_LABELS[appt.visitType] ?? appt.visitType}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{appt.doctorName}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={appt.status} size="sm" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {appt.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdatingStatus}
                                onClick={() => handleStatusAction(appt.id, 'confirmed')}
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                              >
                                确认预约
                              </button>
                              <button
                                type="button"
                                disabled={isUpdatingStatus}
                                onClick={() => setCancelTarget(appt.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                拒绝
                              </button>
                            </>
                          )}
                          {appt.status === 'confirmed' && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdatingStatus}
                                onClick={() => handleStatusAction(appt.id, 'checked_in')}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                签到
                              </button>
                              <button
                                type="button"
                                disabled={isUpdatingStatus}
                                onClick={() => setCancelTarget(appt.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                取消
                              </button>
                            </>
                          )}
                          {appt.status === 'checked_in' && (
                            <button
                              type="button"
                              disabled={isUpdatingStatus}
                              onClick={() => handleStatusAction(appt.id, 'in_progress')}
                              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                            >
                              开始就诊
                            </button>
                          )}
                          {appt.status === 'in_progress' && (
                            <span className="text-xs text-slate-400">就诊中</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
              <p className="text-sm text-slate-500">第 {page} 页，共 {Math.ceil(total / 20)} 页</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => { setPage(page - 1); fetchAppointments({ page: page - 1 }) }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={page * 20 >= total}
                  onClick={() => { setPage(page + 1); fetchAppointments({ page: page + 1 }) }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Matrix View */}
      {view === 'matrix' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse">
                <div className="h-6 w-48 mx-auto rounded bg-slate-200" />
                <div className="mt-4 h-64 rounded bg-slate-100" />
              </div>
            </div>
          ) : !matrixData ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">暂无排班数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 min-w-[120px]">
                      医生
                    </th>
                    {matrixData.timeSlots.map((slot) => (
                      <th key={slot} className="px-3 py-3 text-center font-medium text-slate-500 min-w-[90px]">
                        {slot}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrixData.doctors.map((doctor) => (
                    <tr key={doctor.doctorId} className="hover:bg-slate-50">
                      <td className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-900">
                        {doctor.doctorName}
                      </td>
                      {matrixData.timeSlots.map((timeSlot) => {
                        const slot = doctor.slots.find((s) => s.time === timeSlot)
                        if (!slot || slot.status === 'available') {
                          return (
                            <td key={timeSlot} className="px-2 py-2 text-center">
                              <div className="mx-auto h-14 w-full max-w-[80px] rounded-lg border border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center justify-center">
                                <span className="text-xs text-slate-300">空</span>
                              </div>
                            </td>
                          )
                        }
                        const isInProgress = slot.status === 'in_progress'
                        return (
                          <td key={timeSlot} className="px-2 py-2 text-center">
                            <div
                              className={`mx-auto h-14 w-full max-w-[80px] rounded-lg p-1.5 cursor-pointer ${
                                isInProgress
                                  ? 'bg-cyan-600 text-white'
                                  : 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                              }`}
                            >
                              <p className="text-xs font-medium truncate">{slot.petName}</p>
                              <p className={`text-[10px] truncate ${isInProgress ? 'text-cyan-100' : 'text-cyan-500'}`}>
                                {slot.visitType ? VISIT_TYPE_LABELS[slot.visitType] : ''}
                              </p>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelTarget !== null && (
        <CancelModal
          appointmentId={cancelTarget}
          onConfirm={(reason) => {
            handleStatusAction(cancelTarget, 'cancelled', reason)
            setCancelTarget(null)
          }}
          onClose={() => setCancelTarget(null)}
          isLoading={isUpdatingStatus}
        />
      )}
    </div>
  )
}
