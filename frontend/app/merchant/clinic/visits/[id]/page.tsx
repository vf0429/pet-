'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useClinicVisitStore } from '@/store/clinic'
import { VisitStatus, UpdateClinicVisitParams } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/lib/i18n'

const VISIT_STATUS_FLOW: VisitStatus[] = [
  'in_progress',
  'diagnosed',
  'treated',
  'prescription_done',
  'closed',
]

// Next-step button config: standard sequential advancement
// Statuses that allow direct close shortcut (skip remaining steps)
const DIRECT_CLOSE_STATUSES: VisitStatus[] = ['in_progress', 'diagnosed', 'treated']

interface TabState {
  basic: boolean
  diagnosis: boolean
  treatment: boolean
  prescription: boolean
  files: boolean
}

interface DiagnosisForm {
  id: number | null
  name: string
  isPrimary: boolean
  notes: string
}

interface PrescriptionForm {
  id: number | null
  drugName: string
  dosage: string
  frequency: string
  durationDays: number
  notes: string
}

interface TreatmentForm {
  id: number | null
  name: string
  performedById: number
  fee: number
  notes: string
}

function buildAiSummaryDraft(params: {
  petName: string
  chiefComplaint?: string
  diagnoses: DiagnosisForm[]
  treatments: TreatmentForm[]
  prescriptions: PrescriptionForm[]
  generalMedicationNotes?: string
}) {
  const sections = [
    params.chiefComplaint?.trim()
      ? `主訴：${params.chiefComplaint.trim()}`
      : '',
    params.diagnoses.length > 0
      ? `診斷：${params.diagnoses
          .map((diag) => diag.name.trim())
          .filter(Boolean)
          .join('、')}`
      : '',
    params.treatments.length > 0
      ? `處置：${params.treatments
          .map((treat) => treat.name.trim())
          .filter(Boolean)
          .join('、')}`
      : '',
    params.prescriptions.length > 0
      ? `用藥：${params.prescriptions
          .map((presc) => {
            const parts = [presc.drugName.trim(), presc.dosage.trim(), presc.frequency.trim()].filter(Boolean)
            return parts.join(' ')
          })
          .filter(Boolean)
          .join('；')}`
      : '',
    params.generalMedicationNotes?.trim()
      ? `補充醫囑：${params.generalMedicationNotes.trim()}`
      : '',
  ].filter(Boolean)

  if (sections.length === 0) {
    return `${params.petName} 本次就診已完成，請醫生補充 AI 摘要內容。`
  }

  return sections.join('\n')
}

