'use client'

import { useI18n } from '@/lib/i18n'

interface MockDataBannerProps {
  note?: string
  businessType?: 'shop' | 'clinic'
}

export default function MockDataBanner({ note, businessType = 'clinic' }: MockDataBannerProps) {
  const { pick } = useI18n()
  const defaultNote = businessType === 'shop'
    ? pick(
        'This page is currently using mock data. The shop module will connect to Shopify or a custom commerce API later, and real data is planned for Phase 5.',
        '此頁面目前使用 Mock 資料。Shop 模組後續將串接 Shopify 或自建電商 API，真實資料預計於 Phase 5 上線。',
      )
    : pick(
        'This page is currently using mock data. A later phase will connect the real API. Current data is for demonstration only.',
        '此頁面目前使用 Mock 資料。後續 Phase 將串接真實 API，現階段資料僅供展示。',
      )

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <span className="mt-0.5 text-amber-500">⚠️</span>
      <p className="text-sm text-amber-800">{note ?? defaultNote}</p>
      <span className="ml-auto shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">
        Mock
      </span>
    </div>
  )
}
