'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { BusinessType, listClinicReminders } from '@/lib/api'
import { useAuthStore, useSwitchBusiness } from '@/store/auth'
import { useI18n } from '@/lib/i18n'

type NavItem = {
  label: string
  href: string
  businessType: 'common' | 'shop' | 'clinic'
  badgeKey?: 'overdueReminders'
}

const COMMON_NAV_ITEMS: NavItem[] = []

const SHOP_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/merchant/shop/dashboard', businessType: 'shop' },
  { label: 'Analytics', href: '/merchant/shop/analytics', businessType: 'shop' },
  { label: 'Orders', href: '/merchant/shop/orders', businessType: 'shop' },
  { label: 'Products', href: '/merchant/shop/products', businessType: 'shop' },
  { label: 'Schedule', href: '/merchant/shop/schedule', businessType: 'shop' },
]

const CLINIC_NAV_ITEMS: NavItem[] = [
  { label: 'Clinic Overview', href: '/merchant/clinic/dashboard', businessType: 'clinic' },
  { label: 'Analytics', href: '/merchant/clinic/analytics', businessType: 'clinic' },
  { label: 'Appointments', href: '/merchant/clinic/appointments', businessType: 'clinic' },
  { label: 'Schedule', href: '/merchant/clinic/schedule', businessType: 'clinic' },
  { label: 'Patients', href: '/merchant/clinic/patients', businessType: 'clinic' },
  { label: 'Reminders', href: '/merchant/clinic/reminders', businessType: 'clinic', badgeKey: 'overdueReminders' },
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
  const { pick } = useI18n()

  // Load overdue reminder count for badge — use direct API call to avoid polluting the shared store's perPage
  const [overdueCount, setOverdueCount] = useState(0)
  useEffect(() => {
    if (user?.activeBusinessType === 'clinic') {
      listClinicReminders({ status: 'overdue', per_page: 1 })
        .then((r) => setOverdueCount(r.counts.overdue))
        .catch(() => {})
    } else {
      setOverdueCount(0)
    }
  }, [user?.activeBusinessType])

  const badges: Record<string, number> = { overdueReminders: overdueCount }

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
      setSwitchError(pick('Unable to switch business. Please try again shortly.', '切換業務失敗，請稍後再試。'))
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
        <p className="mt-1 text-sm text-slate-400">{tenant?.name ?? pick('Loading tenant...', '正在載入商戶資訊...')}</p>
      </div>

      {user?.canSwitch ? (
        <div className="border-b border-slate-800 px-4 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
            {pick('Business Context', '業務場景')}
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
                  {type === 'shop' ? pick('Shop', '商店') : pick('Clinic', '診所')}
                </button>
              )
            })}
          </div>
          {switchError ? (
            <p className="mt-2 text-xs text-rose-300">{switchError}</p>
          ) : isSwitching ? (
            <p className="mt-2 text-xs text-slate-400">{pick('Switching business...', '正在切換業務...')}</p>
          ) : null}
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleNavItems.map((item) => {
          const isActive =
            item.href === '/merchant/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href)

          const labelMap: Record<string, string> = {
            'Clinic Overview': pick('Clinic Overview', '診所總覽'),
            'Appointments': pick('Appointments', '預約管理'),
            'Patients': pick('Patients', '患者管理'),
            'Reminders': pick('Reminders', '健康提醒'),
            'Followups': pick('Follow-ups', '回訪管理'),
            'Insurance': pick('Insurance', '保險理賠'),
            'Pharmacy': pick('Pharmacy', '藥房庫存'),
            'Dashboard': pick('Dashboard', '儀表板'),
            'Analytics': pick('Analytics', '數據分析'),
            'Orders': pick('Orders', '訂單管理'),
            'Products': pick('Products', '商品管理'),
            'Schedule': pick('Schedule', '排班管理'),
          }
          const displayLabel = labelMap[item.label] ?? item.label
          const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-slate-900'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span>{displayLabel}</span>
              {badgeCount > 0 && (
                <span className={`ml-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${isActive ? 'bg-rose-500 text-white' : 'bg-rose-500/80 text-white'}`}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-4">
        <div className="mb-4 rounded-xl bg-slate-900 p-3">
          <p className="text-sm font-semibold text-white">{user?.name ?? pick('Unknown user', '未知使用者')}</p>
          <p className="mt-1 text-xs text-slate-400">{user?.email ?? pick('No email', '沒有電子郵件')}</p>
          <div className="mt-3 inline-flex rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium uppercase text-sky-300">
            {user?.role ?? pick('guest', '訪客')}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-900"
        >
          {pick('Log out', '登出')}
        </button>
      </div>
    </aside>
  )
}
