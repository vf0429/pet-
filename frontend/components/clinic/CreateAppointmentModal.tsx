'use client'

import { useEffect, useState, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  createClinicAppointment,
  listClinicDoctors,
  getDoctorAvailability,
  DoctorDTO,
  AvailabilitySlot,
} from '@/lib/api'

const VISIT_TYPES = ['general', 'vaccination', 'surgery', 'dental', 'checkup', 'emergency', 'grooming']

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateAppointmentModal({ onClose, onCreated }: Props) {
  const { pick } = useI18n()
  const [doctors, setDoctors] = useState<DoctorDTO[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clinicClosed, setClinicClosed] = useState(false)

  const [form, setForm] = useState({
    petName: '',
    petOwnerName: '',
    petOwnerPhone: '',
    visitType: 'general',
    doctorId: 0,
    date: new Date().toISOString().split('T')[0],
    time: '',   // selected from slot grid
    notes: '',
  })

  useEffect(() => {
    listClinicDoctors().then(setDoctors).catch(() => {})
  }, [])

  // Fetch available slots whenever doctor or date changes
  const fetchSlots = useCallback(async (doctorId: number, date: string) => {
    if (!doctorId || !date) { setSlots([]); return }
    setLoadingSlots(true)
    setClinicClosed(false)
    setError(null)
    try {
      const data = await getDoctorAvailability(doctorId, date)
      if (!data.is_working) {
        setClinicClosed(true)
        setSlots([])
        setForm((f) => ({ ...f, time: '' }))
      } else {
        setSlots(data.slots)
        // Auto-select first available slot
        const first = data.slots.find((s) => s.available)
        setForm((f) => ({ ...f, time: first ? first.time : '' }))
      }
    } catch {
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots(form.doctorId, form.date)
  }, [form.doctorId, form.date, fetchSlots])

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.petName || !form.petOwnerName || !form.doctorId) {
      setError(pick('Pet name, owner name and doctor are required.', '請填寫寵物名稱、主人姓名和指定醫生。'))
      return
    }
    if (!form.time) {
      setError(pick('Please select an available time slot.', '請選擇可用的就診時段。'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      // Build ISO string in local HKT (+08:00) so backend receives the intended local time
      const scheduledAt = `${form.date}T${form.time}:00+08:00`
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
      // Surface backend error messages (409 conflict, 400 hours, etc.)
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('already booked') || msg.includes('40901')) {
        setError(pick(
          'This time slot was just taken. Please choose another time.',
          '該時段剛被預約，請重新選擇。'
        ))
        // Refresh slots to show updated availability
        fetchSlots(form.doctorId, form.date)
      } else if (msg.includes('outside clinic hours') || msg.includes('40011')) {
        setError(pick('Selected time is outside clinic hours.', '所選時間不在診所營業時間內。'))
      } else if (msg.includes('not available') || msg.includes('40012')) {
        setError(pick('This doctor is not available on the selected date.', '該醫生當日不出診，請另選日期。'))
        setClinicClosed(true)
      } else {
        setError(msg || pick('Failed to create appointment.', '建立預約失敗，請重試。'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Render slot grid (3 columns)
  const renderSlots = () => {
    if (loadingSlots) {
      return (
        <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {pick('Loading available slots…', '載入可用時段中…')}
        </div>
      )
    }
    if (!form.doctorId) {
      return <p className="py-2 text-xs text-slate-400">{pick('Select a doctor first.', '請先選擇醫生。')}</p>
    }
    if (clinicClosed) {
      return (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
          {pick('⚠️ Clinic or doctor is not available on this day.', '⚠️ 該日診所或醫生不出診。')}
        </div>
      )
    }
    if (slots.length === 0) {
      return <p className="py-2 text-xs text-slate-400">{pick('No slots available.', '暫無可用時段。')}</p>
    }
    return (
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {slots.map((slot) => {
          const isSelected = form.time === slot.time
          const isBooked = !slot.available
          return (
            <button
              key={slot.time}
              type="button"
              disabled={isBooked}
              onClick={() => !isBooked && set('time', slot.time)}
              title={isBooked ? `${pick('Booked', '已預約')}: ${slot.pet_name ?? ''}` : ''}
              className={[
                'rounded-lg border px-1.5 py-2 text-xs font-medium transition-all',
                isBooked
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through'
                  : isSelected
                  ? 'border-sky-500 bg-sky-500 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50',
              ].join(' ')}
            >
              {slot.time}
              {isBooked && (
                <span className="ml-0.5 text-[9px] text-slate-300">●</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">
            {pick('New Appointment', '新增預約')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          {/* Pet + Owner */}
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

          {/* Doctor + Date — triggers slot refresh */}
          <div className="grid grid-cols-2 gap-4">
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
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Date *', '日期 *')}</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </div>
          </div>

          {/* Time slot grid */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">
                {pick('Available Time Slots *', '可用時段 *')}
              </label>
              {form.time && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                  {pick('Selected', '已選')}: {form.time}
                </span>
              )}
            </div>
            {renderSlots()}
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
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {pick('Cancel', '取消')}
          </button>
          <button
            type="button"
            disabled={isSubmitting || !form.time || clinicClosed}
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
