'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useShopOrdersStore } from '@/store/shop'
import { ShopOrderStatus } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import OrderDetailDrawer from '@/components/OrderDetailDrawer'

const STATUS_TABS: { label: string; value: string }[] = [
  { label: '全部', value: '' },
  { label: '待付款', value: 'pending' },
  { label: '已付款', value: 'paid' },
  { label: '备货中', value: 'preparing' },
  { label: '配送中', value: 'shipped' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
]

export default function ShopOrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedIdFromUrl = searchParams.get('selected')

  const {
    orders,
    total,
    page,
    perPage,
    hasMore,
    filters,
    isLoading,
    error,
    fetchOrders,
    setFilters,
    setPage,
    setPerPage,
    selectedOrderId,
    clearSelectedOrder,
  } = useShopOrdersStore()

  const [searchInput, setSearchInput] = useState(filters.search)
  const [dateFrom, setDateFrom] = useState(filters.dateFrom)
  const [dateTo, setDateTo] = useState(filters.dateTo)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const searchTimeoutRef = useRef<NodeJS.Timeout>(undefined)

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      searchTimeoutRef.current = setTimeout(() => {
        setFilters({ search: value })
      }, 300)
    },
    [setFilters]
  )

  // Handle status tab change
  const handleStatusChange = (status: string) => {
    setFilters({ status })
  }

  // Handle date range change
  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    setFilters({ dateFrom: value })
  }

  const handleDateToChange = (value: string) => {
    setDateTo(value)
    setFilters({ dateTo: value })
  }

  // Fetch orders when filters or page changes
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders, filters, page, perPage])

  // Handle selected order from URL
  useEffect(() => {
    if (selectedIdFromUrl) {
      const orderId = parseInt(selectedIdFromUrl, 10)
      if (!isNaN(orderId)) {
        setIsDrawerOpen(true)
      }
    }
  }, [selectedIdFromUrl])

  // Clear URL param when drawer closes
  const handleDrawerClose = () => {
    setIsDrawerOpen(false)
    clearSelectedOrder()
    router.replace('/merchant/shop/orders')
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['订单号', '客户', '宠物', '商品', '金额', '状态', '下单时间']
    const rows = orders.map((order) => [
      order.orderNo,
      order.customerName,
      order.petName,
      order.itemsSummary,
      `${order.totalAmount} ${order.currency}`,
      order.status,
      order.placedAt,
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('zh-HK', {
      style: 'currency',
      currency,
    }).format(amount)
  }

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Manage and track your orders</p>
        </div>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={orders.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出 CSV
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Status Tabs */}
        <div className="mb-4 flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleStatusChange(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filters.status === tab.value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Date Range */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="搜索订单号或客户名..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">从</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">至</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            type="button"
            onClick={() => fetchOrders()}
            className="mt-2 text-sm font-medium text-rose-700 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* Orders List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8">
            <div className="animate-pulse space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-slate-200" />
                  <div className="flex-1">
                    <div className="mb-2 h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-48 rounded bg-slate-200" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="mt-4 text-sm text-slate-500">暂无订单数据</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => {
                    useShopOrdersStore.getState().fetchOrderDetail(order.id)
                    setIsDrawerOpen(true)
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50">
                    <svg className="h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{order.orderNo}</p>
                      <StatusBadge status={order.status} size="sm" />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {order.customerName} · {order.petName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {order.itemsSummary}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {formatPrice(order.totalAmount, order.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(order.placedAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>显示</span>
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>条，共 {total} 条</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一页
                  </button>

                  <div className="mx-2 flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (page <= 3) {
                        pageNum = i + 1
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = page - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setPage(pageNum)}
                          className={`h-8 w-8 rounded-lg text-sm font-medium ${
                            page === pageNum
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPage(page + 1)}
                    disabled={!hasMore}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Detail Drawer */}
      <OrderDetailDrawer
        orderId={selectedOrderId}
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        onStatusUpdate={() => fetchOrders()}
      />
    </div>
  )
}