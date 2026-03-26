'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useShopDashboardStore } from '@/store/shop'
import KPICard from '@/components/KPICard'
import StatusBadge from '@/components/StatusBadge'

export default function ShopDashboardPage() {
  const {
    stats,
    recentOrders,
    inventoryAlerts,
    isLoadingStats,
    isLoadingRecentOrders,
    isLoadingAlerts,
    statsError,
    recentOrdersError,
    alertsError,
    fetchDashboardData,
  } = useShopDashboardStore()

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  const formatPrice = (amount: number, currency: string = 'HKD') => {
    return new Intl.NumberFormat('zh-HK', {
      style: 'currency',
      currency,
    }).format(amount)
  }

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('zh-HK', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Shop Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview of your shop performance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="今日订单"
          value={stats?.todayOrders ?? '-'}
          delta={stats?.todayOrdersDeltaPct}
          deltaLabel="vs 昨天"
          isLoading={isLoadingStats}
          href="/merchant/shop/orders"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
        />
        <KPICard
          title="今日营收"
          value={stats ? formatPrice(stats.todayRevenue, stats.currency) : '-'}
          delta={stats?.todayRevenueDeltaPct}
          deltaLabel="vs 昨天"
          isLoading={isLoadingStats}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <KPICard
          title="待发货"
          value={stats?.pendingShipmentCount ?? '-'}
          isLoading={isLoadingStats}
          href="/merchant/shop/orders?status=paid"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <KPICard
          title="低库存"
          value={stats?.lowStockCount ?? '-'}
          isLoading={isLoadingStats}
          href="/merchant/shop/products?low_stock_only=true"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Error States */}
      {statsError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{statsError}</p>
          <button
            type="button"
            onClick={fetchDashboardData}
            className="mt-2 text-sm font-medium text-rose-700 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">近期订单</h2>
              <Link
                href="/merchant/shop/orders"
                className="text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                查看全部
              </Link>
            </div>

            {isLoadingRecentOrders ? (
              <div className="p-5">
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-slate-200" />
                      <div className="flex-1">
                        <div className="mb-1 h-4 w-24 rounded bg-slate-200" />
                        <div className="h-3 w-32 rounded bg-slate-200" />
                      </div>
                      <div className="h-6 w-16 rounded-full bg-slate-200" />
                    </div>
                  ))}
                </div>
              </div>
            ) : recentOrdersError ? (
              <div className="p-5 text-center">
                <p className="text-sm text-rose-600">{recentOrdersError}</p>
                <button
                  type="button"
                  onClick={() => useShopDashboardStore.getState().fetchRecentOrders()}
                  className="mt-2 text-sm font-medium text-sky-600"
                >
                  重试
                </button>
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">暂无订单数据</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/merchant/shop/orders?selected=${order.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{order.orderNo}</p>
                        <span className="text-sm text-slate-400">·</span>
                        <p className="text-sm text-slate-500">{order.customerName}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {order.petName} · {formatDateTime(order.placedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-900">
                        {formatPrice(order.totalAmount, order.currency)}
                      </p>
                      <StatusBadge status={order.status} size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inventory Alerts */}
        <div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">低库存预警</h2>
              <Link
                href="/merchant/shop/products?low_stock_only=true"
                className="text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                查看全部
              </Link>
            </div>

            {isLoadingAlerts ? (
              <div className="p-5">
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-200" />
                      <div className="flex-1">
                        <div className="mb-1 h-4 w-24 rounded bg-slate-200" />
                        <div className="h-3 w-16 rounded bg-slate-200" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : alertsError ? (
              <div className="p-5 text-center">
                <p className="text-sm text-rose-600">{alertsError}</p>
                <button
                  type="button"
                  onClick={() => useShopDashboardStore.getState().fetchInventoryAlerts()}
                  className="mt-2 text-sm font-medium text-sky-600"
                >
                  重试
                </button>
              </div>
            ) : inventoryAlerts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">暂无低库存商品</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inventoryAlerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/merchant/shop/products?category=${alert.category}`}
                    className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50"
                  >
                    {alert.imageUrl ? (
                      <img
                        src={alert.imageUrl}
                        alt={alert.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                        <span className="text-lg">📦</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{alert.name}</p>
                      <p className="text-xs text-slate-500">
                        库存 {alert.stockLevel} / 阈值 {alert.lowStockThreshold}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600">
                        缺 {alert.shortageCount}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Mock Sync Status Card */}
          <div className="relative mt-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600">
              Mock
            </span>
            <h3 className="text-sm font-medium text-slate-500">App 同步状态</h3>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-slate-700">同步正常</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              最近同步: 2 分钟前
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}