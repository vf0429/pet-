'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { InsuranceClaimStatus } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { getInsuranceStatusLabel } from '@/lib/i18n-labels'
import { useClinicInsuranceStore } from '@/store/clinic'

const STATUS_TABS = ['', 'draft', 'submitted', 'processing', 'approved', 'rejected'] as const

export default function ClinicInsurancePage() {
  const searchParams = useSearchParams()
  const visitIdFromUrl = searchParams.get('visit_id')
  const { pick, locale, formatDateTime, formatCurrency } = useI18n()

  const {
    claims,
    claimsTotal,
    claimsPage,
    claimsPerPage,
    claimsHasMore,
    claimsFilters,
    isLoadingClaims,
    claimsError,
    error,
    fetchClaims,
    setClaimsFilters,
    setClaimsPage,
  } = useClinicInsuranceStore()

  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims, claimsFilters])

  const handleTabChange = useCallback((status: InsuranceClaimStatus | '') => {
    setClaimsFilters({ status })
  }, [setClaimsFilters])

  const totalPages = Math.ceil(claimsTotal / claimsPerPage)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pick('Insurance claims', '保險理賠')}</h1>
          <p className="mt-1 text-sm text-slate-500">{pick('Manage insurance claims and supporting materials for the clinic', '管理診所保險理賠申請與資料')}</p>
        </div>
        {visitIdFromUrl && (
          <button type="button" onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {pick('Create claim', '新建理賠申請')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-sm text-amber-800">{pick('Phase 2 - Insurance claims are enabled and sourced from actual visit records.', 'Phase 2 - 保險理賠功能已啟用，資料來源為實際就診紀錄。')}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => handleTabChange(tab)} className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition ${claimsFilters.status === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab === '' ? pick('All', '全部') : getInsuranceStatusLabel(locale, tab)}
          </button>
        ))}
      </div>

      {(claimsError || error) && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm text-rose-600">{claimsError || error}</p><button type="button" onClick={() => fetchClaims()} className="mt-2 text-sm font-medium text-rose-700 underline">{pick('Retry', '重試')}</button></div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-sm text-slate-500">{pick('{count} claims', '共 {count} 筆理賠紀錄', { count: claimsTotal })}</p></div>

        {isLoadingClaims ? (
          <div className="p-8"><div className="animate-pulse space-y-4">{[1,2,3,4,5].map((i)=><div key={i} className="flex items-center gap-4"><div className="h-12 w-12 rounded-lg bg-slate-200" /><div className="flex-1"><div className="mb-2 h-4 w-32 rounded bg-slate-200" /><div className="h-3 w-48 rounded bg-slate-200" /></div><div className="h-6 w-20 rounded-full bg-slate-200" /></div>)}</div></div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center"><svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg><p className="mt-4 text-sm text-slate-500">{pick('No claims found', '目前沒有理賠紀錄')}</p>{visitIdFromUrl && <button type="button" onClick={() => setShowCreateModal(true)} className="mt-4 text-sm font-medium text-sky-600">{pick('Create your first claim', '建立第一筆理賠申請')}</button>}</div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {claims.map((claim) => (
                <button key={claim.id} type="button" onClick={() => setSelectedClaimId(claim.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50"><svg className="h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
                  <div className="flex-1"><div className="flex items-center gap-2"><p className="font-semibold text-slate-900">#{claim.id} - {claim.petName}</p><span className="text-sm text-slate-400">·</span><p className="text-sm text-slate-500">{claim.providerName}</p></div><p className="mt-0.5 text-xs text-slate-400">{claim.planName} · {pick('Policy no.: {no}', '保單號：{no}', { no: claim.policyNo })}</p></div>
                  <div className="text-right"><p className="font-semibold text-slate-900">{formatCurrency(claim.claimAmount, claim.currency)}</p><p className="mt-1 text-xs text-slate-400">{formatDateTime(claim.submittedAt)}</p></div>
                  <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{getInsuranceStatusLabel(locale, claim.status)}</div>
                </button>
              ))}
            </div>

            {totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><div className="flex items-center gap-2 text-sm text-slate-500"><span>{pick('Show', '顯示')}</span><select value={claimsPerPage} onChange={(e) => { setClaimsPage(1); fetchClaims({ perPage: Number(e.target.value) }) }} className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"><option value={20}>20</option><option value={50}>50</option></select><span>{pick('{count} per page, {total} total', '每頁 {count} 筆，共 {total} 筆', { count: claimsPerPage, total: claimsTotal })}</span></div><div className="flex items-center gap-1"><button type="button" onClick={() => { setClaimsPage(claimsPage - 1); fetchClaims({ page: claimsPage - 1 }) }} disabled={claimsPage === 1} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{pick('Previous', '上一頁')}</button><div className="mx-2 flex items-center gap-1">{Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pageNum; if (totalPages <= 5) pageNum = i + 1; else if (claimsPage <= 3) pageNum = i + 1; else if (claimsPage >= totalPages - 2) pageNum = totalPages - 4 + i; else pageNum = claimsPage - 2 + i; return <button key={pageNum} type="button" onClick={() => { setClaimsPage(pageNum); fetchClaims({ page: pageNum }) }} className={`h-8 w-8 rounded-lg text-sm font-medium ${claimsPage === pageNum ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{pageNum}</button>})}</div><button type="button" onClick={() => { setClaimsPage(claimsPage + 1); fetchClaims({ page: claimsPage + 1 }) }} disabled={!claimsHasMore} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{pick('Next', '下一頁')}</button></div></div>}
          </>
        )}
      </div>

      {selectedClaimId !== null && <ClaimDetailModal claimId={selectedClaimId} onClose={() => setSelectedClaimId(null)} />}
      {showCreateModal && visitIdFromUrl && <CreateClaimModal visitId={parseInt(visitIdFromUrl, 10)} onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); fetchClaims() }} />}
    </div>
  )
}

