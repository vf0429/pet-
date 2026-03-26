'use client'

import { useEffect, useState } from 'react'
import { ShopOrderVM, ShopOrderStatusAction, UpdateOrderStatusParams } from '@/lib/api'
import { useShopOrdersStore } from '@/store/shop'
import StatusBadge, { canCancel, canPrepare, canShip, canComplete } from './StatusBadge'

interface OrderDetailDrawerProps {
  orderId: number | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate?: () => void
}

export default function OrderDetailDrawer({
  orderId,
  isOpen,
  onClose,
  onStatusUpdate,
}: OrderDetailDrawerProps) {
  const {
    selectedOrder,
    isLoadingDetail,
    detailError,
    fetchOrderDetail,
    updateOrderStatus,
    isUpdatingStatus,
    clearSelectedOrder,
  } = useShopOrdersStore()

  const [trackingNumber, setTrackingNumber] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (orderId && isOpen) {
      fetchOrderDetail(orderId)
      setTrackingNumber('')
      setCancelReason('')
      setShowCancelForm(false)
      setActionError(null)
    }
  }, [orderId, isOpen, fetchOrderDetail])

  const handleClose = () => {
    clearSelectedOrder()
    onClose()
  }

  const handleAction = async (action: ShopOrderStatusAction) => {
    if (!orderId) return

    if (action === 'cancelled') {
      if (!cancelReason.trim()) {
        setActionError('请输入取消原因')
        return
      }
    }

    if (action === 'shipped' && !trackingNumber.trim()) {
      setActionError('请输入物流单号')
      return
    }

    const params: UpdateOrderStatusParams = {
      targetStatus: action,
    }

    if (action === 'shipped') {
      params.trackingNumber = trackingNumber
    }

    if (action === 'cancelled') {
      params.cancelReason = cancelReason
    }

    try {
      await updateOrderStatus(orderId, params)
      setShowCancelForm(false)
      setTrackingNumber('')
      setCancelReason('')
      setActionError(null)
      onStatusUpdate?.()
    } catch {
      setActionError('状态更新失败，请稍后重试')
    }
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

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('zh-HK', {
      style: 'currency',
      currency,
    }).format(amount)
  }

  const getTimelineIcon = (toStatus: string) => {
    switch (toStatus) {
      case 'paid':
        return '💳'
      case 'preparing':
        return '📦'
      case 'shipped':
        return '🚚'
      case 'completed':
        return '✅'
      case 'cancelled':
        return '❌'
      default:
        return '📝'
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">订单详情</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingDetail ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
            </div>
          ) : detailError ? (
            <div className="p-6 text-center">
              <p className="text-rose-600">{detailError}</p>
              <button
                type="button"
                onClick={() => orderId && fetchOrderDetail(orderId)}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                重试
              </button>
            </div>
          ) : selectedOrder ? (
            <div className="divide-y divide-slate-100">
              {/* Order Header */}
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{selectedOrder.orderNo}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDateTime(selectedOrder.placedAt)}</p>
                  </div>
                  <StatusBadge status={selectedOrder.status} />
                </div>
              </div>

              {/* Customer Info */}
              <div className="p-6">
                <h3 className="mb-3 text-sm font-medium text-slate-500">客户信息</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">姓名：</span>
                    <span className="font-medium text-slate-900">{selectedOrder.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">电话：</span>
                    <span className="font-medium text-slate-900">{selectedOrder.customerPhone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">宠物：</span>
                    <span className="font-medium text-slate-900">{selectedOrder.petName}</span>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6">
                <h3 className="mb-3 text-sm font-medium text-slate-500">商品明细</h3>
                <div className="space-y-3">
                  {selectedOrder.items?.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      {item.productImageUrl ? (
                        <img
                          src={item.productImageUrl}
                          alt={item.productName}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                          <span className="text-lg">📦</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="text-sm text-slate-500">SKU: {item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-slate-900">
                          {formatPrice(item.lineTotal, selectedOrder.currency)}
                        </p>
                        <p className="text-sm text-slate-500">x{item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Summary */}
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">小计</span>
                    <span className="text-slate-900">
                      {formatPrice(selectedOrder.subtotalAmount, selectedOrder.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-500">配送费</span>
                    <span className="text-slate-900">
                      {formatPrice(selectedOrder.deliveryFee, selectedOrder.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between font-semibold">
                    <span className="text-slate-900">总计</span>
                    <span className="text-lg text-slate-900">
                      {formatPrice(selectedOrder.totalAmount, selectedOrder.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="p-6">
                  <h3 className="mb-2 text-sm font-medium text-slate-500">备注</h3>
                  <p className="text-slate-700">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Tracking Number */}
              {selectedOrder.trackingNumber && (
                <div className="p-6">
                  <h3 className="mb-2 text-sm font-medium text-slate-500">物流单号</h3>
                  <p className="font-medium text-slate-900">{selectedOrder.trackingNumber}</p>
                </div>
              )}

              {/* Cancel Reason */}
              {selectedOrder.cancelReason && (
                <div className="p-6">
                  <h3 className="mb-2 text-sm font-medium text-slate-500">取消原因</h3>
                  <p className="text-rose-600">{selectedOrder.cancelReason}</p>
                </div>
              )}

              {/* Status Timeline */}
              {selectedOrder.statusTimeline && selectedOrder.statusTimeline.length > 0 && (
                <div className="p-6">
                  <h3 className="mb-4 text-sm font-medium text-slate-500">状态记录</h3>
                  <div className="relative space-y-4">
                    {selectedOrder.statusTimeline.map((log, index) => (
                      <div key={index} className="flex gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
                          {getTimelineIcon(log.toStatus)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {log.toStatus === 'paid' && '已付款'}
                            {log.toStatus === 'preparing' && '开始备货'}
                            {log.toStatus === 'shipped' && '已发货'}
                            {log.toStatus === 'completed' && '已完成'}
                            {log.toStatus === 'cancelled' && '已取消'}
                          </p>
                          {log.changedByName && (
                            <p className="text-xs text-slate-500">by {log.changedByName}</p>
                          )}
                          <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(log.changedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        {selectedOrder && selectedOrder.availableActions && selectedOrder.availableActions.length > 0 && (
          <div className="border-t border-slate-200 p-6">
            {actionError && (
              <p className="mb-3 text-sm text-rose-600">{actionError}</p>
            )}

            {showCancelForm ? (
              <div className="space-y-3">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="请输入取消原因..."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancelForm(false)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('cancelled')}
                    disabled={isUpdatingStatus}
                    className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {isUpdatingStatus ? '处理中...' : '确认取消'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedOrder.status === 'preparing' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      物流单号
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="请输入物流单号"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  {canPrepare(selectedOrder.status) && (
                    <button
                      type="button"
                      onClick={() => handleAction('preparing')}
                      disabled={isUpdatingStatus}
                      className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      {isUpdatingStatus ? '处理中...' : '确认备货'}
                    </button>
                  )}

                  {canShip(selectedOrder.status) && (
                    <button
                      type="button"
                      onClick={() => handleAction('shipped')}
                      disabled={isUpdatingStatus}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {isUpdatingStatus ? '处理中...' : '确认发货'}
                    </button>
                  )}

                  {canComplete(selectedOrder.status) && (
                    <button
                      type="button"
                      onClick={() => handleAction('completed')}
                      disabled={isUpdatingStatus}
                      className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isUpdatingStatus ? '处理中...' : '确认完成'}
                    </button>
                  )}

                  {canCancel(selectedOrder.status) && (
                    <button
                      type="button"
                      onClick={() => setShowCancelForm(true)}
                      className="flex-1 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                    >
                      取消订单
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
