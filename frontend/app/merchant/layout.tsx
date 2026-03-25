'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/store/auth'

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/merchant/shop')) return 'Shop Workspace'
  if (pathname.startsWith('/merchant/clinic')) return 'Clinic Workspace'
  if (pathname.startsWith('/merchant/403')) return 'Permission Required'
  return 'Dashboard'
}

export default function MerchantLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
  const user = useAuthStore((state) => state.user)
  const tenant = useAuthStore((state) => state.tenant)
  const hydrateFromCookie = useAuthStore((state) => state.hydrateFromCookie)
  const fetchMe = useAuthStore((state) => state.fetchMe)
  const clearSession = useAuthStore((state) => state.clearSession)

  const [layoutError, setLayoutError] = useState<string | null>(null)

  useEffect(() => {
    hydrateFromCookie()
  }, [hydrateFromCookie])

  useEffect(() => {
    if (!isBootstrapping && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, isBootstrapping, router])

  useEffect(() => {
    if (!user?.activeBusinessType) return

    let active = true
    setLayoutError(null)

    fetchMe(user.activeBusinessType).catch((error) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Failed to load merchant context.'
      setLayoutError(message)
      if (message.toLowerCase().includes('session')) {
        clearSession()
        router.replace('/login')
      }
    })

    return () => {
      active = false
    }
  }, [clearSession, fetchMe, router, user?.activeBusinessType])

  const accessForbidden = useMemo(() => {
    if (!user || pathname === '/merchant/403') return false

    const requiredBusiness = pathname.startsWith('/merchant/shop')
      ? 'shop'
      : pathname.startsWith('/merchant/clinic')
        ? 'clinic'
        : null

    if (!requiredBusiness) return false

    const tenantAllowsBusiness =
      tenant?.type === 'both' || tenant?.type === requiredBusiness

    if (!tenantAllowsBusiness) return true
    if (!user.canSwitch && user.activeBusinessType !== requiredBusiness) return true

    return false
  }, [pathname, tenant?.type, user])

  useEffect(() => {
    if (accessForbidden) {
      router.replace('/merchant/403')
    }
  }, [accessForbidden, router])

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
          <p className="text-sm text-slate-600">Loading merchant workspace...</p>
        </div>
      </div>
    )
  }

  if (layoutError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">页面加载失败</h2>
          <p className="mt-2 text-sm text-slate-600">{layoutError}</p>
          <button
            type="button"
            onClick={() => {
              setLayoutError(null)
              if (user?.activeBusinessType) {
                fetchMe(user.activeBusinessType).catch((error) => {
                  const message = error instanceof Error ? error.message : 'Failed to load merchant context.'
                  setLayoutError(message)
                })
              }
            }}
            className="mt-6 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <div className="md:fixed md:inset-y-0 md:left-0 md:w-60">
        <Sidebar />
      </div>
      <div className="flex min-h-screen flex-1 flex-col md:ml-60">
        <TopBar
          title={getPageTitle(pathname)}
          subtitle={tenant ? `${tenant.name} · ${user?.activeBusinessType ?? 'shop'} view` : 'Loading tenant'}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
