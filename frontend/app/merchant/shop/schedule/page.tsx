'use client'

import { useEffect, useState } from 'react'

import { useI18n } from '@/lib/i18n'
import { getScheduleStatusLabel } from '@/lib/i18n-labels'
import { ScheduleItem, useShopScheduleStore } from '@/store/shop'

export default function ShopSchedulePage() {
  const { schedules, isLoading, error, fetchSchedules, addSchedule, updateSchedule, cancelSchedule } = useShopScheduleStore()
  const { pick, locale, formatDate } = useI18n()
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const groupedSchedules = schedules.reduce((acc, schedule) => {
    if (!acc[schedule.date]) acc[schedule.date] = []
    acc[schedule.date].push(schedule)
    return acc
  }, {} as Record<string, ScheduleItem[]>)

  const sortedDates = Object.keys(groupedSchedules).sort()

  const formatScheduleDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (dateStr === today.toISOString().split('T')[0]) return pick('Today', '今天')
    if (dateStr === tomorrow.toISOString().split('T')[0]) return pick('Tomorrow', '明天')
    return formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })
  }

  const getStatusColor = (status: ScheduleItem['status']) => {
    switch (status) {
      case 'scheduled': return 'bg-sky-500'
      case 'completed': return 'bg-emerald-500'
      case 'cancelled': return 'bg-slate-400'
    }
  }

  const getServiceIcon = (service: string) => {
    if (service.includes('Grooming')) return '✂️'
    if (service.includes('Boarding')) return '🏠'
    if (service.includes('Training')) return '🎓'
    if (service.includes('Daycare')) return '☀️'
    return '📅'
  }

  const handleAddSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    addSchedule({
      title: formData.get('title') as string,
      customerName: formData.get('customerName') as string,
      petName: formData.get('petName') as string,
      service: formData.get('service') as string,
      date: formData.get('date') as string,
      time: formData.get('time') as string,
      status: 'scheduled',
      notes: formData.get('notes') as string,
    })
    setShowAddModal(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="mt-1 text-sm text-slate-500">{pick('Manage bookings and appointments', '管理預約與排程')}</p>
        </div>
        <button type="button" onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {pick('New booking', '新建預約')}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-sm text-amber-800">{pick('Phase 2 - This page is using mock data. A future phase will connect the real backend API.', 'Phase 2 - 此頁面使用 Mock 資料，後續 Phase 將串接真實後端 API。')}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{error}</p>
          <button type="button" onClick={fetchSchedules} className="mt-2 text-sm font-medium text-rose-700 underline">{pick('Retry', '重試')}</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="animate-pulse"><div className="mb-4 h-5 w-32 rounded bg-slate-200" /><div className="space-y-3">{[1, 2, 3].map((j) => <div key={j} className="flex items-center gap-4"><div className="h-4 w-16 rounded bg-slate-200" /><div className="h-12 w-full rounded-lg bg-slate-200" /></div>)}</div></div></div>)}</div>
      ) : sortedDates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <p className="mt-4 text-sm text-slate-500">{pick('No bookings yet', '目前沒有預約紀錄')}</p>
          <button type="button" onClick={() => setShowAddModal(true)} className="mt-4 text-sm font-medium text-sky-600">{pick('Create your first booking', '建立第一筆預約')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => (
            <div key={date} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">{formatScheduleDate(date)}</h3>
              <div className="space-y-3">
                {groupedSchedules[date].sort((a, b) => a.time.localeCompare(b.time)).map((schedule) => (
                  <div key={schedule.id} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 transition-shadow hover:shadow-sm">
                    <div className="w-16 flex-shrink-0"><p className="text-sm font-medium text-slate-900">{schedule.time}</p></div>
                    <div className={`h-2 w-2 rounded-full ${getStatusColor(schedule.status)}`} />
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm">{getServiceIcon(schedule.service)}</div>
                    <div className="flex-1"><p className="font-medium text-slate-900">{schedule.title}</p><p className="mt-0.5 text-sm text-slate-500">{schedule.customerName} · {schedule.petName}</p>{schedule.notes && <p className="mt-1 text-xs text-slate-400">{schedule.notes}</p>}</div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${schedule.status === 'scheduled' ? 'bg-sky-100 text-sky-700' : schedule.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{getScheduleStatusLabel(locale, schedule.status)}</span>
                      {schedule.status === 'scheduled' && (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateSchedule(schedule.id, { status: 'completed' })} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title={pick('Mark completed', '標記完成')}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <button type="button" onClick={() => cancelSchedule(schedule.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title={pick('Cancel booking', '取消預約')}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">{pick('New booking', '新建預約')}</h2>
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <form onSubmit={handleAddSchedule} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Booking title', '預約標題')}</label>
                    <input type="text" name="title" required placeholder={pick('Example: Grooming - Max', '例如：Grooming - Max')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Customer name', '客戶姓名')}</label><input type="text" name="customerName" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>
                    <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Pet name', '寵物名')}</label><input type="text" name="petName" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Service type', '服務類型')}</label>
                    <select name="service" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
                      <option value="">{pick('Select a service', '選擇服務')}</option>
                      <option value="Full Grooming">Full Grooming</option>
                      <option value="Bath & Brush">Bath & Brush</option>
                      <option value="Pet Boarding">Pet Boarding</option>
                      <option value="Daycare">Daycare</option>
                      <option value="Obedience Training">Obedience Training</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Date', '日期')}</label><input type="date" name="date" required defaultValue={selectedDate} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>
                    <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Time', '時間')}</label><input type="time" name="time" required defaultValue="10:00" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>
                  </div>
                  <div><label className="mb-1.5 block text-sm font-medium text-slate-700">{pick('Notes', '備註')}</label><textarea name="notes" rows={2} placeholder={pick('Optional...', '可選...')} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{pick('Cancel', '取消')}</button>
                  <button type="submit" className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">{pick('Create booking', '建立預約')}</button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
