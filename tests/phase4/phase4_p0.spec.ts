import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { expect, Locator, Page, APIRequestContext, test } from '@playwright/test'

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
    businessType: 'shop',
  },
  clinicManager: {
    email: 'admin@pawsclinic.com',
    tenantName: 'Paws Clinic',
    businessType: 'clinic',
  },
} as const

const HAPPY_PAWS_ORDER_PREFIX = /#1\d+/

function getPassword() {
  expect(TEST_PASSWORD, 'TEST_PASSWORD must be set for Phase 4 Playwright tests').toBeTruthy()
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
  const response = await request.post(`${BACKEND_BASE_URL}/merchant/auth/login`, {
    data: { email, password: getPassword() },
  })

  expect(response.ok(), `Login failed for ${email}: ${response.status()}`).toBeTruthy()
  return response.json() as Promise<{
    session_id: string
    expires_at: string
  }>
}

async function loginAs(page: Page, email: string) {
  await preparePage(page)
  await page.context().clearCookies()

  const session = await apiLogin(page.request, email)

  await page.context().addCookies([{
    name: 'session_id',
    value: session.session_id,
    domain: 'localhost',
    path: '/',
    expires: Math.floor(new Date(session.expires_at).getTime() / 1000),
    sameSite: 'Lax',
    httpOnly: false,
  }])

  return session
}

async function merchantGet(
  request: APIRequestContext,
  sessionId: string,
  businessType: 'shop' | 'clinic',
  endpoint: string,
) {
  return request.get(`http://localhost:3000/api/merchant${endpoint}`, {
    headers: {
      'X-Session-ID': sessionId,
      'X-Business-Type': businessType,
    },
  })
}

async function openShopOrders(page: Page) {
  await page.goto('/merchant/shop/orders')
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible()
}

async function openFirstOrderByStatus(page: Page, tabLabel: string, statusLabel: string): Promise<Locator> {
  await openShopOrders(page)
  await page.getByRole('button', { name: tabLabel, exact: true }).click()

  const row = page
    .getByRole('button')
    .filter({ hasText: HAPPY_PAWS_ORDER_PREFIX })
    .filter({ hasText: statusLabel })
    .first()

  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByRole('heading', { name: '订单详情' })).toBeVisible()

  return row
}

function buildSyncStatusEnvelope(scope: 'shop' | 'clinic') {
  return {
    code: 0,
    message: 'ok',
    data: {
      scope,
      generated_at: '2026-03-26T15:30:00Z',
      orders: {
        last_synced_at: '2026-03-26T15:28:10Z',
        pending_count: scope === 'shop' ? 2 : 0,
        failed_count: scope === 'shop' ? 1 : 0,
        dead_letter_count: 0,
        last_event_at: '2026-03-26T15:27:42Z',
      },
      appointments: {
        last_synced_at: scope === 'clinic' ? '2026-03-26T15:24:10Z' : null,
        pending_count: scope === 'clinic' ? 1 : 0,
        failed_count: 0,
        dead_letter_count: 0,
        last_event_at: scope === 'clinic' ? '2026-03-26T15:23:42Z' : null,
      },
      medical_records: {
        last_synced_at: scope === 'clinic' ? '2026-03-26T15:18:10Z' : null,
        pending_count: scope === 'clinic' ? 2 : 0,
        failed_count: scope === 'clinic' ? 1 : 0,
        dead_letter_count: scope === 'clinic' ? 1 : 0,
        last_event_at: scope === 'clinic' ? '2026-03-26T15:17:42Z' : null,
      },
      push: {
        notifications_sent_today: scope === 'shop' ? 7 : 4,
        last_success_at: '2026-03-26T15:28:10Z',
        consecutive_failures: scope === 'shop' ? 0 : 1,
        consumer_status: scope === 'shop' ? 'healthy' : 'degraded',
      },
      api_key: {
        masked: 'pw_live_••••••••••••4f2a',
        last4: '4f2a',
        rotated_at: '2026-03-01T00:00:00Z',
      },
      polling: {
        recommended_interval_seconds: 60,
        pending_tasks_interval_seconds: 30,
      },
    },
  }
}

function buildPendingTasksEnvelope(scope: 'shop' | 'clinic', tasks: Array<Record<string, unknown>>, cursor = '') {
  return {
    code: 0,
    message: 'ok',
    data: {
      scope,
      cursor,
      server_time: '2026-03-26T15:30:00Z',
      tasks,
      count: tasks.length,
      unread_like_count: tasks.length,
      recommended_poll_interval_seconds: 30,
    },
  }
}

