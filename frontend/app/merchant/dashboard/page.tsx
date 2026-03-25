'use client'

import { useEffect, useState } from 'react'

import { useAuthStore } from '@/store/auth'

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const tenant = useAuthStore((state) => state.tenant)
  const fetchMe = useAuthStore((state) => state.fetchMe)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.activeBusinessType) {
      setIsLoading(false)
      return
    }

    let active = true
    setIsLoading(true)
    setError(null)

    fetchMe(user.activeBusinessType)
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Dashboard data failed to load.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [fetchMe, user?.activeBusinessType])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-3xl bg-white shadow-sm" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-3xl bg-white shadow-sm" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            if (user?.activeBusinessType) {
              setIsLoading(true)
              setError(null)
              fetchMe(user.activeBusinessType)
                .catch((err) => {
                  setError(err instanceof Error ? err.message : 'Dashboard data failed to load.')
                })
                .finally(() => setIsLoading(false))
            }
          }}
          className="mt-6 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-sm">
        <p className="text-sm text-sky-200">Good day</p>
        <h1 className="mt-2 text-3xl font-semibold">{user ? `Welcome back, ${user.name}` : 'Welcome back'}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">
          Your Phase 1 dashboard shell is ready. Current business context is
          {' '}
          <span className="font-semibold capitalize text-white">{user?.activeBusinessType ?? 'shop'}</span>
          {' '}for tenant{' '}
          <span className="font-semibold text-white">{tenant?.name ?? '--'}</span>.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Tenant Status', value: tenant?.status ?? '--' },
          { label: 'Role', value: user?.role ?? '--' },
          { label: 'Can Switch', value: user?.canSwitch ? 'Yes' : 'No' },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-4 text-2xl font-semibold capitalize text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Summary Skeleton</h2>
          <p className="mt-2 text-sm text-slate-500">
            This placeholder section is reserved for upcoming business metrics in the next phase.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Operational Notes</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>• Protected API requests use the current session cookie automatically.</li>
            <li>• Business-specific navigation updates with active business context.</li>
            <li>• Layout and dashboard both include retry-ready loading and error handling.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
