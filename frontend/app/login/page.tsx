'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getErrorMessage(status: ReturnType<typeof useAuthStore.getState>['loginStatus'], pick: (en: string, zhHK: string) => string) {
  switch (status) {
    case 'error_invalid_credentials':
      return pick('Incorrect password or account not found', '密碼錯誤或帳號不存在')
    case 'error_account_suspended':
      return pick('This account has been suspended. Please contact your administrator.', '帳號已被停用，請聯絡管理員')
    case 'error_network':
      return pick('Network error. Please try again shortly.', '網路異常，請稍後重試')
    default:
      return ''
  }
}

export default function LoginPage() {
  const router = useRouter()

  const login = useAuthStore((state) => state.login)
  const hydrateFromCookie = useAuthStore((state) => state.hydrateFromCookie)
  const setLoginStatus = useAuthStore((state) => state.setLoginStatus)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
  const loginStatus = useAuthStore((state) => state.loginStatus)

  const [email, setEmail] = useState('owner@happypaws.com')
  const [password, setPassword] = useState('Test123!')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const { pick } = useI18n()

  useEffect(() => {
    hydrateFromCookie()
  }, [hydrateFromCookie])

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/merchant/dashboard')
    }
  }, [isAuthenticated, router])

  const submitError = useMemo(() => getErrorMessage(loginStatus, pick), [loginStatus, pick])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)
    setLoginStatus('idle')

    if (!EMAIL_REGEX.test(email)) {
      setValidationError(pick('Please enter a valid email address', '請輸入有效的電子郵件地址'))
      return
    }

    if (password.length < 8 || password.length > 72) {
      setValidationError(pick('Password must be 8 to 72 characters long', '密碼長度需為 8 到 72 個字元'))
      return
    }

    await login(email, password)
  }

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-10 text-center text-slate-200 shadow-2xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
          <p className="text-sm">{pick('Checking sign-in status...', '正在檢查登入狀態...')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 shadow-2xl shadow-slate-950/30">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">PetWell</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Merchant Portal</h1>
          <p className="mt-2 text-sm text-slate-500">
            {pick('Sign in to access your merchant dashboard and business context.', '登入後即可存取商戶儀表板與業務場景。')}
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          {pick('After sign-in, a 24-hour session will be created automatically and you will enter the correct business view based on your permissions.', '登入後會自動建立 24 小時工作階段，並依帳號權限進入對應業務畫面。')}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 pr-16 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder={pick('Enter your password', '請輸入密碼')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
              >
                {showPassword ? pick('Hide', '隱藏') : pick('Show', '顯示')}
              </button>
            </div>
          </div>

          {validationError || submitError ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {validationError || submitError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loginStatus === 'submitting'}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loginStatus === 'submitting' ? pick('Signing in...', '登入中...') : pick('Sign in', '登入')}
          </button>
        </form>
      </div>
    </main>
  )
}
