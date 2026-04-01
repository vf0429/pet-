'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { createClinicAppointment, listClinicDoctors, DoctorDTO } from '@/lib/api'

const VISIT_TYPES = ['general', 'vaccination', 'surgery', 'dental', 'checkup', 'emergency', 'grooming']

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateAppointmentModal({ onClose, onCreated }: Props) {
  const { pick } = useI18n()
  const [doctors, setDoctors] = useState<DoctorDTO[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    petName: '',
    petOwnerName: '',
    petOwnerPhone: '',
    visitType: 'general',
    doctorId: 0,
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    notes: '',
  })

  useEffect(() => {
    listClinicDoctors().then(setDoctors).catch(() => {})
  }, [])

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.petName || !form.petOwnerName || !form.doctorId) {
      setError(pick('Pet name, owner name, and doctor are required.', '請填寫寵物名稱、主人姓名和指定醫生。'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString()
      await createClinicAppointment({
        petName: form.petName,
        petOwnerName: form.petOwnerName,
        petOwnerPhone: form.petOwnerPhone,
        visitType: form.visitType,
        doctorId: form.doctorId,
        scheduledAt,
        notes: form.notes,
      })
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : pick('Failed to create appointment.', '建立預約失敗，請重試。'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {pick('New Appointment', '新增預約')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Pet Name *', '寵物名稱 *')}</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.petName}
                onChange={(e) => set('petName', e.target.value)}
                placeholder="Buddy"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Owner Name *', '主人姓名 *')}</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.petOwnerName}
                onChange={(e) => set('petOwnerName', e.target.value)}
                placeholder="Chan Tai Man"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Owner Phone', '聯繫電話')}</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.petOwnerPhone}
                onChange={(e) => set('petOwnerPhone', e.target.value)}
                placeholder="+852 9xxx xxxx"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Visit Type', '就診類型')}</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.visitType}
                onChange={(e) => set('visitType', e.target.value)}
              >
                {VISIT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Date *', '日期 *')}</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Time *', '時間 *')}</label>
              <input
                type="time"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.time}
                onChange={(e) => set('time', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Doctor *', '主診醫生 *')}</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              value={form.doctorId}
              onChange={(e) => set('doctorId', Number(e.target.value))}
            >
              <option value={0}>{pick('— Select doctor —', '— 選擇醫生 —')}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Notes', '備注')}</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none resize-none"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder={pick('Any special notes…', '特殊備注…')}
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
            className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {isSubmitting ? pick('Creating…', '建立中…') : pick('Create Appointment', '建立預約')}
          </button>
        </div>
      </div>
    </div>
  )
}
