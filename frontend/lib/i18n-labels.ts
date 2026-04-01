import { Locale, pickByLocale } from '@/lib/i18n'
import { ShopOrderStatus } from '@/lib/api'

export function getOrderStatusLabel(locale: Locale, status: ShopOrderStatus | string): string {
  switch (status) {
    case 'pending':
      return pickByLocale(locale, 'Pending payment', '待付款')
    case 'paid':
      return pickByLocale(locale, 'Paid', '已付款')
    case 'preparing':
      return pickByLocale(locale, 'Preparing', '備貨中')
    case 'shipped':
      return pickByLocale(locale, 'Shipped', '配送中')
    case 'completed':
      return pickByLocale(locale, 'Completed', '已完成')
    case 'cancelled':
      return pickByLocale(locale, 'Cancelled', '已取消')
    default:
      return status
  }
}

export function getOrderActionLabel(locale: Locale, status: ShopOrderStatus): string {
  switch (status) {
    case 'paid':
      return pickByLocale(locale, 'Start preparing', '確認備貨')
    case 'preparing':
      return pickByLocale(locale, 'Ship order', '出貨')
    case 'shipped':
      return pickByLocale(locale, 'Complete order', '完成訂單')
    case 'pending':
      return pickByLocale(locale, 'Cancel order', '取消訂單')
    default:
      return ''
  }
}

export function getAnalyticsPeriodLabel(locale: Locale, period: string) {
  switch (period) {
    case '7d':
      return pickByLocale(locale, '7 days', '7 天')
    case '30d':
      return pickByLocale(locale, '30 days', '30 天')
    default:
      return period
  }
}

export function getAppointmentStatusLabel(locale: Locale, status: string) {
  switch (status) {
    case 'pending':
      return pickByLocale(locale, 'Pending', '待確認')
    case 'confirmed':
      return pickByLocale(locale, 'Confirmed', '已確認')
    case 'checked_in':
      return pickByLocale(locale, 'Checked in', '已報到')
    case 'in_progress':
      return pickByLocale(locale, 'In progress', '就診中')
    case 'completed':
      return pickByLocale(locale, 'Completed', '已完成')
    case 'cancelled':
      return pickByLocale(locale, 'Cancelled', '已取消')
    default:
      return status
  }
}

export function getVisitTypeLabel(locale: Locale, type: string) {
  switch (type) {
    case 'vaccine':
      return pickByLocale(locale, 'Vaccination', '疫苗接種')
    case 'checkup':
      return pickByLocale(locale, 'Check-up', '常規檢查')
    case 'surgery':
      return pickByLocale(locale, 'Surgery', '手術')
    case 'emergency':
      return pickByLocale(locale, 'Emergency', '急診')
    case 'dental':
      return pickByLocale(locale, 'Dental', '牙科')
    case 'followup':
      return pickByLocale(locale, 'Follow-up', '覆診')
    default:
      return type
  }
}

export function getInsuranceStatusLabel(locale: Locale, status: string) {
  switch (status) {
    case 'draft':
      return pickByLocale(locale, 'Draft', '草稿')
    case 'submitted':
      return pickByLocale(locale, 'Submitted', '已提交')
    case 'processing':
      return pickByLocale(locale, 'Processing', '處理中')
    case 'approved':
      return pickByLocale(locale, 'Approved', '已批准')
    case 'rejected':
      return pickByLocale(locale, 'Rejected', '已拒絕')
    default:
      return status
  }
}

export function getStorageConditionLabel(locale: Locale, value: string) {
  switch (value) {
    case 'refrigerated':
      return pickByLocale(locale, 'Refrigerated', '冷藏')
    case 'room_temp':
      return pickByLocale(locale, 'Room temperature', '室溫')
    case 'light_protected':
      return pickByLocale(locale, 'Protect from light', '避光')
    default:
      return value
  }
}

export function getProductCategoryLabel(locale: Locale, category: string) {
  switch (category) {
    case 'food':
      return pickByLocale(locale, 'Food', '食品')
    case 'supplement':
      return pickByLocale(locale, 'Supplements', '保健品')
    case 'toy':
      return pickByLocale(locale, 'Toys', '玩具')
    case 'accessory':
      return pickByLocale(locale, 'Accessories', '配件')
    default:
      return category
  }
}

export function getScheduleStatusLabel(locale: Locale, status: string) {
  switch (status) {
    case 'scheduled':
      return pickByLocale(locale, 'Scheduled', '已安排')
    case 'completed':
      return pickByLocale(locale, 'Completed', '已完成')
    case 'cancelled':
      return pickByLocale(locale, 'Cancelled', '已取消')
    default:
      return status
  }
}

export function getPushConsumerStatusLabel(locale: Locale, status: string) {
  switch (status) {
    case 'healthy':
      return pickByLocale(locale, 'Healthy', '正常')
    case 'degraded':
      return pickByLocale(locale, 'Degraded', '降級')
    case 'down':
      return pickByLocale(locale, 'Down', '停用')
    default:
      return status
  }
}