function ClaimDetailModal({ claimId, onClose }: { claimId: number; onClose: () => void }) {
  const { claims, isLoadingClaims } = useClinicInsuranceStore()
  const { pick, locale, formatDateTime, formatCurrency } = useI18n()
  const claim = claims.find((c) => c.id === claimId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><h2 className="text-lg font-semibold text-slate-900">{pick('Claim details #{id}', '理賠詳情 #{id}', { id: claimId })}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        <div className="p-6">{isLoadingClaims ? <div className="flex items-center justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" /></div> : claim ? <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><p className="text-sm text-slate-500">{pick('Pet', '寵物名')}</p><p className="font-medium text-slate-900">{claim.petName}</p></div><div><p className="text-sm text-slate-500">{pick('Status', '狀態')}</p><p className="font-medium text-slate-900">{getInsuranceStatusLabel(locale, claim.status)}</p></div><div><p className="text-sm text-slate-500">{pick('Provider', '保險公司')}</p><p className="font-medium text-slate-900">{claim.providerName}</p></div><div><p className="text-sm text-slate-500">{pick('Plan name', '計劃名稱')}</p><p className="font-medium text-slate-900">{claim.planName}</p></div><div><p className="text-sm text-slate-500">{pick('Policy number', '保單號')}</p><p className="font-medium text-slate-900">{claim.policyNo}</p></div><div><p className="text-sm text-slate-500">{pick('Claim amount', '申請金額')}</p><p className="font-medium text-slate-900">{formatCurrency(claim.claimAmount, claim.currency)}</p></div>{claim.approvedAmount > 0 && <div><p className="text-sm text-slate-500">{pick('Approved amount', '批准金額')}</p><p className="font-medium text-emerald-600">{formatCurrency(claim.approvedAmount, claim.currency)}</p></div>}<div><p className="text-sm text-slate-500">{pick('Submitted at', '提交時間')}</p><p className="font-medium text-slate-900">{formatDateTime(claim.submittedAt)}</p></div></div></div> : <p className="text-center text-sm text-slate-500">{pick('Claim not found', '理賠紀錄不存在')}</p>}</div>
        <div className="flex justify-end border-t border-slate-200 px-6 py-4"><button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">{pick('Close', '關閉')}</button></div>
      </div>
    </div>
  )
}

