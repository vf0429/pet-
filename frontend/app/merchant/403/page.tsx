'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { useAuthStore } from '@/store/auth'

export default function ForbiddenPage() {
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
  const hydrateFromCookie = useAuthStore((state) => state.hydrateFromCookie)
  const user = useAuthStore((state) => state.user)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    hydrateFromCookie().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to verify permission state.')
    })
  }, [hydrateFromCookie])

  if (isBootstrapping) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
          <p className="text-sm text-slate-600">Checking access permission...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ⛔
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900">403 Forbidden</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          You do not have permission to access this business area.
        </p>
        {user ? (
          <p className="mt-3 text-sm text-slate-500">
            Current active business: <span className="font-medium capitalize">{user.activeBusinessType}</span>
          </p>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/merchant/dashboard"
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white"
          >
            Back to dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"
          >
            Return to login
          </Link>
        </div>
      </div>
    </div>
  )
}
