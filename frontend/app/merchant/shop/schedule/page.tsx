'use client'

import { useEffect, useState } from 'react'
import { useShopScheduleStore, ScheduleItem } from '@/store/shop'

export default function ShopSchedulePage() {
  const {
    schedules,
    isLoading,
    error,
    fetchSchedules,
    addSchedule,
    updateSchedule,
    cancelSchedule,
  } = useShopScheduleStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  // Group schedules by date
  const groupedSchedules = schedules.reduce((acc, schedule) => {
    if (!acc[schedule.date]) {
      acc[schedule.date] = []
    }
    acc[schedule.date].push(schedule)
    return acc
  }, {} as Record<string, ScheduleItem[]>)

  // Sort dates
  const sortedDates = Object.keys(groupedSchedules).sort()

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (dateStr === today.toISOString().split('T')[0]) {
      return '今天'
    }
    if (dateStr === tomorrow.toISOString().split('T')[0]) {
      return '明天'
    }

    return date.toLocaleDateString('zh-HK', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  const getStatusColor = (status: ScheduleItem['status']) => {
    switch (status) {
      case 'scheduled':
        return 'bg-sky-500'
      case 'completed':
        return 'bg-emerald-500'
      case 'cancelled':
        return 'bg-slate-400'
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
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="mt-1 text-sm text-slate-500">Manage bookings and appointments</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建预约
        </button>
      </div>

      {/* Phase 2 Notice */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-amber-800">
          Phase 2 - 此页面使用 Mock 数据。待后续 Phase 接入真实后端 API。
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            type="button"
            onClick={fetchSchedules}
            className="mt-2 text-sm font-medium text-rose-700 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* Schedule Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="animate-pulse">
                <div className="mb-4 h-5 w-32 rounded bg-slate-200" />
                <div className="space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="flex items-center gap-4">
                      <div className="h-4 w-16 rounded bg-slate-200" />
                      <div className="h-12 w-full rounded-lg bg-slate-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="mt-4 text-sm text-slate-500">暂无预约记录</p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-sm font-medium text-sky-600"
          >
            创建第一个预约
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => (
            <div key={date} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">
                {formatDate(date)}
              </h3>

              <div className="space-y-3">
                {groupedSchedules[date]
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((schedule) => (
                    <div
                      key={schedule.id}
                      className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 transition-shadow hover:shadow-sm"
                    >
                      {/* Time */}
                      <div className="w-16 flex-shrink-0">
                        <p className="text-sm font-medium text-slate-900">{schedule.time}</p>
                      </div>

                      {/* Status Indicator */}
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(schedule.status)}`} />

                      {/* Service Icon */}
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm">
                        {getServiceIcon(schedule.service)}
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{schedule.title}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {schedule.customerName} · {schedule.petName}
                        </p>
                        {schedule.notes && (
                          <p className="mt-1 text-xs text-slate-400">{schedule.notes}</p>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            schedule.status === 'scheduled'
                              ? 'bg-sky-100 text-sky-700'
                              : schedule.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {schedule.status === 'scheduled' && '已安排'}
                          {schedule.status === 'completed' && '已完成'}
                          {schedule.status === 'cancelled' && '已取消'}
                        </span>

                        {schedule.status === 'scheduled' && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateSchedule(schedule.id, { status: 'completed' })}
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                              title="标记完成"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelSchedule(schedule.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              title="取消预约"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
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

      {/* Add Modal */}
      {showAddModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">新建预约</h2>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAddSchedule} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      预约标题
                    </label>
                    <input
                      type="text"
                      name="title"
                      required
                      placeholder="例如: Grooming - Max"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        客户姓名
                      </label>
                      <input
                        type="text"
                        name="customerName"
                        required
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        宠物名
                      </label>
                      <input
                        type="text"
                        name="petName"
                        required
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      服务类型
                    </label>
                    <select
                      name="service"
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">选择服务</option>
                      <option value="Full Grooming">Full Grooming</option>
                      <option value="Bath & Brush">Bath & Brush</option>
                      <option value="Pet Boarding">Pet Boarding</option>
                      <option value="Daycare">Daycare</option>
                      <option value="Obedience Training">Obedience Training</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        日期
                      </label>
                      <input
                        type="date"
                        name="date"
                        required
                        defaultValue={selectedDate}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        时间
                      </label>
                      <input
                        type="time"
                        name="time"
                        required
                        defaultValue="10:00"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      备注
                    </label>
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="可选..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    创建预约
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}