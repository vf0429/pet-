'use client'

import { ReactNode } from 'react'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ClinicAnalyticsVM } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const PIE_COLORS = ['#0891B2', '#06B6D4', '#22D3EE', '#67E8F9', '#A5F3FC']

const formatNumericValue = (
  value: string | number | Array<string | number> | ReadonlyArray<string | number> | undefined
) => {
  if (Array.isArray(value)) return Number(value[0] ?? 0)
  return Number(value ?? 0)
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 h-72 w-full">{children}</div>
    </section>
  )
}

export default function ClinicAnalyticsCharts({ data }: { data: ClinicAnalyticsVM }) {
  const { pick } = useI18n()
  const weekKeys = Array.from(
    new Set(
      data.doctorWorkload.flatMap((item) =>
        Object.keys(item).filter((key) => key !== 'doctorName')
      )
    )
  ).sort()

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title={pick('Daily visit trend', '每日就診趨勢')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.dailyVisits}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(value) => [formatNumericValue(value).toFixed(1), pick('Visits', '就診量')]} />
              <Line type="monotone" dataKey="visits" stroke="#0891B2" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={pick('Diagnosis distribution', '病種分佈')}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.diagnosisBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                {data.diagnosisBreakdown.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [formatNumericValue(value).toFixed(1), pick('Count', '數量')]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title={pick('Doctor workload', '醫生工作負載')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.doctorWorkload}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="doctorName" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              {weekKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={pick('Appointment attendance', '預約到場率')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.appointmentAttendance} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis dataKey="date" type="category" tick={{ fontSize: 12 }} width={92} />
              <Tooltip formatter={(value, name) => [formatNumericValue(value).toFixed(1), name === 'checkedIn' ? pick('Checked in', '到場') : name === 'confirmed' ? pick('Confirmed', '預約') : pick('Value', '數值')]} />
              <Legend />
              <Bar dataKey="confirmed" fill="#0891B2" radius={[0, 8, 8, 0]} name={pick('Confirmed', '預約')} />
              <Bar dataKey="checkedIn" fill="#67E8F9" radius={[0, 8, 8, 0]} name={pick('Checked in', '到場')} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
