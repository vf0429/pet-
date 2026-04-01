'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { useI18n } from '@/lib/i18n'
import { getProductCategoryLabel } from '@/lib/i18n-labels'
import { useShopProductsStore } from '@/store/shop'

export default function ShopProductsPage() {
  const searchParams = useSearchParams()
  const lowStockOnlyFromUrl = searchParams.get('low_stock_only') === 'true'
  const categoryFromUrl = searchParams.get('category') || ''

  const {
    products,
    total,
    page,
    perPage,
    categories,
    filters,
    isLoading,
    error,
    fetchProducts,
    setFilters,
    setPage,
    setPerPage,
  } = useShopProductsStore()

  const { pick, locale, formatCurrency } = useI18n()
  const [searchInput, setSearchInput] = useState(filters.search)
  const [localLowStockOnly, setLocalLowStockOnly] = useState(lowStockOnlyFromUrl || filters.lowStockOnly)
  const searchTimeoutRef = useRef<NodeJS.Timeout>(undefined)

  useEffect(() => {
    if (categoryFromUrl) setFilters({ category: categoryFromUrl })
    if (lowStockOnlyFromUrl) {
      setFilters({ lowStockOnly: true })
      setLocalLowStockOnly(true)
    }
  }, [categoryFromUrl, lowStockOnlyFromUrl, setFilters])

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = setTimeout(() => setFilters({ search: value }), 300)
    },
    [setFilters]
  )

  const handleCategoryChange = (category: string) => setFilters({ category })

  const handleLowStockToggle = () => {
    const nextValue = !localLowStockOnly
    setLocalLowStockOnly(nextValue)
    setFilters({ lowStockOnly: nextValue })
  }

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts, filters, page, perPage])

  const lowStockCount = products.filter((p) => p.isLowStock).length
  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <p className="mt-1 text-sm text-slate-500">{pick('Manage your product inventory', '管理你的商品庫存')}</p>
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
              <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-rose-800">{pick('{count} products are low in stock', '{count} 件商品庫存不足', { count: lowStockCount })}</p>
              <p className="text-sm text-rose-600">{pick('Please restock soon to avoid running out.', '請及時補貨以避免缺貨。')}</p>
            </div>
          </div>
          <button type="button" onClick={handleLowStockToggle} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
            {pick('View low-stock items', '查看低庫存商品')}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[200px] flex-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={pick('Search product name or SKU...', '搜尋商品名稱或 SKU...')}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{pick('Category:', '分類：')}</span>
            <select value={filters.category} onChange={(e) => handleCategoryChange(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
              <option value="">{pick('All categories', '全部分類')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{getProductCategoryLabel(locale, cat)}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleLowStockToggle}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              localLowStockOnly ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {pick('Low stock only', '僅顯示低庫存')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600">{error}</p>
          <button type="button" onClick={() => fetchProducts()} className="mt-2 text-sm font-medium text-rose-700 underline">
            {pick('Retry', '重試')}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="animate-pulse">
                <div className="h-32 w-full rounded-lg bg-slate-200" />
                <div className="mt-4 h-4 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-1/2 rounded bg-slate-200" />
                <div className="mt-4 h-6 w-1/3 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="mt-4 text-sm text-slate-500">{pick('No products found', '目前沒有商品資料')}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-slate-100">
                  {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><span className="text-4xl">📦</span></div>}
                  {product.isLowStock && <div className="absolute left-2 top-2"><span className="inline-flex items-center rounded-full bg-rose-500 px-2 py-1 text-xs font-medium text-white">{pick('Low stock', '低庫存')}</span></div>}
                  {!product.isActive && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><span className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">{pick('Inactive', '已下架')}</span></div>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">SKU: {product.sku}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{getProductCategoryLabel(locale, product.category)}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(product.price)}</p>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">{pick('Stock', '庫存')}</p>
                      <p className={`font-medium ${product.isLowStock ? 'text-rose-600' : 'text-slate-700'}`}>{product.stockLevel}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full transition-all ${product.isLowStock ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (product.stockLevel / (product.lowStockThreshold * 2)) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{pick('Threshold: {count}', '門檻：{count}', { count: product.lowStockThreshold })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>{pick('Show', '顯示')}</span>
                <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none">
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>{pick('{count} per page, {total} total', '每頁 {count} 筆，共 {total} 筆', { count: perPage, total })}</span>
              </div>

              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{pick('Previous', '上一頁')}</button>
                <div className="mx-2 flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) pageNum = i + 1
                    else if (page <= 3) pageNum = i + 1
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = page - 2 + i
                    return <button key={pageNum} type="button" onClick={() => setPage(pageNum)} className={`h-8 w-8 rounded-lg text-sm font-medium ${page === pageNum ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{pageNum}</button>
                  })}
                </div>
                <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{pick('Next', '下一頁')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
