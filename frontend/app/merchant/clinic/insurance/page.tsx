'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClinicInsuranceStore } from '@/store/clinic'
import { InsuranceClaimStatus } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

const STATUS_TABS: { label: string; value: InsuranceClaimStatus | '' }[] = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '处理中', value: 'processing' },
  { label: '已批准', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]

const STATUS_LABELS: Record<InsuranceClaimStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  processing: '处理中',
  approved: '已批准',
  rejected: '已拒绝',
}

function formatDateTime(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrice(amount: number, currency: string = 'HKD') {
  return new Intl.NumberFormat('zh-HK', {
    style: 'currency',
    currency,
  }).format(amount)
}

export default function ClinicInsurancePage() {
  const searchParams = useSearchParams()
  const visitIdFromUrl = searchParams.get('visit_id')

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

  // Fetch claims on mount and when filters change
  useEffect(() => {
    fetchClaims()
  }, [fetchClaims, claimsFilters])

  const handleTabChange = useCallback((status: InsuranceClaimStatus | '') => {
    setClaimsFilters({ status })
  }, [setClaimsFilters])

  const totalPages = Math.ceil(claimsTotal / claimsPerPage)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">保险理赔</h1>
          <p className="mt-1 text-sm text-slate-500">管理诊所保险理赔申请与材料</p>
        </div>
        {visitIdFromUrl && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建理赔申请
          </button>
        )}
      </div>

      {/* Phase 2 Notice */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-amber-800">
          Phase 2 - 保险理赔功能已启用，数据来源于实际就诊记录。
        </p>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabChange(tab.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
              claimsFilters.status === tab.value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error State */}
      {(claimsError || error) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{claimsError || error}</p>
          <button
            type="button"
            onClick={() => fetchClaims()}
            className="mt-2 text-sm font-medium text-rose-700 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* Claims List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-sm text-slate-500">共 {claimsTotal} 条理赔记录</p>
        </div>

        {isLoadingClaims ? (
          <div className="p-8">
            <div className="animate-pulse space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-slate-200" />
                  <div className="flex-1">
                    <div className="mb-2 h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-48 rounded bg-slate-200" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="mt-4 text-sm text-slate-500">暂无理赔记录</p>
            {visitIdFromUrl && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-4 text-sm font-medium text-sky-600"
              >
                创建第一个理赔申请
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {claims.map((claim) => (
                <button
                  key={claim.id}
                  type="button"
                  onClick={() => setSelectedClaimId(claim.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50">
                    <svg className="h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        #{claim.id} - {claim.petName}
                      </p>
                      <span className="text-sm text-slate-400">·</span>
                      <p className="text-sm text-slate-500">{claim.providerName}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {claim.planName} · 保单号: {claim.policyNo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {formatPrice(claim.claimAmount, claim.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(claim.submittedAt)}
                    </p>
                  </div>
                  <StatusBadge
                    status={claim.status}
                    size="sm"
                  />
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>显示</span>
                  <select
                    value={claimsPerPage}
                    onChange={(e) => {
                      setClaimsPage(1)
                      fetchClaims({ perPage: Number(e.target.value) })
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>条，共 {claimsTotal} 条</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setClaimsPage(claimsPage - 1)
                      fetchClaims({ page: claimsPage - 1 })
                    }}
                    disabled={claimsPage === 1}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一页
                  </button>

                  <div className="mx-2 flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (claimsPage <= 3) {
                        pageNum = i + 1
                      } else if (claimsPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = claimsPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => {
                            setClaimsPage(pageNum)
                            fetchClaims({ page: pageNum })
                          }}
                          className={`h-8 w-8 rounded-lg text-sm font-medium ${
                            claimsPage === pageNum
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setClaimsPage(claimsPage + 1)
                      fetchClaims({ page: claimsPage + 1 })
                    }}
                    disabled={!claimsHasMore}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Claim Detail Modal */}
      {selectedClaimId !== null && (
        <ClaimDetailModal
          claimId={selectedClaimId}
          onClose={() => setSelectedClaimId(null)}
        />
      )}

      {/* Create Claim Modal */}
      {showCreateModal && visitIdFromUrl && (
        <CreateClaimModal
          visitId={parseInt(visitIdFromUrl, 10)}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            fetchClaims()
          }}
        />
      )}
    </div>
  )
}

// ----- Claim Detail Modal -----

interface ClaimDetailModalProps {
  claimId: number
  onClose: () => void
}

function ClaimDetailModal({ claimId, onClose }: ClaimDetailModalProps) {
  const { claims, isLoadingClaims } = useClinicInsuranceStore()
  const claim = claims.find((c) => c.id === claimId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">理赔详情 #{claimId}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {isLoadingClaims ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
            </div>
          ) : claim ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">宠物名</p>
                  <p className="font-medium text-slate-900">{claim.petName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">状态</p>
                  <StatusBadge status={claim.status} size="sm" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">保险公司</p>
                  <p className="font-medium text-slate-900">{claim.providerName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">计划名称</p>
                  <p className="font-medium text-slate-900">{claim.planName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">保单号</p>
                  <p className="font-medium text-slate-900">{claim.policyNo}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">申请金额</p>
                  <p className="font-medium text-slate-900">
                    {formatPrice(claim.claimAmount, claim.currency)}
                  </p>
                </div>
                {claim.approvedAmount > 0 && (
                  <div>
                    <p className="text-sm text-slate-500">批准金额</p>
                    <p className="font-medium text-emerald-600">
                      {formatPrice(claim.approvedAmount, claim.currency)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-slate-500">提交时间</p>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(claim.submittedAt)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-slate-500">理赔记录不存在</p>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// ----- Create Claim Modal -----

interface CreateClaimModalProps {
  visitId: number
  onClose: () => void
  onSuccess: () => void
}

function CreateClaimModal({ visitId, onClose, onSuccess }: CreateClaimModalProps) {
  const { submitClaim, isSubmittingClaim, submitClaimError, fetchCoveragePreview, coveragePreview, isLoadingCoverage } = useClinicInsuranceStore()

  const [formData, setFormData] = useState({
    policyNo: '',
    providerName: '',
    planName: '',
    claimAmount: '',
    diagnosisSummary: '',
    notes: '',
  })

  useEffect(() => {
    // Fetch coverage preview to pre-fill policy info
    fetchCoveragePreview(visitId)
  }, [visitId, fetchCoveragePreview])

  useEffect(() => {
    if (coveragePreview) {
      setFormData((prev) => ({
        ...prev,
        policyNo: coveragePreview.policy.policyNo,
        providerName: coveragePreview.policy.providerName,
        planName: coveragePreview.policy.planName,
      }))
    }
  }, [coveragePreview])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await submitClaim({
        visitId,
        policyNo: formData.policyNo,
        providerName: formData.providerName,
        planName: formData.planName,
        claimAmount: parseFloat(formData.claimAmount),
        currency: 'HKD',
        diagnosisSummary: formData.diagnosisSummary,
        expenseItems: [
          { itemName: 'Consultation', amount: parseFloat(formData.claimAmount), isCovered: true },
        ],
        notes: formData.notes || undefined,
      })
      onSuccess()
    } catch {
      // Error handled by store
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">新建理赔申请</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {isLoadingCoverage ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
              </div>
            ) : coveragePreview ? (
              <>
                <div className="rounded-lg bg-sky-50 p-3">
                  <p className="text-sm font-medium text-sky-800">
                    宠物: {coveragePreview.petName}
                  </p>
                  <p className="text-xs text-sky-600">
                    主人: {coveragePreview.petOwnerName}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      保险公司
                    </label>
                    <input
                      type="text"
                      value={formData.providerName}
                      onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      计划名称
                    </label>
                    <input
                      type="text"
                      value={formData.planName}
                      onChange={(e) => setFormData({ ...formData, planName: e.target.value })}
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    保单号
                  </label>
                  <input
                    type="text"
                    value={formData.policyNo}
                    onChange={(e) => setFormData({ ...formData, policyNo: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    诊断摘要
                  </label>
                  <input
                    type="text"
                    value={formData.diagnosisSummary}
                    onChange={(e) => setFormData({ ...formData, diagnosisSummary: e.target.value })}
                    required
                    placeholder="例如: Canine Distemper"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    申请金额 (HKD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.claimAmount}
                    onChange={(e) => setFormData({ ...formData, claimAmount: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    备注（可选）
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-slate-500">
                无法加载保险预览信息
              </p>
            )}

            {submitClaimError && (
              <p className="text-sm text-rose-600">{submitClaimError}</p>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmittingClaim || isLoadingCoverage}
              className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmittingClaim ? '提交中...' : '提交理赔'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}