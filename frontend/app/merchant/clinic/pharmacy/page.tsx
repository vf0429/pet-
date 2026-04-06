'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '@/lib/i18n'
import { getStorageConditionLabel } from '@/lib/i18n-labels'
import { useClinicPharmacyStore } from '@/store/clinic'

const EXPIRY_FILTER_OPTIONS = ['', 'expiring_soon', 'expired'] as const

function getExpiryColor(daysUntilExpiry: number): { bg: string; text: string } {
  if (daysUntilExpiry < 0) return { bg: 'bg-rose-100', text: 'text-rose-700' }
  if (daysUntilExpiry <= 30) return { bg: 'bg-amber-100', text: 'text-amber-700' }
  return { bg: 'bg-emerald-100', text: 'text-emerald-700' }
}

export default function ClinicPharmacyPage() {
  const {
    items,
    total,
    page,
    perPage,
    filters,
    isLoading,
    error,
    isDispensing,
    dispenseError,
    fetchPharmacy,
    dispense,
    setFilters,
    setPage,
    clearDispenseError,
  } = useClinicPharmacyStore()

  const { pick, locale, formatDate } = useI18n()
  const [searchInput, setSearchInput] = useState(filters.search)
  const [dispenseTarget, setDispenseTarget] = useState<number | null>(null)
  const [dispenseQuantity, setDispenseQuantity] = useState('1')
  const [prescriptionId, setPrescriptionId] = useState('')
  const [dispenseNote, setDispenseNote] = useState('')
  const searchTimeoutRef = useRef<NodeJS.Timeout>(undefined)

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => setFilters({ search: value }), 300)
  }, [setFilters])

  useEffect(() => {
    fetchPharmacy()
  }, [fetchPharmacy, filters, page, perPage])

  const handleDispense = async () => {
    if (!dispenseTarget) return
    const targetItem = items.find((i) => i.id === dispenseTarget)
    const resolvedPrescriptionId = targetItem?.isPrescriptionOnly && prescriptionId.trim() ? parseInt(prescriptionId, 10) : undefined
    try {
      await dispense(dispenseTarget, parseInt(dispenseQuantity, 10), resolvedPrescriptionId, dispenseNote || undefined)
      setDispenseTarget(null)
      setDispenseQuantity('1')
      setPrescriptionId('')
      setDispenseNote('')
    } catch {}
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{pick('Pharmacy inventory', '藥房庫存')}</h1>
        <p className="mt-1 text-sm text-slate-500">{pick('Manage medication stock and dispensing for the clinic', '管理診所藥品庫存與分發')}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[200px] flex-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} placeholder={pick('Search medicine name...', '搜尋藥品名稱...')} className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{pick('Type:', '類型：')}</span>
            <select value={filters.isPrescriptionOnly === null ? '' : filters.isPrescriptionOnly ? 'true' : 'false'} onChange={(e) => setFilters({ isPrescriptionOnly: e.target.value === '' ? null : e.target.value === 'true' })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
              <option value="">{pick('All', '全部')}</option>
              <option value="false">{pick('OTC', '非處方藥')}</option>
              <option value="true">{pick('Prescription', '處方藥')}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{pick('Expiry:', '有效期：')}</span>
            <select value={filters.expiryFilter} onChange={(e) => setFilters({ expiryFilter: e.target.value as '' | 'expiring_soon' | 'expired' })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
              {EXPIRY_FILTER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt === '' ? pick('All', '全部') : opt === 'expiring_soon' ? pick('Expiring soon (within 30 days)', '即將過期（30 天內）') : pick('Expired', '已過期')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {(error || dispenseError) && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm text-rose-600">{error || dispenseError}</p><button type="button" onClick={() => fetchPharmacy()} className="mt-2 text-sm font-medium text-rose-700 underline">{pick('Retry', '重試')}</button></div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-sm text-slate-500">{pick('{count} medicines', '共 {count} 種藥品', { count: total })}</p></div>

        {isLoading ? (
          <div className="p-8"><div className="animate-pulse space-y-4">{[1,2,3,4,5].map((i)=><div key={i} className="flex items-center gap-4"><div className="h-12 w-12 rounded-lg bg-slate-200" /><div className="flex-1"><div className="mb-2 h-4 w-48 rounded bg-slate-200" /><div className="h-3 w-32 rounded bg-slate-200" /></div><div className="h-6 w-20 rounded bg-slate-200" /></div>)}</div></div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center"><svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg><p className="mt-4 text-sm text-slate-500">{pick('No medicines found', '目前沒有藥品資料')}</p></div>
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50 text-left"><th className="px-5 py-3 font-medium text-slate-500">{pick('Medicine', '藥品名稱')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Specification', '規格')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Batch no.', '批次號')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Stock', '庫存')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Expiry', '有效期')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Storage', '儲存條件')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Type', '類型')}</th><th className="px-5 py-3 font-medium text-slate-500">{pick('Actions', '操作')}</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => { const expiryColor = getExpiryColor(item.daysUntilExpiry); return <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-medium text-slate-900">{item.name}</p></td><td className="px-5 py-4 text-slate-600">{item.specification}</td><td className="px-5 py-4 text-slate-600">{item.batchNo}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><span className={`font-medium ${item.isLowStock ? 'text-rose-600' : 'text-slate-900'}`}>{item.stockLevel}</span>{item.isLowStock && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">{pick('Low stock', '低庫存')}</span>}</div><p className="text-xs text-slate-400">{pick('Threshold: {count}', '門檻：{count}', { count: item.lowStockThreshold })}</p></td><td className="px-5 py-4"><div className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${expiryColor.bg} ${expiryColor.text}`}>{item.isExpired ? pick('Expired', '已過期') : item.isExpiringSoon ? pick('Expiring soon', '即將過期') : formatDate(item.expiresAt)}</div>{item.daysUntilExpiry > 0 && <p className="mt-0.5 text-xs text-slate-400">{pick('{days} days left', '剩餘 {days} 天', { days: item.daysUntilExpiry })}</p>}</td><td className="px-5 py-4 text-slate-600">{getStorageConditionLabel(locale, item.storageCondition)}</td><td className="px-5 py-4">{item.isPrescriptionOnly ? <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">{pick('Prescription', '處方藥')}</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">OTC</span>}</td><td className="px-5 py-4"><button type="button" onClick={() => setDispenseTarget(item.id)} onClickCapture={() => clearDispenseError()} disabled={item.stockLevel === 0 || item.isExpired} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{pick('Dispense', '分發')}</button></td></tr>})}</tbody></table></div>
            {totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><div className="flex items-center gap-2 text-sm text-slate-500"><span>{pick('Show', '顯示')}</span><select value={perPage} onChange={(e) => { setPage(1); fetchPharmacy({ perPage: Number(e.target.value) }) }} className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select><span>{pick('{count} per page, {total} total', '每頁 {count} 筆，共 {total} 筆', { count: perPage, total })}</span></div><div className="flex items-center gap-1"><button type="button" onClick={() => { setPage(page - 1); fetchPharmacy({ page: page - 1 }) }} disabled={page === 1} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{pick('Previous', '上一頁')}</button><div className="mx-2 flex items-center gap-1">{Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pageNum; if (totalPages <= 5) pageNum = i + 1; else if (page <= 3) pageNum = i + 1; else if (page >= totalPages - 2) pageNum = totalPages - 4 + i; else pageNum = page - 2 + i; return <button key={pageNum} type="button" onClick={() => { setPage(pageNum); fetchPharmacy({ page: pageNum }) }} className={`h-8 w-8 rounded-lg text-sm font-medium ${page === pageNum ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{pageNum}</button>})}</div><button type="button" onClick={() => { setPage(page + 1); fetchPharmacy({ page: page + 1 }) }} disabled={page >= totalPages} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{pick('Next', '下一頁')}</button></div></div>}
          </>
        )}
      </div>

      {dispenseTarget !== null && <DispenseModal itemName={items.find((i) => i.id === dispenseTarget)?.name ?? ''} maxQuantity={items.find((i) => i.id === dispenseTarget)?.stockLevel ?? 0} isPrescriptionOnly={items.find((i) => i.id === dispenseTarget)?.isPrescriptionOnly ?? false} quantity={dispenseQuantity} setQuantity={setDispenseQuantity} prescriptionId={prescriptionId} setPrescriptionId={setPrescriptionId} note={dispenseNote} setNote={setDispenseNote} isDispensing={isDispensing} error={dispenseError} onConfirm={handleDispense} onClose={() => { setDispenseTarget(null); setDispenseQuantity('1'); setPrescriptionId(''); setDispenseNote(''); clearDispenseError() }} />}
    </div>
  )
}

interface DispenseModalProps {
  itemName: string
  maxQuantity: number
  isPrescriptionOnly: boolean
  quantity: string
  setQuantity: (v: string) => void
  prescriptionId: string
  setPrescriptionId: (v: string) => void
  note: string
  setNote: (v: string) => void
  isDispensing: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

function DispenseModal({ itemName, maxQuantity, isPrescriptionOnly, quantity, setQuantity, prescriptionId, setPrescriptionId, note, setNote, isDispensing, error, onConfirm, onClose }: DispenseModalProps) {
  const { pick } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><h2 className="text-lg font-semibold text-slate-900">{pick('Dispense medicine', '藥品分發')}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        <div className="p-6"><div className="mb-4 rounded-lg bg-slate-50 p-3"><p className="font-medium text-slate-900">{itemName}</p><p className="mt-1 text-sm text-slate-500">{pick('Current stock: {count}', '目前庫存：{count}', { count: maxQuantity })}</p>{isPrescriptionOnly && <p className="mt-1 text-sm text-violet-600">{pick('Prescription medicine - prescription number required', '處方藥 - 需要提供處方編號')}</p>}</div><div className="space-y-4"><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Dispense quantity', '分發數量')}</label><input type="number" min="1" max={maxQuantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>{isPrescriptionOnly && <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Prescription number', '處方編號')}</label><input type="number" min="1" value={prescriptionId} onChange={(e) => setPrescriptionId(e.target.value)} placeholder={pick('Enter prescription number', '請輸入處方編號')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>}<div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Notes (optional)', '備註（可選）')}</label><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. dispensed by Dr. Li" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>{error && <p className="text-sm text-rose-600">{error}</p>}</div></div><div className="flex gap-3 border-t border-slate-200 px-6 py-4"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{pick('Cancel', '取消')}</button><button type="button" onClick={onConfirm} disabled={isDispensing || parseInt(quantity, 10) < 1 || parseInt(quantity, 10) > maxQuantity || (isPrescriptionOnly && (!prescriptionId.trim() || parseInt(prescriptionId, 10) < 1))} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">{isDispensing ? pick('Processing...', '處理中...') : pick('Confirm dispense', '確認分發')}</button></div>
      </div>
    </div>
  )
}
