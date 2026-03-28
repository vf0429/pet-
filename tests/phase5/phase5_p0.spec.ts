import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page, test } from '@playwright/test'

test.use({
  baseURL: 'http://localhost:3000',
  viewport: { width: 1440, height: 900 },
})

test.describe.configure({ mode: 'serial' })

const TEST_PASSWORD = process.env.TEST_PASSWORD
const BACKEND_BASE_URL = 'http://localhost:8080'

const USERS = {
  shopOwner: {
    email: 'owner@happypaws.com',
    tenantName: 'Happy Paws',
    businessType: 'shop' as const,
  },
  clinicManager: {
    email: 'admin@pawsclinic.com',
    tenantName: 'Paws Clinic',
    businessType: 'clinic' as const,
  },
} as const

type BusinessType = 'shop' | 'clinic'

type ShopAnalyticsDTO = {
  period: { from: string; to: string }
  summary: {
    total_revenue: number
    total_orders: number
    avg_order_value: number
    repeat_purchase_rate: number
  }
  daily_revenue: Array<{ date: string; revenue: number; orders: number }>
  category_breakdown: Array<{ category: string; revenue: number; pct: number }>
  top_products: Array<{ name: string; sales: number; revenue: number }>
}

type ClinicAnalyticsDTO = {
  period: { from: string; to: string }
  summary: {
    total_visits: number
    avg_visit_duration_min: number | null
    revisit_rate_30d: number
    prescription_rate: number
  }
  daily_visits: Array<{ date: string; visits: number }>
  diagnosis_breakdown: Array<{ name: string; count: number; pct: number }>
  doctor_workload: Array<Record<string, string | number>>
  appointment_attendance: Array<{ date: string; confirmed: number; checked_in: number; rate: number }>
}

function getPassword() {
  expect(TEST_PASSWORD, 'TEST_PASSWORD must be set for Phase 5 Playwright tests').toBeTruthy()
  return TEST_PASSWORD as string
}

