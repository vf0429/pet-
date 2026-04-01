'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { createClinicPatient } from '@/lib/api'

const SPECIES_OPTIONS = ['Dog', 'Cat', 'Rabbit', 'Hamster', 'Bird', 'Other']
const BREED_MAP: Record<string, string[]> = {
  Dog: ['Golden Retriever', 'Labrador', 'Poodle', 'Shiba Inu', 'Corgi', 'Beagle', 'Chihuahua', 'Bulldog', 'Other'],
  Cat: ['British Shorthair', 'Ragdoll', 'Siamese', 'Scottish Fold', 'Maine Coon', 'Persian', 'Other'],
  Rabbit: ['Holland Lop', 'Mini Rex', 'Lionhead', 'Other'],
  Hamster: ['Syrian', 'Roborovski', 'Campbell', 'Other'],
  Bird: ['Budgerigar', 'Cockatiel', 'Lovebird', 'Other'],
  Other: ['Other'],
}

interface Props {
  onClose: () => void
  onCreated: (id: number) => void
}

export default function CreatePatientModal({ onClose, onCreated }: Props) {
  const { pick } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ownerMode, setOwnerMode] = useState<'new' | 'existing'>('new')

  const [form, setForm] = useState({
    name: '',
    gender: 'Male',
    species: 'Dog',
    breed: '',
    dateOfBirth: '',
    weight: '',
    microchip: '',
    notes: '',
    ownerFirstName: '',
    ownerLastName: '',
    ownerPhone: '',
    ownerEmail: '',
    clientId: '',
  })

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name) {
      setError(pick('Pet name is required.', '請填寫寵物名稱。'))
      return
    }
    if (ownerMode === 'new' && !form.ownerFirstName) {
      setError(pick('Owner first name is required.', '請填寫主人名字。'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await createClinicPatient({
        name: form.name,
        gender: form.gender,
        species: form.species,
        breed: form.breed,
        dateOfBirth: form.dateOfBirth,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        weightUnit: 'kg',
        microchip: form.microchip,
        notes: form.notes,
        clientId: ownerMode === 'existing' && form.clientId ? parseInt(form.clientId) : undefined,
        ownerFirstName: ownerMode === 'new' ? form.ownerFirstName : undefined,
        ownerLastName: ownerMode === 'new' ? form.ownerLastName : undefined,
        ownerPhone: ownerMode === 'new' ? form.ownerPhone : undefined,
        ownerEmail: ownerMode === 'new' ? form.ownerEmail : undefined,
      })
      onCreated(result.id)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : pick('Failed to create patient.', '建立患者失敗，請重試。'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const breeds = BREED_MAP[form.species] ?? ['Other']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {pick('Add New Patient', '新增患者')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          {/* Pet info */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{pick('Pet Info', '寵物資訊')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Pet Name *', '寵物名稱 *')}</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Buddy"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Gender', '性別')}</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.gender}
                  onChange={(e) => set('gender', e.target.value)}
                >
                  <option value="Male">{pick('Male', '公')}</option>
                  <option value="Female">{pick('Female', '母')}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Date of Birth', '出生日期')}</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.dateOfBirth}
                  onChange={(e) => set('dateOfBirth', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Species', '物種')}</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.species}
                  onChange={(e) => { set('species', e.target.value); set('breed', '') }}
                >
                  {SPECIES_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Breed', '品種')}</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.breed}
                  onChange={(e) => set('breed', e.target.value)}
                >
                  <option value="">{pick('— Select —', '— 選擇 —')}</option>
                  {breeds.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Weight (kg)', '體重 (kg)')}</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.weight}
                  onChange={(e) => set('weight', e.target.value)}
                  placeholder="3.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Microchip', '晶片號碼')}</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.microchip}
                  onChange={(e) => set('microchip', e.target.value)}
                  placeholder="985000000000000"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Notes', '備注')}</label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none resize-none"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Owner info */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{pick('Owner', '主人資訊')}</p>
              <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setOwnerMode('new')}
                  className={`rounded-md px-3 py-1 font-medium transition ${ownerMode === 'new' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {pick('New Owner', '新建主人')}
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerMode('existing')}
                  className={`rounded-md px-3 py-1 font-medium transition ${ownerMode === 'existing' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {pick('Existing ID', '已有主人')}
                </button>
              </div>
            </div>

            {ownerMode === 'new' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{pick('First Name *', '名字 *')}</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                    value={form.ownerFirstName}
                    onChange={(e) => set('ownerFirstName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Last Name', '姓氏')}</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                    value={form.ownerLastName}
                    onChange={(e) => set('ownerLastName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Phone', '電話')}</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                    value={form.ownerPhone}
                    onChange={(e) => set('ownerPhone', e.target.value)}
                    placeholder="+852 9xxx xxxx"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Email', '電郵')}</label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                    value={form.ownerEmail}
                    onChange={(e) => set('ownerEmail', e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Client ID', '主人 ID')}</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={form.clientId}
                  onChange={(e) => set('clientId', e.target.value)}
                  placeholder="123"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
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
            {isSubmitting ? pick('Creating…', '建立中…') : pick('Add Patient', '新增患者')}
          </button>
        </div>
      </div>
    </div>
  )
}
