'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import CreatePatientModal from '@/components/clinic/CreatePatientModal'
import { useI18n } from '@/lib/i18n'
import { useClinicPatientsStore } from '@/store/clinic'

export default function PatientsPage() {
  const router = useRouter()
  const {
    patients,
    total,
    page,
    perPage,
    hasMore,
    search,
    isLoading,
    error,
    fetchPatients,
    setSearch,
    setPage,
  } = useClinicPatientsStore()

  const { pick } = useI18n()
  const [searchInput, setSearchInput] = useState(search)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchPatients()
  }, [page, fetchPatients])

  const handleSearch = useCallback(() => {
    setSearch(searchInput)
    fetchPatients({ q: searchInput || undefined, page: 1 })
  }, [searchInput, setSearch, fetchPatients])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {pick('Patients', '患者管理')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {pick('View and manage all clinic patients.', '查看和管理所有診所患者。')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {pick('+ Add Patient', '+ 新增患者')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pick('Search by pet name, owner name or phone…', '按寵物名稱、主人姓名或電話搜尋…')}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {pick('Search', '搜尋')}
          </button>
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
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="text-lg font-medium">{pick('No patients found', '沒有找到患者')}</p>
            <p className="mt-1 text-sm">
              {pick('Try adjusting your search.', '請嘗試調整搜尋條件。')}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">{pick('Patient', '患者')}</th>
                    <th className="px-4 py-3">{pick('Species / Breed', '物種/品種')}</th>
                    <th className="px-4 py-3">{pick('Owner', '主人')}</th>
                    <th className="px-4 py-3">{pick('Last Visit', '上次就診')}</th>
                    <th className="px-4 py-3">{pick('Reminders', '提醒')}</th>
                    <th className="px-4 py-3">{pick('Status', '狀態')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/merchant/clinic/patients/${p.id}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="text-xs text-slate-400">{p.gender}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span>{p.species}</span>
                        {p.breed && <span className="text-slate-400"> · {p.breed}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{p.ownerName}</p>
                        <p className="text-xs text-slate-400">{p.ownerPhone}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {p.lastVisitAt
                          ? new Date(p.lastVisitAt).toLocaleDateString()
                          : pick('No visits', '無就診記錄')}
                      </td>
                      <td className="px-4 py-3">
                        {p.pendingRemindersCount > 0 ? (
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                            {p.pendingRemindersCount}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.isDeceased ? (
                          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-500">
                            {pick('Deceased', '已離世')}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700">
                            {pick('Active', '活躍')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>{pick(`${total} patients total`, `共 ${total} 位患者`)}</span>
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
        <CreatePatientModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newId) => {
            router.push(`/merchant/clinic/patients/${newId}`)
          }}
        />
      )}
    </div>
  )
}
