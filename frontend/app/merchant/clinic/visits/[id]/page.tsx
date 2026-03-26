'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useClinicVisitStore } from '@/store/clinic'
import { VisitStatus, UpdateClinicVisitParams } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

const VISIT_STATUS_FLOW: VisitStatus[] = [
  'in_progress',
  'diagnosed',
  'treated',
  'prescription_done',
  'closed',
]

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  in_progress: '就诊中',
  diagnosed: '诊断完成',
  treated: '处置完成',
  prescription_done: '处方完成',
  closed: '结案',
}

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

export default function VisitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const visitId = parseInt(params.id as string, 10)

  const { visit, isLoading, error, fetchVisit, saveVisit, isSaving } = useClinicVisitStore()

  const [activeTab, setActiveTab] = useState<keyof TabState>('basic')
  const [formState, setFormState] = useState<UpdateClinicVisitParams>({})
  const [diagnoses, setDiagnoses] = useState<DiagnosisForm[]>([])
  const [prescriptions, setPrescriptions] = useState<PrescriptionForm[]>([])
  const [treatments, setTreatments] = useState<TreatmentForm[]>([])
  const [fileInput, setFileInput] = useState('')

  // Load visit data
  useEffect(() => {
    if (visitId && !visit) {
      fetchVisit(visitId)
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
      alert('草稿已保存')
    } catch {
      alert('保存失败，请重试')
    }
  }

  const handlePushToApp = async () => {
    try {
      await saveVisit(visitId, {
        ...formState,
        diagnoses,
        prescriptions,
        treatments,
        targetStatus: 'diagnosed',
      })
      alert('已推送到App')
    } catch {
      alert('推送失败，请重试')
    }
  }

  const handleCloseVisit = async () => {
    if (!confirm('确认结案此次就诊？')) return
    try {
      await saveVisit(visitId, {
        targetStatus: 'closed',
      })
      router.push('/merchant/clinic/appointments')
    } catch {
      alert('结案失败，请重试')
    }
  }

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center">加载中...</div>
  }

  if (error || !visit) {
    return (
      <div className="rounded-2xl bg-red-50 p-6">
        <p className="text-red-700">加载失败: {error || '就诊记录不存在'}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          返回
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
            <h1 className="text-2xl font-bold text-slate-900">就诊记录 #{visit.id}</h1>
            <p className="mt-1 text-sm text-slate-500">
              宠物: {visit.petName}
            </p>
          </div>
          <StatusBadge status={visit.status} />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: Timeline */}
        <div className="w-48 flex-shrink-0">
          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">就诊状态</h3>
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
                  {tab === 'basic' && '基本信息'}
                  {tab === 'diagnosis' && '诊断'}
                  {tab === 'treatment' && '处置'}
                  {tab === 'prescription' && '处方'}
                  {tab === 'files' && '文件附件'}
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
                    <h3 className="mb-3 font-semibold text-slate-900">宠物档案</h3>
                    <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                      <div>
                        <p className="text-xs text-slate-500">宠物名</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">品种</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petBreed}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">年龄</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petAge}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">体重</p>
                        <p className="mt-1 font-medium text-slate-900">{visit.petWeight} kg</p>
                      </div>
                    </div>
                  </div>

                  {/* Chief Complaint */}
                  <div>
                    <label className="block text-sm font-medium text-slate-900">主诉</label>
                    <textarea
                      value={formState.chiefComplaint || ''}
                      onChange={(e) =>
                        setFormState({ ...formState, chiefComplaint: e.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      rows={3}
                      placeholder="患宠主要症状或就诊原因"
                    />
                  </div>

                  {/* Vital Signs */}
                  <div>
                    <h3 className="mb-3 font-semibold text-slate-900">生命体征</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-600">体温 (°C)</label>
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
                        <label className="block text-xs text-slate-600">心率 (bpm)</label>
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
                        <label className="block text-xs text-slate-600">呼吸率 (bpm)</label>
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
                  {diagnoses.length === 0 ? (
                    <p className="text-sm text-slate-500">暂无诊断</p>
                  ) : (
                    <div className="space-y-3">
                      {diagnoses.map((diag, idx) => (
                        <div key={idx} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-slate-900">{diag.name}</p>
                              {diag.isPrimary && (
                                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-sky-100 text-sky-700 rounded">
                                  主诊断
                                </span>
                              )}
                              {diag.notes && (
                                <p className="mt-2 text-xs text-slate-600">{diag.notes}</p>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setDiagnoses(diagnoses.filter((_, i) => i !== idx))
                              }
                              className="text-red-600 hover:text-red-700"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setDiagnoses([
                        ...diagnoses,
                        { id: null, name: '', isPrimary: diagnoses.length === 0, notes: '' },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:text-slate-900"
                  >
                    + 添加诊断
                  </button>
                </div>
              )}

              {/* Tab 3: Treatment */}
              {activeTab === 'treatment' && (
                <div className="space-y-6">
                  {treatments.length === 0 ? (
                    <p className="text-sm text-slate-500">暂无处置</p>
                  ) : (
                    <div>
                      <h3 className="mb-3 font-semibold text-slate-900">处置列表</h3>
                      <div className="space-y-3">
                        {treatments.map((treat, idx) => (
                          <div key={idx} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-medium text-slate-900">{treat.name}</p>
                                <p className="mt-1 text-xs text-slate-600">
                                  费用: ¥{treat.fee.toFixed(2)} | 医生ID: {treat.performedById}
                                </p>
                                {treat.notes && (
                                  <p className="mt-2 text-xs text-slate-600">{treat.notes}</p>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  setTreatments(treatments.filter((_, i) => i !== idx))
                                }
                                className="text-red-600 hover:text-red-700"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 rounded-lg bg-slate-50 p-3">
                        <p className="text-xs text-slate-600">总费用</p>
                        <p className="text-lg font-bold text-slate-900">
                          ¥{treatments.reduce((sum, t) => sum + t.fee, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setTreatments([
                        ...treatments,
                        { id: null, name: '', performedById: 0, fee: 0, notes: '' },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:text-slate-900"
                  >
                    + 添加处置
                  </button>
                </div>
              )}

              {/* Tab 4: Prescription */}
              {activeTab === 'prescription' && (
                <div className="space-y-4">
                  {prescriptions.length === 0 ? (
                    <p className="text-sm text-slate-500">暂无处方</p>
                  ) : (
                    <div className="space-y-3">
                      {prescriptions.map((presc, idx) => (
                        <div key={idx} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-slate-900">{presc.drugName}</p>
                              <p className="mt-1 text-xs text-slate-600">
                                用法: {presc.dosage} | 频率: {presc.frequency} | 天数: {presc.durationDays}
                              </p>
                              {presc.notes && (
                                <p className="mt-2 text-xs text-slate-600">{presc.notes}</p>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setPrescriptions(prescriptions.filter((_, i) => i !== idx))
                              }
                              className="text-red-600 hover:text-red-700"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setPrescriptions([
                        ...prescriptions,
                        { id: null, drugName: '', dosage: '', frequency: '', durationDays: 0, notes: '' },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:text-slate-900"
                  >
                    + 添加处方
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
                          setFileInput(`已选择 ${e.target.files.length} 个文件`)
                        }
                      }}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <p className="text-sm text-slate-600">点击或拖拽上传文件</p>
                      <p className="mt-1 text-xs text-slate-500">支持图片、PDF、Word文档</p>
                    </label>
                    {fileInput && (
                      <p className="mt-2 text-sm text-emerald-600">{fileInput}</p>
                    )}
                  </div>

                  {visit.files && visit.files.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold text-slate-900">已上传文件</h3>
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
                              下载
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 flex gap-3 rounded-t-2xl border-t border-slate-200 bg-white px-6 py-4 shadow-lg">
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          返回
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={isSaving}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          {isSaving ? '保存中...' : '保存草稿'}
        </button>
        <button
          onClick={handlePushToApp}
          disabled={isSaving || visit.status !== 'in_progress'}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {isSaving ? '处理中...' : '推送到 App'}
        </button>
        <button
          onClick={handleCloseVisit}
          disabled={isSaving || visit.status === 'closed'}
          className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isSaving ? '处理中...' : '结案'}
        </button>
      </div>
    </div>
  )
}
