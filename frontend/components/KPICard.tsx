'use client'

import Link from 'next/link'
import { ReactNode } from 'react'

interface KPICardProps {
  title: string
  value: string | number
  delta?: number
  deltaLabel?: string
  icon?: ReactNode
  href?: string
  isLoading?: boolean
  className?: string
}

export default function KPICard({
  title,
  value,
  delta,
  deltaLabel,
  icon,
  href,
  isLoading = false,
  className = '',
}: KPICardProps) {
  const isPositive = delta !== undefined && delta >= 0
  const isNegative = delta !== undefined && delta < 0

  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      {isLoading ? (
        <div className="animate-pulse">
          <div className="mb-3 h-4 w-24 rounded bg-slate-200" />
          <div className="mb-2 h-8 w-20 rounded bg-slate-200" />
          <div className="h-3 w-16 rounded bg-slate-200" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{title}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
            </div>
            {icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                {icon}
              </div>
            )}
          </div>

          {delta !== undefined && (
            <div className="mt-3 flex items-center gap-1">
              <span
                className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                  isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-slate-500'
                }`}
              >
                {isPositive ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                ) : isNegative ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : null}
                {Math.abs(delta).toFixed(1)}%
              </span>
              {deltaLabel && <span className="text-sm text-slate-400">{deltaLabel}</span>}
            </div>
          )}
        </>
      )}

      {/* Decorative gradient */}
      <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-gradient-to-tr from-slate-50 to-transparent opacity-60" />
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block cursor-pointer">
        {content}
      </Link>
    )
  }

  return content
}