function CreateClaimModal({ visitId, onClose, onSuccess }: { visitId: number; onClose: () => void; onSuccess: () => void }) {
  const { pick } = useI18n()
  const { submitClaim, isSubmittingClaim, submitClaimError, fetchCoveragePreview, coveragePreview, isLoadingCoverage } = useClinicInsuranceStore()
  const [formData, setFormData] = useState({ policyNo: '', providerName: '', planName: '', claimAmount: '', diagnosisSummary: '', notes: '' })

  useEffect(() => { fetchCoveragePreview(visitId) }, [visitId, fetchCoveragePreview])
  useEffect(() => { if (coveragePreview) setFormData((prev) => ({ ...prev, policyNo: coveragePreview.policy.policyNo, providerName: coveragePreview.policy.providerName, planName: coveragePreview.policy.planName })) }, [coveragePreview])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await submitClaim({ visitId, policyNo: formData.policyNo, providerName: formData.providerName, planName: formData.planName, claimAmount: parseFloat(formData.claimAmount), currency: 'HKD', diagnosisSummary: formData.diagnosisSummary, expenseItems: [{ itemName: 'Consultation', amount: parseFloat(formData.claimAmount), isCovered: true }], notes: formData.notes || undefined })
      onSuccess()
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><h2 className="text-lg font-semibold text-slate-900">{pick('Create claim', '新建理賠申請')}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {isLoadingCoverage ? <div className="flex items-center justify-center py-4"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" /></div> : coveragePreview ? <><div className="rounded-lg bg-sky-50 p-3"><p className="text-sm font-medium text-sky-800">{pick('Pet: {name}', '寵物：{name}', { name: coveragePreview.petName })}</p><p className="text-xs text-sky-600">{pick('Owner: {name}', '主人：{name}', { name: coveragePreview.petOwnerName })}</p></div><div className="grid grid-cols-2 gap-4"><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Provider', '保險公司')}</label><input type="text" value={formData.providerName} onChange={(e) => setFormData({ ...formData, providerName: e.target.value })} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Plan name', '計劃名稱')}</label><input type="text" value={formData.planName} onChange={(e) => setFormData({ ...formData, planName: e.target.value })} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Policy number', '保單號')}</label><input type="text" value={formData.policyNo} onChange={(e) => setFormData({ ...formData, policyNo: e.target.value })} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Diagnosis summary', '診斷摘要')}</label><input type="text" value={formData.diagnosisSummary} onChange={(e) => setFormData({ ...formData, diagnosisSummary: e.target.value })} required placeholder="e.g. Canine Distemper" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Claim amount (HKD)', '申請金額 (HKD)')}</label><input type="number" step="0.01" min="0" value={formData.claimAmount} onChange={(e) => setFormData({ ...formData, claimAmount: e.target.value })} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Notes (optional)', '備註（可選）')}</label><textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div></> : <p className="text-center text-sm text-slate-500">{pick('Unable to load coverage preview', '無法載入保險預覽資訊')}</p>}
            {submitClaimError && <p className="text-sm text-rose-600">{submitClaimError}</p>}
          </div>
          <div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{pick('Cancel', '取消')}</button><button type="submit" disabled={isSubmittingClaim || isLoadingCoverage} className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">{isSubmittingClaim ? pick('Submitting...', '提交中...') : pick('Submit claim', '提交理賠')}</button></div>
        </form>
      </div>
    </div>
  )
}
