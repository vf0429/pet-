'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import StatusBadge from '@/components/StatusBadge'
import CreateAppointmentModal from '@/components/clinic/CreateAppointmentModal'
import { AppointmentStatus, UpdateAppointmentStatusParams } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { getAppointmentStatusLabel, getVisitTypeLabel } from '@/lib/i18n-labels'
import { useClinicAppointmentsStore } from '@/store/clinic'

const STATUS_TABS = ['', 'pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled'] as const

interface CancelModalProps {
  appointmentId: number
  onConfirm: (reason: string) => void
  onClose: () => void
  isLoading: boolean
}

function CancelModal({ appointmentId, onConfirm, onClose, isLoading }: CancelModalProps) {
  const [reason, setReason] = useState('')
  const { pick } = useI18n()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">
          {pick('Cancel appointment #{id}', '取消預約 #{id}', { id: appointmentId })}
        </h3>
        <p className="mt-1 text-sm text-slate-500">{pick('Please provide a reason', '請填寫取消原因')}</p>
        <textarea
          className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          rows={3}
          placeholder={pick('Example: Customer requested cancellation', '例如：顧客主動取消')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {pick('Back', '返回')}
          </button>
          <button
            type="button"
            disabled={!reason.trim() || isLoading}
            onClick={() => onConfirm(reason)}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isLoading ? pick('Processing...', '處理中...') : pick('Confirm cancellation', '確認取消')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClinicAppointmentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pick, locale, formatDateTime } = useI18n()

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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [dateInput, setDateInput] = useState(filters.date)
  const [searchInput, setSearchInput] = useState(filters.q)

  useEffect(() => {
    const statusFromUrl = searchParams.get('status') as AppointmentStatus | null
    if (statusFromUrl && statusFromUrl !== filters.status) {
      setFilters({ status: statusFromUrl })
    }
    fetchAppointments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = useCallback(() => {
    setFilters({ q: searchInput })
    fetchAppointments({ q: searchInput || undefined })
  }, [searchInput, setFilters, fetchAppointments])

  const handleTabChange = useCallback(
    (status: string) => {
      setFilters({ status })
      fetchAppointments({ status: status as AppointmentStatus | undefined })
    },
    [setFilters, fetchAppointments]
  )

  const handleDateChange = useCallback(
    (date: string) => {
      setDateInput(date)
      setFilters({ date })
      fetchAppointments({ date })
    },
    [setFilters, fetchAppointments]
  )

  const handleViewChange = useCallback(
    (nextView: 'list' | 'matrix') => {
      setView(nextView)
      fetchAppointments({ view: nextView })
    },
    [setView, fetchAppointments]
  )

  const handleStatusAction = useCallback(
    async (id: number, targetStatus: AppointmentStatus, cancelReason?: string) => {
      const params: UpdateAppointmentStatusParams = { targetStatus, cancelReason }
      try {
        const result = await updateStatus(id, params)
        if (targetStatus === 'in_progress' && result.visitId) {
          router.push(`/merchant/clinic/visits/${result.visitId}`)
        }
      } catch {
        // handled in store
      }
    },
    [router, updateStatus]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pick('Appointments', '預約管理')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {pick(
              'Manage all clinic appointments and switch between list and schedule matrix views.',
              '管理所有診所預約，並切換清單或排班矩陣視圖。'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          {pick('+ New Appointment', '+ 新增預約')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleViewChange('list')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {pick('List view', '清單檢視')}
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('matrix')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              view === 'matrix' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {pick('Schedule matrix', '排班矩陣')}
          </button>
        </div>

        <input
          type="date"
          value={dateInput}
          onChange={(e) => handleDateChange(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={pick('Search patient or owner…', '搜尋患者或主人…')}
            className="w-52 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {pick('Search', '搜尋')}
          </button>
        </div>
      </div>

      {view === 'list' && (
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => handleTabChange(status)}
              className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                filters.status === status
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {status === '' ? pick('All', '全部') : getAppointmentStatusLabel(locale, status)}
            </button>
          ))}
        </div>
      )}

      {(error || statusUpdateError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{error || statusUpdateError}</p>
        </div>
      )}

      {view === 'list' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm text-slate-500">{pick('{total} appointments', '共 {total} 筆預約', { total })}</p>
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
              <p className="text-sm text-slate-500">{pick('No appointments found', '目前沒有預約資料')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Time', '時間')}</th>
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Pet', '寵物名')}</th>
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Owner', '主人')}</th>
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Visit type', '就診類型')}</th>
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Assigned doctor', '分配醫生')}</th>
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Status', '狀態')}</th>
                    <th className="px-5 py-3 font-medium text-slate-500">{pick('Actions', '操作')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-900 whitespace-nowrap">
                        {formatDateTime(appt.scheduledAt, {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {appt.patientId ? (
                          <Link
                            href={`/merchant/clinic/patients/${appt.patientId}`}
                            className="text-sky-700 hover:underline"
                          >
                            {appt.petName}
                          </Link>
                        ) : (
                          appt.petName
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>{appt.petOwnerName}</div>
                        <div className="text-xs text-slate-400">{appt.petOwnerPhone}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{getVisitTypeLabel(locale, appt.visitType)}</td>
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
                                {pick('Confirm', '確認預約')}
                              </button>
                              <button
                                type="button"
                                disabled={isUpdatingStatus}
                                onClick={() => setCancelTarget(appt.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {pick('Decline', '拒絕')}
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
                                {pick('Check in', '報到')}
                              </button>
                              <button
                                type="button"
                                disabled={isUpdatingStatus}
                                onClick={() => setCancelTarget(appt.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {pick('Cancel', '取消')}
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
                              {pick('Start visit', '開始就診')}
                            </button>
                          )}
                          {appt.status === 'in_progress' && (
                            <span className="text-xs text-slate-400">{pick('In progress', '就診中')}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > 20 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
              <p className="text-sm text-slate-500">
                {pick('Page {page} of {totalPages}', '第 {page} 頁，共 {totalPages} 頁', {
                  page,
                  totalPages: Math.ceil(total / 20),
                })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1)
                    fetchAppointments({ page: page - 1 })
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {pick('Previous', '上一頁')}
                </button>
                <button
                  type="button"
                  disabled={page * 20 >= total}
                  onClick={() => {
                    setPage(page + 1)
                    fetchAppointments({ page: page + 1 })
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {pick('Next', '下一頁')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'matrix' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse">
                <div className="mx-auto h-6 w-48 rounded bg-slate-200" />
                <div className="mt-4 h-64 rounded bg-slate-100" />
              </div>
            </div>
          ) : !matrixData ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">{pick('No schedule data', '目前沒有排班資料')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="sticky left-0 z-10 min-w-[120px] bg-slate-50 px-4 py-3 text-left font-medium text-slate-500">
                      {pick('Doctor', '醫生')}
                    </th>
                    {matrixData.timeSlots.map((slot) => (
                      <th key={slot} className="min-w-[90px] px-3 py-3 text-center font-medium text-slate-500">
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
                        const slot = doctor.slots.find((item) => item.time === timeSlot)
                        if (!slot || slot.status === 'available') {
                          return (
                            <td key={timeSlot} className="px-2 py-2 text-center">
                              <div className="mx-auto flex h-14 w-full max-w-[80px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100">
                                <span className="text-xs text-slate-300">{pick('Empty', '空')}</span>
                              </div>
                            </td>
                          )
                        }
                        const isInProgress = slot.status === 'in_progress'
                        return (
                          <td key={timeSlot} className="px-2 py-2 text-center">
                            <div
                              className={`mx-auto h-14 w-full max-w-[80px] cursor-pointer rounded-lg p-1.5 ${
                                isInProgress
                                  ? 'bg-cyan-600 text-white'
                                  : 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                              }`}
                            >
                              <p className="truncate text-xs font-medium">{slot.petName}</p>
                              <p className={`truncate text-[10px] ${isInProgress ? 'text-cyan-100' : 'text-cyan-500'}`}>
                                {slot.visitType ? getVisitTypeLabel(locale, slot.visitType) : ''}
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

      {showCreateModal && (
        <CreateAppointmentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            fetchAppointments()
          }}
        />
      )}
    </div>
  )
}
