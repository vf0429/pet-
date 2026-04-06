'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { createClinicReminder, listClinicPatients } from '@/lib/api'
import { useEffect } from 'react'
import type { ClinicPatientListVM } from '@/lib/api'

const CATEGORIES = ['vaccine', 'deworm', 'checkup', 'dental', 'lab', 'surgery', 'other']
const IMPORTANCES = ['high', 'medium', 'low']

interface Props {
  /** Pre-fill patient if opened from patient detail page */
  prefilledPatientId?: number
  prefilledPatientName?: string
  onClose: () => void
  onCreated: () => void
}

export default function CreateReminderModal({ prefilledPatientId, prefilledPatientName, onClose, onCreated }: Props) {
  const { pick } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patients, setPatients] = useState<ClinicPatientListVM[]>([])
  const [patientSearch, setPatientSearch] = useState(prefilledPatientName ?? '')

  const [form, setForm] = useState({
    patientId: prefilledPatientId ?? 0,
    category: 'vaccine',
    name: '',
    importance: 'medium',
    dueAt: '',
  })

  useEffect(() => {
    if (prefilledPatientId) return
    listClinicPatients({ q: patientSearch || undefined, per_page: 20 })
      .then((r) => setPatients(r.patients))
      .catch(() => {})
  }, [patientSearch, prefilledPatientId])

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.patientId) {
      setError(pick('Please select a patient.', '請選擇患者。'))
      return
    }
    if (!form.name) {
      setError(pick('Reminder name is required.', '請填寫提醒名稱。'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await createClinicReminder({
        patientId: form.patientId,
        category: form.category,
        name: form.name,
        importance: form.importance,
        dueAt: form.dueAt || undefined,
      })
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : pick('Failed to create reminder.', '建立提醒失敗。'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const REMINDER_TEMPLATES: Record<string, string[]> = {
    vaccine: ['Rabies Vaccine', 'DHPP Annual', 'Bordetella', 'Leptospirosis', 'Feline FVRCP'],
    deworm: ['Monthly Deworming', 'Heartworm Prevention', 'Flea & Tick Treatment'],
    checkup: ['Annual Physical Exam', 'Blood Panel', 'Urine Test', 'Senior Wellness'],
    dental: ['Dental Cleaning', 'Dental X-Ray'],
    lab: ['CBC Blood Test', 'Chemistry Panel', 'Thyroid Check'],
    surgery: ['Post-Op Follow-up', 'Suture Removal'],
    other: [],
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {pick('Add Health Reminder', '新增健康提醒')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          {/* Patient */}
          {prefilledPatientId ? (
            <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-sm text-sky-800">
              🐾 {prefilledPatientName ?? `Patient #${prefilledPatientId}`}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Patient *', '患者 *')}</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder={pick('Search patient name…', '搜尋患者名稱…')}
              />
              {patients.length > 0 && !form.patientId && (
                <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  {patients.map((p) => (
                    <li
                      key={p.id}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-sky-50"
                      onClick={() => {
                        set('patientId', p.id)
                        setPatientSearch(`${p.name} (${p.ownerName})`)
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{p.ownerName} · {p.species}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Category', '類別')}</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.category}
                onChange={(e) => { set('category', e.target.value); set('name', '') }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Importance', '重要性')}</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.importance}
                onChange={(e) => set('importance', e.target.value)}
              >
                {IMPORTANCES.map((i) => (
                  <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Name with quick-fill */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Reminder Name *', '提醒名稱 *')}</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={pick('e.g. Rabies Vaccine', '例如：狂犬病疫苗')}
            />
            {REMINDER_TEMPLATES[form.category]?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REMINDER_TEMPLATES[form.category].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('name', t)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Due date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Due Date', '到期日')}</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              value={form.dueAt}
              onChange={(e) => set('dueAt', e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {pick('Cancel', '取消')}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? pick('Adding…', '新增中…') : pick('Add Reminder', '新增提醒')}
          </button>
        </div>
      </div>
    </div>
  )
}