export default function VisitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const visitId = parseInt(params.id as string, 10)

  const { visit, isLoading, error, fetchVisit, saveVisit, pushToApp, isSaving, isPushing } = useClinicVisitStore()

  const [activeTab, setActiveTab] = useState<keyof TabState>('basic')
  const [formState, setFormState] = useState<UpdateClinicVisitParams>({})
  const [diagnoses, setDiagnoses] = useState<DiagnosisForm[]>([])
  const [prescriptions, setPrescriptions] = useState<PrescriptionForm[]>([])
  const [treatments, setTreatments] = useState<TreatmentForm[]>([])
  const [fileInput, setFileInput] = useState('')
  const { pick } = useI18n()

  const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
    in_progress: pick('In progress', '就診中'),
    diagnosed: pick('Diagnosis completed', '診斷完成'),
    treated: pick('Treatment completed', '處置完成'),
    prescription_done: pick('Prescription completed (optional)', '處方完成（可選）'),
    closed: pick('Closed', '結案'),
  }

  const NEXT_STEP_MAP: Partial<Record<VisitStatus, { targetStatus: VisitStatus; label: string }>> = {
    in_progress: { targetStatus: 'diagnosed', label: pick('Complete diagnosis →', '完成診斷 →') },
    diagnosed: { targetStatus: 'treated', label: pick('Complete treatment →', '完成處置 →') },
    treated: { targetStatus: 'prescription_done', label: pick('Complete prescription →', '完成處方 →') },
    prescription_done: { targetStatus: 'closed', label: pick('Close case', '結案') },
  }

  // Load visit data — always fetch when visitId changes to avoid stale data
  useEffect(() => {
    if (visitId && !isNaN(visitId)) {
      if (!visit || visit.id !== visitId) {
        fetchVisit(visitId)
      }
    }
  }, [visitId, visit, fetchVisit])

  // Initialize form when visit loads
  useEffect(() => {
    if (visit) {
      setFormState({
        chiefComplaint: visit.chiefComplaint,
        temperature: visit.temperature,
        heartRate: visit.heartRate,
        respiratoryRate: visit.respiratoryRate,
        aiSummary: visit.aiSummary,
        careNotes: visit.careNotes,
        generalMedicationNotes: visit.generalMedicationNotes,
      })
      setDiagnoses(
        visit.diagnoses.map((d) => ({
          id: d.id,
          name: d.name,
          isPrimary: d.isPrimary,
          notes: d.notes,
        }))
      )
      setPrescriptions(
        visit.prescriptions.map((p) => ({
          id: p.id,
          drugName: p.drugName,
          dosage: p.dosage,
          frequency: p.frequency,
          durationDays: p.durationDays,
          notes: p.notes,
        }))
      )
      setTreatments(
        visit.treatments.map((t) => ({
          id: t.id,
          name: t.name,
          performedById: t.performedById,
          fee: t.fee,
          notes: t.notes,
        }))
      )
    }
  }, [visit])

  const handleSaveDraft = async () => {
    try {
      await saveVisit(visitId, {
        ...formState,
        diagnoses,
        prescriptions,
        treatments,
      })
      alert(pick('Draft saved', '草稿已保存'))
    } catch {
      alert(pick('Save failed. Please try again.', '保存失敗，請重試'))
    }
  }

  // Advance to the next step in the standard flow (e.g. in_progress → diagnosed)
  const handleAdvanceStatus = async (targetStatus: VisitStatus) => {
    const aiSummaryDraft =
      targetStatus === 'closed' && !(formState.aiSummary || '').trim()
        ? buildAiSummaryDraft({
            petName: visit?.petName || '',
            chiefComplaint: formState.chiefComplaint,
            diagnoses,
            treatments,
            prescriptions,
            generalMedicationNotes: formState.generalMedicationNotes,
          })
        : formState.aiSummary

    try {
      await saveVisit(visitId, {
        ...formState,
        aiSummary: aiSummaryDraft,
        diagnoses,
        prescriptions,
        treatments,
        targetStatus,
      })
    } catch {
      alert(pick('Action failed. Please try again.', '操作失敗，請重試'))
    }
  }

  // Skip remaining steps and close the visit directly
  const handleDirectClose = async () => {
    if (!confirm(pick('Skip the remaining steps and close this visit now?\n\nThe appointment will also be marked as completed.', '跳過剩餘步驟，直接結案此次就診？\n\n預約將同步標記為已完成。'))) return
    const aiSummaryDraft =
      (formState.aiSummary || '').trim() ||
      buildAiSummaryDraft({
        petName: visit?.petName || '',
        chiefComplaint: formState.chiefComplaint,
        diagnoses,
        treatments,
        prescriptions,
        generalMedicationNotes: formState.generalMedicationNotes,
      })
    try {
      await saveVisit(visitId, {
        ...formState,
        aiSummary: aiSummaryDraft,
        diagnoses,
        prescriptions,
        treatments,
        targetStatus: 'closed',
      })
    } catch {
      alert(pick('Closing the case failed. Please try again.', '結案失敗，請重試'))
    }
  }

  // Push closed medical record to the pet owner's App
  const handlePushToApp = async () => {
    const aiSummary = (formState.aiSummary || '').trim()
    if (!aiSummary) {
      alert(pick('Please complete the AI summary before pushing to the mobile app.', '請先完成 AI 摘要，再推送到手機端。'))
      return
    }
    if (!confirm(pick("Push this visit record to the pet owner's app?", '將此次就診紀錄推送到寵物主人的 App？'))) return
    try {
      await saveVisit(visitId, {
        aiSummary,
        careNotes: formState.careNotes || '',
      })
      await pushToApp(visitId)
      alert(pick('Successfully pushed to the mobile app', '已成功推送到手機端'))
      router.push('/merchant/clinic/appointments')
    } catch {
      alert(pick('Push failed. Please try again.', '推送失敗，請重試'))
    }
  }

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center">{pick('Loading...', '載入中...')}</div>
  }

  if (error || !visit) {
    return (
      <div className="rounded-2xl bg-red-50 p-6">
        <p className="text-red-700">{pick('Load failed', '載入失敗')}: {error || pick('Visit record not found', '就診紀錄不存在')}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          {pick('Back', '返回')}
        </button>
      </div>
    )
  }

  const currentStatusIndex = VISIT_STATUS_FLOW.indexOf(visit.status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{pick('Visit record #{id}', '就診紀錄 #{id}', { id: visit.id })}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {pick('Pet: {name}', '寵物：{name}', { name: visit.petName })}
            </p>
          </div>
          <StatusBadge status={visit.status} />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: Timeline */}
        <div className="w-48 flex-shrink-0">
          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">{pick('Visit status', '就診狀態')}</h3>
            <div className="space-y-3">
              {VISIT_STATUS_FLOW.map((status, idx) => (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        idx <= currentStatusIndex
                          ? 'bg-emerald-500'
                          : 'bg-slate-300'
                      }`}
                    />
                    {idx < VISIT_STATUS_FLOW.length - 1 && (
                      <div
                        className={`my-1 h-8 w-0.5 ${
                          idx < currentStatusIndex
                            ? 'bg-emerald-500'
                            : 'bg-slate-300'
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p
                      className={`text-sm font-medium ${
                        idx <= currentStatusIndex
                          ? 'text-slate-900'
                          : 'text-slate-400'
                      }`}
                    >
                      {VISIT_STATUS_LABELS[status]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="flex-1">
          <div className="rounded-2xl bg-white shadow-sm">
            {/* Tab Headers */}
            <div className="flex border-b border-slate-200">
              {['basic', 'diagnosis', 'treatment', 'prescription', 'files'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as keyof TabState)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab
                      ? 'border-b-2 border-sky-500 text-sky-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'basic' && pick('Basic info', '基本資訊')}
                  {tab === 'diagnosis' && pick('Diagnosis', '診斷')}
                  {tab === 'treatment' && pick('Treatment', '處置')}
                  {tab === 'prescription' && pick('Prescription', '處方')}
                  {tab === 'files' && pick('Files', '文件附件')}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* Tab 1: Basic Info */}
              {activeTab === 'basic' && (
                <div className="space-y-6">
                  {/* Pet Profile (Read-only) */}
                  <div>
                    <h3 className="mb-3 font-semibold text-slate-900">{pick('Pet profile', '寵物檔案')}</h3>
                    <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                      <div>
                        <p className="text-xs text-slate-500">{pick('Pet name', '寵物名')}</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">{pick('Breed', '品種')}</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petBreed}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">{pick('Age', '年齡')}</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petAge}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">{pick('Weight', '體重')}</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petWeight} kg</p>
                      </div>
                    </div>
                  </div>

                  {/* Chief Complaint */}
                  <div>
                    <label className="block text-sm font-medium text-slate-900">{pick('Chief complaint', '主訴')}</label>
                    <textarea
                      value={formState.chiefComplaint || ''}
                      onChange={(e) =>
                        setFormState({ ...formState, chiefComplaint: e.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      rows={3}
                      placeholder={pick('Main symptoms or reason for visit', '患寵主要症狀或就診原因')}
                    />
                  </div>

                  {/* Vital Signs */}
                  <div>
                    <h3 className="mb-3 font-semibold text-slate-900">{pick('Vital signs', '生命體徵')}</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-600">{pick('Temperature (°C)', '體溫 (°C)')}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={formState.temperature ?? ''}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              temperature: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          placeholder="36-39"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600">{pick('Heart rate (bpm)', '心率 (bpm)')}</label>
                        <input
                          type="number"
                          value={formState.heartRate ?? ''}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              heartRate: e.target.value ? parseInt(e.target.value, 10) : null,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          placeholder="100-180"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600">{pick('Respiratory rate (bpm)', '呼吸率 (bpm)')}</label>
                        <input
                          type="number"
                          value={formState.respiratoryRate ?? ''}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              respiratoryRate: e.target.value ? parseInt(e.target.value, 10) : null,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          placeholder="20-30"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Diagnosis */}
              {activeTab === 'diagnosis' && (
                <div className="space-y-4">
                  {diagnoses.length === 0 && (
                    <p className="text-sm text-slate-500">{pick('No diagnoses yet. Add one below.', '暫無診斷，點擊下方按鈕新增')}</p>
                  )}
                  <div className="space-y-3">
                    {diagnoses.map((diag, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-3">
                            {/* Diagnosis name */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {pick('Diagnosis name', '診斷名稱')} <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={diag.name}
                                onChange={(e) => {
                                  const updated = [...diagnoses]
                                  updated[idx] = { ...updated[idx], name: e.target.value }
                                  setDiagnoses(updated)
                                }}
                                placeholder={pick('e.g. Acute gastroenteritis, skin infection...', '例如：急性胃腸炎、皮膚感染...')}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            {/* Notes */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Notes', '備註')}</label>
                              <textarea
                                value={diag.notes}
                                onChange={(e) => {
                                  const updated = [...diagnoses]
                                  updated[idx] = { ...updated[idx], notes: e.target.value }
                                  setDiagnoses(updated)
                                }}
                                placeholder={pick('Additional notes (optional)', '補充說明（可選）')}
                                rows={2}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            {/* Primary diagnosis */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={diag.isPrimary}
                                onChange={(e) => {
                                  const updated = diagnoses.map((d, i) => ({
                                    ...d,
                                    isPrimary: i === idx ? e.target.checked : false,
                                  }))
                                  setDiagnoses(updated)
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                              <span className="text-sm text-slate-700">{pick('Mark as primary diagnosis', '標記為主診斷')}</span>
                              {diag.isPrimary && (
                                <span className="px-2 py-0.5 text-xs bg-sky-100 text-sky-700 rounded-full">{pick('Primary', '主診斷')}</span>
                              )}
                            </label>
                          </div>
                          {/* Delete button */}
                          <button
                            onClick={() => setDiagnoses(diagnoses.filter((_, i) => i !== idx))}
                            className="mt-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                          >
                            {pick('Delete', '刪除')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setDiagnoses([
                        ...diagnoses,
                        { id: null, name: '', isPrimary: diagnoses.length === 0, notes: '' },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm text-slate-600 hover:border-sky-400 hover:text-sky-600 transition"
                  >
                    {pick('+ Add diagnosis', '+ 新增診斷')}
                  </button>
                </div>
              )}

              {/* Tab 3: Treatment */}
              {activeTab === 'treatment' && (
                <div className="space-y-4">
                  {treatments.length === 0 && (
                    <p className="text-sm text-slate-500">{pick('No treatments yet. Add one below.', '暫無處置，點擊下方按鈕新增')}</p>
                  )}
                  <div className="space-y-3">
                    {treatments.map((treat, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-3">
                            {/* Treatment name */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {pick('Treatment name', '處置名稱')} <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={treat.name}
                                onChange={(e) => {
                                  const updated = [...treatments]
                                  updated[idx] = { ...updated[idx], name: e.target.value }
                                  setTreatments(updated)
                                }}
                                placeholder={pick('e.g. IV injection, X-ray, wound debridement...', '例如：靜脈注射、X 光檢查、傷口清創...')}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            {/* Fee */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Fee (HKD)', '費用（HKD）')}</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={treat.fee || ''}
                                onChange={(e) => {
                                  const updated = [...treatments]
                                  updated[idx] = {
                                    ...updated[idx],
                                    fee: e.target.value ? parseFloat(e.target.value) : 0,
                                  }
                                  setTreatments(updated)
                                }}
                                placeholder="0.00"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            {/* Notes */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Notes', '備註')}</label>
                              <textarea
                                value={treat.notes}
                                onChange={(e) => {
                                  const updated = [...treatments]
                                  updated[idx] = { ...updated[idx], notes: e.target.value }
                                  setTreatments(updated)
                                }}
                                placeholder={pick('Treatment details or special notes (optional)', '處置詳情或特殊說明（可選）')}
                                rows={2}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                          </div>
                          {/* Delete button */}
                          <button
                            onClick={() => setTreatments(treatments.filter((_, i) => i !== idx))}
                            className="mt-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                          >
                            {pick('Delete', '刪除')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Total fee */}
                  {treatments.length > 0 && (
                    <div className="rounded-lg bg-slate-50 px-4 py-3 flex items-center justify-between">
                      <span className="text-sm text-slate-600">{pick('Total treatment fees', '處置總費用')}</span>
                      <span className="text-lg font-bold text-slate-900">
                        HKD {treatments.reduce((sum, t) => sum + (t.fee || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setTreatments([
                        ...treatments,
                        { id: null, name: '', performedById: 0, fee: 0, notes: '' },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm text-slate-600 hover:border-sky-400 hover:text-sky-600 transition"
                  >
                    {pick('+ Add treatment', '+ 新增處置')}
                  </button>
                </div>
              )}

              {/* Tab 4: Prescription */}
              {activeTab === 'prescription' && (
                <div className="space-y-4">
                  {prescriptions.length === 0 && (
                    <p className="text-sm text-slate-500">{pick('No prescriptions yet. Add one below.', '暫無處方，點擊下方按鈕新增')}</p>
                  )}
                  <div className="space-y-3">
                    {prescriptions.map((presc, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-3">
                            {/* Medicine name */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {pick('Medicine name', '藥品名稱')} <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={presc.drugName}
                                onChange={(e) => {
                                  const updated = [...prescriptions]
                                  updated[idx] = { ...updated[idx], drugName: e.target.value }
                                  setPrescriptions(updated)
                                }}
                                placeholder={pick('e.g. Amoxicillin, Metronidazole, Vitamin B12...', '例如：阿莫西林、甲硝唑、維生素 B12...')}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            {/* Dosage + frequency */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Dosage', '用法 / 劑量')}</label>
                                <input
                                  type="text"
                                  value={presc.dosage}
                                  onChange={(e) => {
                                    const updated = [...prescriptions]
                                    updated[idx] = { ...updated[idx], dosage: e.target.value }
                                    setPrescriptions(updated)
                                  }}
                                  placeholder={pick('e.g. 5mg/kg, half tablet...', '例如：5mg/kg、半片...')}
                                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Frequency', '頻率')}</label>
                                <input
                                  type="text"
                                  value={presc.frequency}
                                  onChange={(e) => {
                                    const updated = [...prescriptions]
                                    updated[idx] = { ...updated[idx], frequency: e.target.value }
                                    setPrescriptions(updated)
                                  }}
                                  placeholder={pick('e.g. Twice daily, every 8 hours...', '例如：每日兩次、每 8 小時...')}
                                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                              </div>
                            </div>
                            {/* Duration */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Duration (days)', '療程（天）')}</label>
                              <input
                                type="number"
                                min="1"
                                value={presc.durationDays || ''}
                                onChange={(e) => {
                                  const updated = [...prescriptions]
                                  updated[idx] = {
                                    ...updated[idx],
                                    durationDays: e.target.value ? parseInt(e.target.value, 10) : 0,
                                  }
                                  setPrescriptions(updated)
                                }}
                                placeholder={pick('Days', '天數')}
                                className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            {/* Notes */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{pick('Instructions / notes', '醫囑 / 備註')}</label>
                              <textarea
                                value={presc.notes}
                                onChange={(e) => {
                                  const updated = [...prescriptions]
                                  updated[idx] = { ...updated[idx], notes: e.target.value }
                                  setPrescriptions(updated)
                                }}
                                placeholder={pick('Medication notes, contraindications, follow-up reminders, etc. (optional)', '用藥注意事項、禁忌、覆診提醒等（可選）')}
                                rows={2}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                          </div>
                          {/* Delete button */}
                          <button
                            onClick={() => setPrescriptions(prescriptions.filter((_, i) => i !== idx))}
                            className="mt-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                          >
                            {pick('Delete', '刪除')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setPrescriptions([
                        ...prescriptions,
                        { id: null, drugName: '', dosage: '', frequency: '', durationDays: 0, notes: '' },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm text-slate-600 hover:border-sky-400 hover:text-sky-600 transition"
                  >
                    {pick('+ Add prescription', '+ 新增處方')}
                  </button>
                </div>
              )}

              {/* Tab 5: Files */}
              {activeTab === 'files' && (
                <div className="space-y-4">
                  <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          setFileInput(pick(`Selected ${e.target.files.length} file(s)`, `已選擇 ${e.target.files.length} 個檔案` ))
                        }
                      }}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <p className="text-sm text-slate-600">{pick('Click or drag files here to upload', '點擊或拖曳上傳檔案')}</p>
                      <p className="mt-1 text-xs text-slate-500">{pick('Supports images, PDF, and Word documents', '支援圖片、PDF、Word 文件')}</p>
                    </label>
                    {fileInput && (
                      <p className="mt-2 text-sm text-emerald-600">{fileInput}</p>
                    )}
                  </div>

                  {visit.files && visit.files.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold text-slate-900">{pick('Uploaded files', '已上傳檔案')}</h3>
                      <div className="space-y-2">
                        {visit.files.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                          >
                            <span className="text-sm text-slate-900">{file.fileName}</span>
                            <a
                              href={file.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-sky-600 hover:text-sky-700"
                            >
                              {pick('Download', '下載')}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {visit.status === 'closed' && (
                <div className="mt-8 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-slate-900">
                      {pick('Final review before pushing to the mobile app', '推送到手機端前的最終確認')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {pick(
                        'Review and edit the AI-generated visit summary, then add any care notes for the pet owner.',
                        '請先檢查並編輯 AI 生成的就診摘要，再補充給寵物主人的注意事項。'
                      )}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900">
                        {pick('AI summary (editable)', 'AI 摘要（可編輯）')}
                      </label>
                      <textarea
                        value={formState.aiSummary || ''}
                        onChange={(e) => setFormState({ ...formState, aiSummary: e.target.value })}
                        rows={8}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder={pick(
                          'AI summary generated from the consultation recording will appear here for doctor review.',
                          '診療錄音生成的 AI 摘要會顯示於此，供醫生審核與編輯。'
                        )}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-900">
                        {pick('Care notes / precautions', '注意事項 / 醫囑')}
                      </label>
                      <textarea
                        value={formState.careNotes || ''}
                        onChange={(e) => setFormState({ ...formState, careNotes: e.target.value })}
                        rows={5}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder={pick(
                          'Add feeding, medication, wound care, observation, or revisit instructions for the pet owner.',
                          '請填寫餵食、用藥、傷口照護、觀察重點或覆診提醒等內容。'
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-t-2xl border-t border-slate-200 bg-white px-6 py-4 shadow-lg">
        {/* Left: navigation */}
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {pick('Back', '返回')}
        </button>

        <button
          onClick={handleSaveDraft}
          disabled={isSaving}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          {isSaving
            ? pick('Saving...', '保存中...')
            : visit.status === 'closed'
              ? pick('Save final review', '保存結案內容')
              : pick('Save draft', '保存草稿')}
        </button>

        {/* Right: primary actions */}
        <div className="ml-auto flex items-center gap-3">
          {/* Direct close shortcut — only for intermediate steps */}
          {DIRECT_CLOSE_STATUSES.includes(visit.status) && (
            <button
              onClick={handleDirectClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
            >
              {pick('Close case now', '直接結案')}
            </button>
          )}

          {/* Standard next-step advancement */}
          {NEXT_STEP_MAP[visit.status] && (
            <button
              onClick={() => handleAdvanceStatus(NEXT_STEP_MAP[visit.status]!.targetStatus)}
              disabled={isSaving}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? pick('Processing...', '處理中...') : NEXT_STEP_MAP[visit.status]!.label}
            </button>
          )}

          {/* Push to App — available after visit is closed */}
          {visit.status === 'closed' && (
            <button
              onClick={handlePushToApp}
              disabled={isPushing}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {isPushing ? pick('Pushing...', '推送中...') : visit.pushedAt ? pick('Push to mobile app again', '重新推送到手機端') : pick('Push to mobile app', '推送到手機端')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
