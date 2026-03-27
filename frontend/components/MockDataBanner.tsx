'use client'

interface MockDataBannerProps {
  note?: string
  businessType?: 'shop' | 'clinic'
}

export default function MockDataBanner({ note, businessType = 'clinic' }: MockDataBannerProps) {
  const defaultNote = businessType === 'shop'
    ? '此页面当前使用 Mock 数据。Shop 模块后续将对接 Shopify / 自建电商 API，真实数据将在 Phase 5 上线。'
    : '此页面当前使用 Mock 数据。后续 Phase 将接入真实 API，当前数据仅供演示使用。'

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
