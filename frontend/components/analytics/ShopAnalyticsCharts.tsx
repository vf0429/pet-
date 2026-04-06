'use client'

import { ReactNode } from 'react'

import {
  Area,
  AreaChart,
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

import { ShopAnalyticsVM } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const PIE_COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE']

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

export default function ShopAnalyticsCharts({ data }: { data: ShopAnalyticsVM }) {
  const { pick, formatCurrency } = useI18n()

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title={pick('Daily revenue trend', '每日營收趨勢')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.dailyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => `${Number(value).toFixed(1)}`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatCurrency(formatNumericValue(value)), pick('Revenue', '營收')]} />
              <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={pick('Daily order trend', '每日訂單趨勢')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.dailyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(value) => [formatNumericValue(value).toFixed(1), pick('Orders', '訂單數')]} />
              <Area type="monotone" dataKey="orders" stroke="#3B82F6" fill="#93C5FD" fillOpacity={0.45} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title={pick('Category sales share', '品類銷售佔比')}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.categoryBreakdown} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={90}>
                {data.categoryBreakdown.map((entry, index) => (
                  <Cell key={`${entry.category}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [formatCurrency(formatNumericValue(value)), pick('Revenue', '營收')]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={pick('Top 10 products', 'Top 10 商品')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.topProducts} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value, name) => [name === 'sales' ? formatNumericValue(value).toFixed(1) : formatCurrency(formatNumericValue(value)), name === 'sales' ? pick('Units sold', '銷量') : pick('Revenue', '營收')]} />
              <Legend />
              <Bar dataKey="sales" fill="#2563EB" radius={[0, 8, 8, 0]} name={pick('Units sold', '銷量')} />
              <Bar dataKey="revenue" fill="#93C5FD" radius={[0, 8, 8, 0]} name={pick('Revenue', '營收')} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