async function preparePage(page: Page) {
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        caret-color: transparent !important;
      }
    `
    document.head.appendChild(style)
  })
}

async function apiLogin(request: APIRequestContext, email: string) {
  const response = await request.post(`${BACKEND_BASE_URL}/v1/merchant/auth/login`, {
    data: { email, password: getPassword() },
  })

  expect(response.ok(), `Login failed for ${email}: ${response.status()}`).toBeTruthy()
  return response.json() as Promise<{ session_id: string; expires_at: string }>
}

async function loginAs(page: Page, email: string) {
  await preparePage(page)
  await page.context().clearCookies()

  const session = await apiLogin(page.request, email)
  await page.context().addCookies([
    {
      name: 'session_id',
      value: session.session_id,
      domain: 'localhost',
      path: '/',
      expires: Math.floor(new Date(session.expires_at).getTime() / 1000),
      sameSite: 'Lax',
      httpOnly: false,
    },
  ])

  return session
}

async function uiLoginAs(page: Page, email: string) {
  await preparePage(page)
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(getPassword())
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/merchant\//)
}

async function merchantGet(
  request: APIRequestContext,
  sessionId: string,
  businessType: BusinessType,
  endpoint: string,
) {
  return request.get(`${BACKEND_BASE_URL}/v1/merchant${endpoint}`, {
    headers: {
      'X-Session-ID': sessionId,
      'X-Business-Type': businessType,
    },
  })
}

function buildShopAnalyticsEnvelope(period: '7d' | '30d' = '7d') {
  const is30d = period === '30d'
  return {
    period: { from: is30d ? '2026-02-27' : '2026-03-21', to: '2026-03-28' },
    summary: {
      total_revenue: is30d ? 186400 : 48200,
      total_orders: is30d ? 423 : 109,
      avg_order_value: is30d ? 440.9 : 442.2,
      repeat_purchase_rate: is30d ? 0.32 : 0.28,
    },
    daily_revenue: [
      { date: '2026-03-26', revenue: is30d ? 7200 : 7200, orders: 16 },
      { date: '2026-03-27', revenue: is30d ? 8100 : 8100, orders: 18 },
      { date: '2026-03-28', revenue: is30d ? 6800 : 6800, orders: 14 },
    ],
    category_breakdown: [
      { category: '宠粮', revenue: 89000, pct: 47.7 },
      { category: '保健品', revenue: 51200, pct: 27.5 },
      { category: '洗护', revenue: 46200, pct: 24.8 },
    ],
    top_products: [
      { name: 'Royal Canin 成猫粮 2kg', sales: 48, revenue: 12000 },
      { name: '益生菌营养膏', sales: 32, revenue: 8600 },
    ],
  } satisfies ShopAnalyticsDTO
}

function buildClinicAnalyticsEnvelope(period: '7d' | '30d' = '7d') {
  const is30d = period === '30d'
  return {
    period: { from: is30d ? '2026-02-27' : '2026-03-21', to: '2026-03-28' },
    summary: {
      total_visits: is30d ? 156 : 38,
      avg_visit_duration_min: 28,
      revisit_rate_30d: is30d ? 0.41 : 0.19,
      prescription_rate: is30d ? 0.73 : 0.68,
    },
    daily_visits: [
      { date: '2026-03-26', visits: 6 },
      { date: '2026-03-27', visits: 8 },
      { date: '2026-03-28', visits: 5 },
    ],
    diagnosis_breakdown: [
      { name: '皮肤病', count: 34, pct: 21.8 },
      { name: '肠胃炎', count: 22, pct: 14.1 },
    ],
    doctor_workload: [
      { doctor_name: 'Dr. Li', week1: 28, week2: 31, week3: 26 },
      { doctor_name: 'Dr. Wong', week1: 18, week2: 21, week3: 19 },
    ],
    appointment_attendance: [
      { date: '2026-03-26', confirmed: 8, checked_in: 7, rate: 0.875 },
      { date: '2026-03-27', confirmed: 7, checked_in: 5, rate: 0.714 },
    ],
  } satisfies ClinicAnalyticsDTO
}

async function expectForbiddenPage(page: Page) {
  await page.waitForURL(/\/(merchant\/403|login)/)
  if (page.url().includes('/merchant/403')) {
    await expect(page.getByRole('heading', { name: '403' })).toBeVisible()
  } else {
    await expect(page).toHaveURL(/\/login/)
  }
}

async function createLoggedInPage(browser: Browser, email: string) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  await uiLoginAs(page, email)
  return { context, page }
}

async function closeContexts(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()))
}

test.describe('Phase 5 P0 verification assets', () => {
  test('TC-5-01 Shop Analytics 页面可加载，并覆盖页面级 tenant isolation + screenshot', async ({ browser }, testInfo) => {
    const shop = await createLoggedInPage(browser, USERS.shopOwner.email)
    const clinic = await createLoggedInPage(browser, USERS.clinicManager.email)

    const requestedHeaders: string[] = []

    await shop.page.route('**/api/v1/merchant/analytics/shop**', async (route) => {
      requestedHeaders.push(route.request().headers()['x-business-type'] ?? '')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'max-age=300, private' },
        body: JSON.stringify(buildShopAnalyticsEnvelope('7d')),
      })
    })

    await shop.page.goto('/merchant/shop/analytics')
    await expect(shop.page.getByRole('heading', { name: '销售数据分析' })).toBeVisible({ timeout: 15_000 })
    await expect(shop.page.getByText('总营收', { exact: true })).toBeVisible()
    await expect(shop.page.getByText('总订单数', { exact: true })).toBeVisible()
    await expect(shop.page.getByText('客单价', { exact: true })).toBeVisible()
    await expect(shop.page.getByText('复购率', { exact: true })).toBeVisible()
    await expect(shop.page.locator('aside').getByText(USERS.shopOwner.tenantName, { exact: true })).toBeVisible()
    await expect(shop.page.locator('aside').getByText(USERS.clinicManager.tenantName, { exact: true })).toHaveCount(0)
    await shop.page.screenshot({ path: testInfo.outputPath('phase5-shop-analytics-page.png'), fullPage: true })

    await clinic.page.goto('/merchant/shop/analytics')
    await expectForbiddenPage(clinic.page)

    expect(requestedHeaders).toContain('shop')

    await closeContexts(shop.context, clinic.context)
  })

  test('TC-5-02 Clinic Analytics 页面可加载，并保留 screenshot assertion 点', async ({ browser }, testInfo) => {
    const clinic = await createLoggedInPage(browser, USERS.shopOwner.email)

    const requestedHeaders: string[] = []

    await clinic.page.route('**/api/v1/merchant/analytics/clinic**', async (route) => {
      requestedHeaders.push(route.request().headers()['x-business-type'] ?? '')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'max-age=300, private' },
        body: JSON.stringify(buildClinicAnalyticsEnvelope('7d')),
      })
    })

    await clinic.page.goto('/merchant/shop/dashboard')
    await clinic.page.getByRole('button', { name: 'clinic', exact: true }).click()
    await clinic.page.waitForURL(/\/merchant\/dashboard/)

    await clinic.page.goto('/merchant/clinic/analytics')
    await expect(clinic.page.getByRole('heading', { name: '诊疗数据分析' })).toBeVisible({ timeout: 15_000 })
    await expect(clinic.page.getByText('总就诊数', { exact: true })).toBeVisible()
    await expect(clinic.page.getByText('平均就诊时长', { exact: true })).toBeVisible()
    await expect(clinic.page.getByText('复诊率', { exact: true })).toBeVisible()
    await expect(clinic.page.getByText('处方率', { exact: true })).toBeVisible()
    await expect(clinic.page.locator('aside').getByText(USERS.shopOwner.tenantName, { exact: true })).toBeVisible()
    await clinic.page.screenshot({ path: testInfo.outputPath('phase5-clinic-analytics-page.png'), fullPage: true })

    expect(requestedHeaders).toContain('clinic')

    await closeContexts(clinic.context)
  })

  test('TC-5-03 时间范围切换支持合法流转，关键页面保留 screenshot assertion 点', async ({ page }, testInfo) => {
    await loginAs(page, USERS.shopOwner.email)

    const periods: string[] = []

    await page.route('**/api/v1/merchant/analytics/shop**', async (route) => {
      const url = new URL(route.request().url())
      const period = (url.searchParams.get('period') ?? '7d') as '7d' | '30d'
      periods.push(period)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'max-age=300, private' },
        body: JSON.stringify(buildShopAnalyticsEnvelope(period)),
      })
    })

    await page.goto('/merchant/shop/analytics')
    await expect(page.getByRole('heading', { name: '销售数据分析' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: '7天', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '30天', exact: true })).toBeVisible()

    await page.getByRole('button', { name: '30天', exact: true }).click()
    await expect.poll(() => periods.filter((value) => value === '30d').length).toBeGreaterThan(0)
    await page.screenshot({ path: testInfo.outputPath('phase5-shop-analytics-30d.png'), fullPage: true })
  })

  test('TC-5-04 Shop Analytics API 覆盖 tenant isolation、缓存头、合法/非法 period state machine', async ({ request }) => {
    const shopSession = await apiLogin(request, USERS.shopOwner.email)
    const clinicSession = await apiLogin(request, USERS.clinicManager.email)

    const [shop7d, shop30d, legalCustom, illegalCustom, clinicCrossTenant] = await Promise.all([
      merchantGet(request, shopSession.session_id, 'shop', '/analytics/shop?period=7d'),
      merchantGet(request, shopSession.session_id, 'shop', '/analytics/shop?period=30d'),
      merchantGet(request, shopSession.session_id, 'shop', '/analytics/shop?period=custom&date_from=2026-03-01&date_to=2026-03-28'),
      merchantGet(request, shopSession.session_id, 'shop', '/analytics/shop?period=custom&date_from=2026-01-01&date_to=2026-05-01'),
      merchantGet(request, clinicSession.session_id, 'shop', '/analytics/shop?period=30d'),
    ])

    expect(shop7d.ok()).toBeTruthy()
    expect(shop30d.ok()).toBeTruthy()
    expect(legalCustom.ok()).toBeTruthy()
    expect(shop30d.headers()['cache-control'] ?? '').toContain('max-age=300')
    expect(shop30d.headers()['cache-control'] ?? '').toContain('private')

    const body7d = await shop7d.json()
    const body30d = await shop30d.json()
    const bodyCustom = await legalCustom.json()

    expect(body7d.data ?? body7d).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          total_revenue: expect.any(Number),
          total_orders: expect.any(Number),
          avg_order_value: expect.any(Number),
          repeat_purchase_rate: expect.any(Number),
        }),
      }),
    )
    expect((body30d.data ?? body30d).daily_revenue).toEqual(expect.any(Array))
    expect((bodyCustom.data ?? bodyCustom).period).toEqual(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }))

    expect(illegalCustom.status(), 'custom range > 90 days must be blocked').toBe(400)
    expect([200, 403, 404]).toContain(clinicCrossTenant.status())
    if (clinicCrossTenant.ok()) {
      const crossTenantBody = await clinicCrossTenant.json()
      expect((crossTenantBody.data ?? crossTenantBody).summary.total_orders).not.toBe((body30d.data ?? body30d).summary.total_orders)
    }
  })

  test('TC-5-05 Clinic Analytics API 覆盖 tenant isolation、null 容忍与合法/非法 period state machine', async ({ request }) => {
    const clinicSession = await apiLogin(request, USERS.clinicManager.email)
    const shopSession = await apiLogin(request, USERS.shopOwner.email)

    const [clinic30d, clinicLegalCustom, clinicIllegalCustom, shopCrossTenant] = await Promise.all([
      merchantGet(request, clinicSession.session_id, 'clinic', '/analytics/clinic?period=30d'),
      merchantGet(request, clinicSession.session_id, 'clinic', '/analytics/clinic?period=custom&date_from=2026-03-01&date_to=2026-03-28'),
      merchantGet(request, clinicSession.session_id, 'clinic', '/analytics/clinic?period=custom&date_from=2026-01-01&date_to=2026-05-01'),
      merchantGet(request, shopSession.session_id, 'clinic', '/analytics/clinic?period=30d'),
    ])

    expect(clinic30d.ok()).toBeTruthy()
    expect(clinicLegalCustom.ok()).toBeTruthy()
    expect(clinicIllegalCustom.status(), 'custom range > 90 days must be blocked').toBe(400)
    expect((clinic30d.headers()['cache-control'] ?? '')).toContain('max-age=300')

    const clinicBody = await clinic30d.json()
    const clinicData = clinicBody.data ?? clinicBody

    expect(clinicData.summary).toEqual(
      expect.objectContaining({
        total_visits: expect.any(Number),
        revisit_rate_30d: expect.any(Number),
        prescription_rate: expect.any(Number),
      }),
    )
    expect(
      clinicData.summary.avg_visit_duration_min === null || typeof clinicData.summary.avg_visit_duration_min === 'number',
    ).toBeTruthy()
    expect(clinicData.doctor_workload).toEqual(expect.any(Array))
    if (clinicData.doctor_workload.length > 0) {
      expect(clinicData.doctor_workload[0]).toEqual(expect.objectContaining({ doctor_name: expect.any(String) }))
    }
    for (const row of clinicData.appointment_attendance as ClinicAnalyticsDTO['appointment_attendance']) {
      expect(row.rate).toBeGreaterThanOrEqual(0)
      expect(row.rate).toBeLessThanOrEqual(1)
      expect(row.checked_in).toBeLessThanOrEqual(row.confirmed)
    }

    expect([200, 403, 404]).toContain(shopCrossTenant.status())
    if (shopCrossTenant.ok()) {
      const crossTenantBody = await shopCrossTenant.json()
      expect((crossTenantBody.data ?? crossTenantBody).summary.total_visits).not.toBe(clinicData.summary.total_visits)
    }
  })
})
