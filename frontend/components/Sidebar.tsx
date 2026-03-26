'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { BusinessType } from '@/lib/api'
import { useAuthStore, useSwitchBusiness } from '@/store/auth'

type NavItem = {
  label: string
  href: string
  businessType: 'common' | 'shop' | 'clinic'
}

const COMMON_NAV_ITEMS: NavItem[] = []

const SHOP_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/merchant/shop/dashboard', businessType: 'shop' },
  { label: 'Orders', href: '/merchant/shop/orders', businessType: 'shop' },
  { label: 'Products', href: '/merchant/shop/products', businessType: 'shop' },
  { label: 'Schedule', href: '/merchant/shop/schedule', businessType: 'shop' },
]

const CLINIC_NAV_ITEMS: NavItem[] = [
  { label: 'Clinic Overview', href: '/merchant/clinic', businessType: 'clinic' },
  { label: 'Appointments', href: '/merchant/clinic/appointments', businessType: 'clinic' },
  { label: 'Followups', href: '/merchant/clinic/followups', businessType: 'clinic' },
  { label: 'Insurance', href: '/merchant/clinic/insurance', businessType: 'clinic' },
  { label: 'Pharmacy', href: '/merchant/clinic/pharmacy', businessType: 'clinic' },
]

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { switchBusiness, isSwitching } = useSwitchBusiness()

  const user = useAuthStore((state) => state.user)
  const tenant = useAuthStore((state) => state.tenant)
  const clearSession = useAuthStore((state) => state.clearSession)

  const [switchError, setSwitchError] = useState<string | null>(null)

  const visibleNavItems = useMemo(() => {
    if (!user) return []
    if (user.activeBusinessType === 'shop') {
      return [...COMMON_NAV_ITEMS, ...SHOP_NAV_ITEMS]
    }
    if (user.activeBusinessType === 'clinic') {
      return [...COMMON_NAV_ITEMS, ...CLINIC_NAV_ITEMS]
    }
    return COMMON_NAV_ITEMS
  }, [user])

  const handleSwitch = async (target: BusinessType) => {
    setSwitchError(null)
    try {
      await switchBusiness(target)
      router.push('/merchant/dashboard')
      router.refresh()
    } catch {
      setSwitchError('业务切换失败，请稍后重试。')
    }
  }

  const handleLogout = () => {
    clearSession()
    router.replace('/login')
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-slate-950 text-slate-100 md:w-60">
      <div className="border-b border-slate-800 px-5 py-5">
        <p className="text-xs uppercase tracking-[0.24em] text-sky-300">PetWell</p>
        <p className="mt-2 text-xl font-semibold">Merchant Portal</p>
        <p className="mt-1 text-sm text-slate-400">{tenant?.name ?? 'Loading tenant...'}</p>
      </div>

      {user?.canSwitch ? (
        <div className="border-b border-slate-800 px-4 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
            Business Context
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
            {(['shop', 'clinic'] as BusinessType[]).map((type) => {
              const active = user.activeBusinessType === type
              return (
                <button
                  key={type}
                  type="button"
                  disabled={isSwitching}
                  onClick={() => handleSwitch(type)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {type}
                </button>
              )
            })}
          </div>
          {switchError ? (
            <p className="mt-2 text-xs text-rose-300">{switchError}</p>
          ) : isSwitching ? (
            <p className="mt-2 text-xs text-slate-400">Switching business...</p>
          ) : null}
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleNavItems.map((item) => {
          const isActive =
            item.href === '/merchant/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-slate-900'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-4">
        <div className="mb-4 rounded-xl bg-slate-900 p-3">
          <p className="text-sm font-semibold text-white">{user?.name ?? 'Unknown User'}</p>
          <p className="mt-1 text-xs text-slate-400">{user?.email ?? 'No email'}</p>
          <div className="mt-3 inline-flex rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium uppercase text-sky-300">
            {user?.role ?? 'guest'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-900"
        >
          Logout
        </button>
      </div>
    </aside>
  )
}