function setDocumentVisibility(page: Page, hidden: boolean) {
  return page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => isHidden,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

test.describe('Phase 4 P0 API, isolation, polling and state machine coverage', () => {
  test('sync status API returns tenant-scoped envelopes for shop and clinic views', async ({ request }) => {
    const shopSession = await apiLogin(request, USERS.shopOwner.email)
    const clinicSession = await apiLogin(request, USERS.clinicManager.email)

    const [shopResponse, clinicResponse] = await Promise.all([
      merchantGet(request, shopSession.session_id, 'shop', '/sync/status'),
      merchantGet(request, clinicSession.session_id, 'clinic', '/sync/status'),
    ])

    expect(shopResponse.ok()).toBeTruthy()
    expect(clinicResponse.ok()).toBeTruthy()

    const shopBody = await shopResponse.json()
    const clinicBody = await clinicResponse.json()

    expect(shopBody.code).toBe(0)
    expect(shopBody.message).toBe('ok')
    expect(shopBody.data.scope).toBe('shop')
    expect(shopBody.data.orders.pending_count).toBeGreaterThanOrEqual(0)
    expect(shopBody.data.orders.last_event_at).toBeTruthy()
    expect(shopBody.data.appointments.pending_count).toBe(0)
    expect(shopBody.data.polling.pending_tasks_interval_seconds).toBe(30)
    expect(shopBody.data.push.consumer_status).toMatch(/healthy|degraded|down/)

    expect(clinicBody.code).toBe(0)
    expect(clinicBody.message).toBe('ok')
    expect(clinicBody.data.scope).toBe('clinic')
    expect(clinicBody.data.appointments.pending_count).toBeGreaterThanOrEqual(0)
    expect(clinicBody.data.medical_records.failed_count).toBeGreaterThanOrEqual(0)
    expect(clinicBody.data.orders.pending_count).toBe(0)
    expect(clinicBody.data.polling.recommended_interval_seconds).toBe(60)
  })

  test('pending tasks API respects scope, cursor and tenant isolation boundaries', async ({ request }) => {
    const shopSession = await apiLogin(request, USERS.shopOwner.email)
    const clinicSession = await apiLogin(request, USERS.clinicManager.email)

    const shopResponse = await merchantGet(request, shopSession.session_id, 'shop', '/pending-tasks?limit=5')
    const clinicResponse = await merchantGet(request, clinicSession.session_id, 'clinic', '/pending-tasks?limit=5')

    expect(shopResponse.ok()).toBeTruthy()
    expect(clinicResponse.ok()).toBeTruthy()

    const shopBody = await shopResponse.json()
    const clinicBody = await clinicResponse.json()

    expect(shopBody.code).toBe(0)
    expect(shopBody.data.scope).toBe('shop')
    expect(shopBody.data.count).toBeLessThanOrEqual(5)
    for (const task of shopBody.data.tasks as Array<{ action_href: string | null; entity_type: string }>) {
      expect(task.action_href ?? '/merchant/shop').toMatch(/^\/merchant\/(shop|$)/)
      expect(task.entity_type).not.toBe('appointment')
    }

    expect(clinicBody.code).toBe(0)
    expect(clinicBody.data.scope).toBe('clinic')
    expect(clinicBody.data.count).toBeLessThanOrEqual(5)
    for (const task of clinicBody.data.tasks as Array<{ action_href: string | null; entity_type: string }>) {
      expect(task.action_href ?? '/merchant/clinic').toMatch(/^\/merchant\/(clinic|$)/)
      expect(task.entity_type).not.toBe('order')
    }

    if (shopBody.data.cursor) {
      const nextPage = await merchantGet(
        request,
        shopSession.session_id,
        'shop',
        `/pending-tasks?limit=5&cursor=${encodeURIComponent(shopBody.data.cursor)}`,
      )

      expect(nextPage.ok()).toBeTruthy()
      const nextPageBody = await nextPage.json()
      expect(nextPageBody.code).toBe(0)
      expect(nextPageBody.data.scope).toBe('shop')
    }
  })

  test('shop and clinic dashboards stay tenant-isolated and keep screenshot baselines', async ({ browser }) => {
    const shopContext = await browser.newContext({
      baseURL: 'http://localhost:3000',
      viewport: { width: 1440, height: 900 },
    })
    const clinicContext = await browser.newContext({
      baseURL: 'http://localhost:3000',
      viewport: { width: 1440, height: 900 },
    })

    const shopPage = await shopContext.newPage()
    const clinicPage = await clinicContext.newPage()

    await loginAs(shopPage, USERS.shopOwner.email)
    await loginAs(clinicPage, USERS.clinicManager.email)

    await shopPage.route('**/api/merchant/sync/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSyncStatusEnvelope('shop')),
      })
    })
    await clinicPage.route('**/api/merchant/sync/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSyncStatusEnvelope('clinic')),
      })
    })

    await shopPage.goto('/merchant/shop/dashboard')
    await expect(shopPage.getByRole('heading', { name: 'Shop Dashboard' })).toBeVisible({ timeout: 15_000 })
    await expect(shopPage.getByText(USERS.shopOwner.tenantName)).toBeVisible()
    await expect(shopPage.getByText(USERS.clinicManager.tenantName)).toHaveCount(0)
    await expect(shopPage.getByText('App 同步状态')).toBeVisible()
    await expect(shopPage.getByText('pw_live_••••••••••••4f2a')).toBeVisible()
    await expect(shopPage).toHaveScreenshot('phase4-shop-dashboard.png', { fullPage: true })

    await clinicPage.goto('/merchant/clinic/dashboard')
    await expect(clinicPage.getByRole('heading', { name: 'Clinic Dashboard' })).toBeVisible({ timeout: 15_000 })
    await expect(clinicPage.getByText(USERS.clinicManager.tenantName)).toBeVisible()
    await expect(clinicPage.getByText(USERS.shopOwner.tenantName)).toHaveCount(0)
    await expect(clinicPage.getByText('App 同步状态')).toBeVisible()
    await expect(clinicPage.getByText('病历')).toBeVisible()
    await expect(clinicPage).toHaveScreenshot('phase4-clinic-dashboard.png', { fullPage: true })

    await shopContext.close()
    await clinicContext.close()
  })

  test('layout polling shows deduped toasts and refetches when page becomes visible again', async ({ page }) => {
    await loginAs(page, USERS.shopOwner.email)

    const requestLog: string[] = []
    const duplicateTask = {
      id: 'task_145',
      queue_id: 145,
      task_type: 'new_order',
      entity_type: 'order',
      entity_id: '10045',
      entity_no: '#10045',
      title: '新订单 #10045',
      summary: '订单 #10045 待处理',
      toast_variant: 'new_order',
      priority: 'high',
      action_label: '查看',
      action_href: '/merchant/shop/orders?selected=10045',
      requires_ack: false,
      created_at: '2026-03-26T15:29:10Z',
      occurred_at: '2026-03-26T15:29:08Z',
      dedupe_key: 'order_10045_status_changed_1774510148',
      payload: {
        status: 'paid',
        pet_name: 'Buddy',
      },
    }
    const followupTask = {
      id: 'task_146',
      queue_id: 146,
      task_type: 'medical_record_pushed',
      entity_type: 'medical_record',
      entity_id: '501',
      entity_no: null,
      title: '病历同步恢复',
      summary: '病历 501 已成功推送到 App',
      toast_variant: 'medical_record_pushed',
      priority: 'low',
      action_label: '查看',
      action_href: '/merchant/clinic/visits/501',
      requires_ack: false,
      created_at: '2026-03-26T15:30:10Z',
      occurred_at: '2026-03-26T15:30:08Z',
      dedupe_key: 'medical_record_501_record_published_1774510208',
      payload: {
        status: 'sent',
      },
    }

    let pollCount = 0
    await page.route('**/api/merchant/pending-tasks*', async (route) => {
      requestLog.push(route.request().url())
      pollCount += 1

      const body = pollCount <= 3
        ? buildPendingTasksEnvelope('shop', [duplicateTask], '2026-03-26T15:30:00Z_145')
        : buildPendingTasksEnvelope('shop', [followupTask], '2026-03-26T15:31:00Z_146')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    })

    await page.goto('/merchant/dashboard')
    const notifications = page.getByLabel('Notifications')

    await expect(notifications).toBeVisible({ timeout: 15_000 })
    await expect(notifications.getByText('新订单 #10045')).toBeVisible()
    await expect(notifications.getByText('订单 #10045 待处理')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()

    await setDocumentVisibility(page, true)
    await setDocumentVisibility(page, false)

    await expect.poll(() => requestLog.length).toBeGreaterThanOrEqual(4)
    await expect(notifications.getByText('新订单 #10045')).toHaveCount(1)
    await expect(notifications.getByText('病历同步恢复')).toBeVisible()
    await expect(page).toHaveScreenshot('phase4-toast-polling.png', { fullPage: true })
  })

  test('order state machine allows paid → preparing and blocks completed → preparing', async ({ page }) => {
    await loginAs(page, USERS.shopOwner.email)

    await openFirstOrderByStatus(page, '已付款', '已付款')
    await expect(page.getByRole('button', { name: '确认备货' })).toBeVisible()
    await page.getByRole('button', { name: '确认备货' }).click()
    await expect(page.getByText('备货中')).toBeVisible()
    await expect(page.getByRole('button', { name: '确认备货' })).toHaveCount(0)
    await expect(page).toHaveScreenshot('phase4-order-legal-transition.png', { fullPage: true })

    await openFirstOrderByStatus(page, '已完成', '已完成')
    await expect(page.getByRole('button', { name: '确认备货' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '取消订单' })).toHaveCount(0)
    await expect(page).toHaveScreenshot('phase4-order-illegal-transition-blocked.png', { fullPage: true })
  })

  test('idempotency table exists in backend SQLite schema', async () => {
    const dbPath = path.join(process.cwd(), 'backend', 'petwell.db')
    test.skip(!existsSync(dbPath), `SQLite DB not found at ${dbPath}`)

    let sqliteAvailable = true
    try {
      execFileSync('sqlite3', ['-version'], { encoding: 'utf8' })
    } catch {
      sqliteAvailable = false
    }

    test.skip(!sqliteAvailable, 'sqlite3 CLI is unavailable; validate via docs/phase4_supabase_checklist.md instead')

    const tableName = execFileSync('sqlite3', [dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_keys';"], {
      encoding: 'utf8',
    }).trim()

    expect(tableName).toBe('idempotency_keys')
  })
})
