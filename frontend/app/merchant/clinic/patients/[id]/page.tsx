'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { useI18n } from '@/lib/i18n'
import { useClinicPatientsStore } from '@/store/clinic'

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { pick } = useI18n()

  const { detail, isLoadingDetail, detailError, fetchPatientDetail, clearDetail } =
    useClinicPatientsStore()

  useEffect(() => {
    const id = Number(params.id)
    if (id) fetchPatientDetail(id)
    return () => clearDetail()
  }, [params.id, fetchPatientDetail, clearDetail])

  if (isLoadingDetail) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        {pick('Loading...', '載入中...')}
      </div>
    )
  }

  if (detailError || !detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
        <p className="text-lg font-medium">{detailError ?? pick('Patient not found', '找不到患者')}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
        >
          {pick('Go back', '返回')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            ← {pick('Back', '返回')}
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {detail.name}
              {detail.isDeceased && (
                <span className="ml-2 rounded-full bg-slate-200 px-2.5 py-0.5 text-sm font-medium text-slate-500">
                  {pick('Deceased', '已離世')}
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {detail.species}
              {detail.breed ? ` · ${detail.breed}` : ''}
              {detail.gender ? ` · ${detail.gender}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-2">
        {/* Patient Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {pick('Patient Info', '患者資訊')}
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-400">{pick('Date of Birth', '出生日期')}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {detail.dateOfBirth
                  ? new Date(detail.dateOfBirth).toLocaleDateString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">{pick('Weight', '體重')}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {detail.weight > 0 ? `${detail.weight} ${detail.weightUnit}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">{pick('Microchip', '晶片號碼')}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{detail.microchip || '—'}</dd>
            </div>
            {detail.notesImportant && (
              <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <dt className="text-xs font-semibold text-amber-700">
                  ⚠ {pick('Important Notes', '重要備注')}
                </dt>
                <dd className="mt-1 text-sm text-amber-800">{detail.notesImportant}</dd>
              </div>
            )}
            {detail.notes && (
              <div className="col-span-2">
                <dt className="text-slate-400">{pick('Notes', '備注')}</dt>
                <dd className="mt-0.5 text-slate-700">{detail.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Owner Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {pick('Owner', '主人資訊')}
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-400">{pick('Name', '姓名')}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{detail.owner.fullName}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{pick('Phone', '電話')}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{detail.owner.phone || '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-400">{pick('Email', '電子郵件')}</dt>
              <dd className="mt-0.5 text-slate-700">{detail.owner.email || '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Reminders */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {pick('Health Reminders', '健康提醒')}
            </h2>
            <Link
              href={`/merchant/clinic/reminders`}
              className="text-xs text-sky-600 hover:underline"
            >
              {pick('View all', '查看全部')}
            </Link>
          </div>
          {detail.reminders.length === 0 ? (
            <p className="text-sm text-slate-400">{pick('No reminders', '沒有提醒')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {detail.reminders.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{r.category}</p>
                  </div>
                  <div className="text-right text-xs">
                    {r.lastFulfilledAt ? (
                      <span className="text-emerald-600">
                        ✓ {new Date(r.lastFulfilledAt).toLocaleDateString()}
                      </span>
                    ) : r.dueAt ? (
                      <span
                        className={
                          new Date(r.dueAt) < new Date() ? 'text-rose-600 font-medium' : 'text-slate-500'
                        }
                      >
                        {new Date(r.dueAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Visits */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {pick('Recent Visits', '近期就診')}
          </h2>
          {detail.recentVisits.length === 0 ? (
            <p className="text-sm text-slate-400">{pick('No visits yet', '尚無就診記錄')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {detail.recentVisits.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <Link
                      href={`/merchant/clinic/visits/${v.id}`}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {new Date(v.consultDate).toLocaleDateString()}
                    </Link>
                    {v.chiefComplaint && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                        {v.chiefComplaint}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs capitalize text-slate-600">
                    {v.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
