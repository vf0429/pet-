'use client'

import { useEffect, useState, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  getWeeklySchedule,
  getScheduleTemplates,
  updateScheduleTemplate,
  upsertDoctorShift,
  deleteDoctorShift,
  WeeklyScheduleDTO,
  DayScheduleInfo,
  ScheduleTemplateDTO,
  DoctorDTO,
} from '@/lib/api'

// ─── helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getMondayOfWeek(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const dow = d.getDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LABELS_ZH = ['日', '一', '二', '三', '四', '五', '六']

// ─── EditShiftModal ───────────────────────────────────────────────────────────

interface EditShiftProps {
  doctor: DoctorDTO
  date: string
  current: DayScheduleInfo
  onClose: () => void
  onSaved: () => void
}

function EditShiftModal({ doctor, date, current, onClose, onSaved }: EditShiftProps) {
  const { pick } = useI18n()
  const [mode, setMode] = useState<'working' | 'off' | 'custom'>(
    !current.is_working ? 'off' : current.is_custom && current.start_time ? 'custom' : 'working'
  )
  const [startTime, setStartTime] = useState(current.start_time || '09:00')
  const [endTime, setEndTime] = useState(current.end_time || '18:00')
  const [note, setNote] = useState(current.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'working' && current.is_custom && current.shift_id) {
        // Remove the override → revert to clinic template
        await deleteDoctorShift(current.shift_id)
      } else if (mode === 'off') {
        await upsertDoctorShift({ doctor_id: doctor.id, date, is_off: true, note })
      } else if (mode === 'custom') {
        await upsertDoctorShift({
          doctor_id: doctor.id, date, is_off: false,
          start_time: startTime, end_time: endTime, note,
        })
      }
      // mode === 'working' with no override → nothing to do
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : pick('Save failed.', '儲存失敗。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{doctor.name}</p>
            <p className="text-xs text-slate-500">{date}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          {/* Mode tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            {(['working', 'custom', 'off'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  'flex-1 rounded-lg py-1.5 font-medium transition-all',
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {m === 'working'
                  ? pick('Normal', '正常')
                  : m === 'custom'
                  ? pick('Custom', '自訂')
                  : pick('Day Off', '休假')}
              </button>
            ))}
          </div>

          {mode === 'working' && (
            <p className="text-sm text-slate-500 text-center py-2">
              {pick('Follow clinic default hours.', '依照診所預設營業時間出診。')}
            </p>
          )}

          {mode === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Start', '開始')}</label>
                <input
                  type="time"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{pick('End', '結束')}</label>
                <input
                  type="time"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {mode === 'off' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Reason (optional)', '原因（選填）')}</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={pick('e.g. Annual leave', '如：年假')}
              />
            </div>
          )}

          {mode !== 'working' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{pick('Note', '備注')}</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={pick('Optional note…', '備注…')}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {pick('Cancel', '取消')}
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {saving ? pick('Saving…', '儲存中…') : pick('Save', '儲存')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ClinicHoursPanel ─────────────────────────────────────────────────────────

interface ClinicHoursPanelProps {
  templates: ScheduleTemplateDTO[]
  onUpdated: () => void
}

function ClinicHoursPanel({ templates, onUpdated }: ClinicHoursPanelProps) {
  const { pick } = useI18n()
  const [editing, setEditing] = useState<number | null>(null) // day_of_week
  const [draft, setDraft] = useState<{ open: string; close: string; active: boolean }>({
    open: '09:00', close: '18:00', active: true,
  })
  const [saving, setSaving] = useState(false)

  const startEdit = (t: ScheduleTemplateDTO) => {
    setEditing(t.day_of_week)
    setDraft({ open: t.open_time, close: t.close_time, active: t.is_active })
  }

  const handleSave = async () => {
    if (editing === null) return
    setSaving(true)
    try {
      await updateScheduleTemplate(editing, {
        open_time: draft.open,
        close_time: draft.close,
        is_active: draft.active,
      })
      onUpdated()
      setEditing(null)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{pick('Clinic Hours', '診所營業時間')}</h3>
        <p className="text-xs text-slate-500">{pick('Default schedule for all doctors', '所有醫生的預設班表')}</p>
      </div>
      <div className="divide-y divide-slate-50">
        {templates.map((t) => (
          <div key={t.day_of_week} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-[60px]">
              <span className={`text-sm font-medium ${t.is_active ? 'text-slate-900' : 'text-slate-400'}`}>
                {t.day_name}
              </span>
              {!t.is_active && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {pick('Closed', '休息')}
                </span>
              )}
            </div>
            {editing === t.day_of_week ? (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" checked={draft.active}
                    onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />
                  {pick('Open', '開放')}
                </label>
                {draft.active && (
                  <>
                    <input type="time" value={draft.open}
                      onChange={(e) => setDraft((d) => ({ ...d, open: e.target.value }))}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-400 focus:outline-none w-24" />
                    <span className="text-xs text-slate-400">–</span>
                    <input type="time" value={draft.close}
                      onChange={(e) => setDraft((d) => ({ ...d, close: e.target.value }))}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-sky-400 focus:outline-none w-24" />
                  </>
                )}
                <button onClick={handleSave} disabled={saving}
                  className="rounded-lg bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-700 disabled:opacity-50">
                  {saving ? '…' : pick('Save', '儲存')}
                </button>
                <button onClick={() => setEditing(null)}
                  className="text-xs text-slate-400 hover:text-slate-600">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {t.is_active ? `${t.open_time} – ${t.close_time}` : '—'}
                </span>
                <button onClick={() => startEdit(t)}
                  className="text-xs text-sky-600 hover:underline">{pick('Edit', '編輯')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClinicSchedulePage() {
  const { pick } = useI18n()
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek())
  const [schedule, setSchedule] = useState<WeeklyScheduleDTO | null>(null)
  const [templates, setTemplates] = useState<ScheduleTemplateDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<{ doctor: DoctorDTO; date: string; info: DayScheduleInfo } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sched, tmpl] = await Promise.all([
        getWeeklySchedule(weekStart),
        getScheduleTemplates(),
      ])
      setSchedule(sched)
      setTemplates(tmpl)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const prevWeek = () => setWeekStart((w) => addDays(w, -7))
  const nextWeek = () => setWeekStart((w) => addDays(w, 7))
  const today = () => setWeekStart(getMondayOfWeek())

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  // Cell component
  const Cell = ({ doctor, date }: { doctor: DoctorDTO; date: string }) => {
    const info = schedule?.schedule[String(doctor.id)]?.[date]
    if (!info) return <div className="h-14 rounded-lg bg-slate-50" />

    const isToday = date === new Date().toISOString().split('T')[0]

    let bg = 'bg-emerald-50 border border-emerald-200'
    let text = 'text-emerald-700'
    let label = `${info.start_time}–${info.end_time}`
    let sublabel = info.is_custom ? pick('Custom', '自訂') : ''

    if (!info.is_working) {
      bg = 'bg-slate-100 border border-slate-200'
      text = 'text-slate-400'
      label = pick('Off', '休假')
      sublabel = info.note || ''
    }

    return (
      <button
        type="button"
        onClick={() => setEditTarget({ doctor, date, info })}
        className={[
          'group w-full h-14 rounded-lg px-2 py-1.5 text-left transition-all hover:ring-2 hover:ring-sky-300 hover:ring-offset-1',
          bg,
          isToday ? 'ring-2 ring-sky-400 ring-offset-1' : '',
        ].join(' ')}
      >
        <p className={`text-[11px] font-semibold leading-tight ${text}`}>{label}</p>
        {sublabel && (
          <p className="text-[10px] text-slate-400 truncate leading-tight">{sublabel}</p>
        )}
        <p className="text-[9px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
          {pick('click to edit', '點擊編輯')}
        </p>
      </button>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pick('Schedule Management', '排班管理')}</h1>
          <p className="text-sm text-slate-500">
            {pick('Manage doctor availability and clinic hours', '管理醫生出診安排及診所營業時間')}
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: weekly schedule grid */}
        <div className="flex-1 min-w-0">
          {/* Week navigation */}
          <div className="mb-4 flex items-center gap-3">
            <button onClick={prevWeek}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              ← {pick('Prev', '上週')}
            </button>
            <button onClick={today}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              {pick('This Week', '本週')}
            </button>
            <button onClick={nextWeek}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              {pick('Next', '下週')} →
            </button>
            <span className="ml-2 text-sm font-medium text-slate-700">
              {weekStart} – {addDays(weekStart, 6)}
            </span>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              {pick('Loading schedule…', '載入排班中…')}
            </div>
          ) : schedule ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="w-28 px-4 py-3 text-left text-xs font-semibold text-slate-500">
                      {pick('Doctor', '醫生')}
                    </th>
                    {schedule.days.map((d) => {
                      const dow = new Date(d + 'T00:00:00').getDay()
                      const isToday = d === new Date().toISOString().split('T')[0]
                      return (
                        <th key={d} className="px-2 py-3 text-center text-xs font-semibold">
                          <div className={isToday ? 'text-sky-600' : 'text-slate-500'}>
                            {pick(DAY_LABELS[dow], DAY_LABELS_ZH[dow])}
                          </div>
                          <div className={`text-[11px] font-normal ${isToday ? 'text-sky-500' : 'text-slate-400'}`}>
                            {formatDateLabel(d)}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {schedule.doctors.map((doc) => (
                    <tr key={doc.id}>
                      <td className="px-4 py-2">
                        <p className="text-xs font-medium text-slate-800 truncate max-w-[96px]">{doc.name}</p>
                      </td>
                      {schedule.days.map((d) => (
                        <td key={d} className="px-1.5 py-1.5">
                          <Cell doctor={doc} date={d} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-emerald-200 bg-emerald-50" />
              {pick('Working', '出診')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-slate-200 bg-slate-100" />
              {pick('Off / Closed', '休假/休息')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border-2 border-sky-400 bg-emerald-50" />
              {pick('Today', '今日')}
            </span>
            <span className="text-slate-400">{pick('Click any cell to edit', '點擊格子可修改')}</span>
          </div>
        </div>

        {/* Right: clinic hours panel */}
        <div className="w-64 shrink-0">
          <ClinicHoursPanel templates={templates} onUpdated={load} />
        </div>
      </div>

      {/* Edit shift modal */}
      {editTarget && (
        <EditShiftModal
          doctor={editTarget.doctor}
          date={editTarget.date}
          current={editTarget.info}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
