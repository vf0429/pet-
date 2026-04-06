import { expect, type APIRequestContext, type Locator, type Page, test } from '@playwright/test'

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

type ShopOrderStatus = 'pending' | 'paid' | 'preparing' | 'shipped' | 'completed' | 'cancelled'

type TransitionProbe = {
  sourceStatus: ShopOrderStatus
  targetStatus: 'preparing' | 'shipped' | 'completed' | 'cancelled'
  requestData: Record<string, unknown>
}

type LegalTransitionScenario = {
  sourceStatus: ShopOrderStatus
  expectedAction: 'prepare' | 'ship' | 'complete' | 'cancel'
  buttonLabel: string
  expectedStatusLabel: string
  requestData?: Record<string, unknown>
}

type ShopOrderListItem = {
  id: number
  order_no: string
  status: ShopOrderStatus
}

type ShopOrderDetail = {
  id: number
  order_no: string
  status: ShopOrderStatus
  available_actions?: Array<'prepare' | 'ship' | 'complete' | 'cancel'>
}

function getPassword() {
  expect(TEST_PASSWORD, 'TEST_PASSWORD must be set for Phase 4B Playwright tests').toBeTruthy()
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

async function merchantPatch(
  request: APIRequestContext,
  sessionId: string,
  businessType: BusinessType,
  endpoint: string,
  data: Record<string, unknown>,
) {
  return request.patch(`${BACKEND_BASE_URL}/v1/merchant${endpoint}`, {
    headers: {
      'X-Session-ID': sessionId,
      'X-Business-Type': businessType,
    },
    data,
  })
}

async function listShopOrdersByStatus(
  request: APIRequestContext,
  sessionId: string,
  status: ShopOrderStatus,
  perPage: number = 10,
) {
  const response = await merchantGet(
    request,
    sessionId,
    'shop',
    `/shop/orders?status=${status}&page=1&per_page=${perPage}`,
  )

  expect(response.ok(), `Failed to load shop orders with status=${status}`).toBeTruthy()

  const body = await response.json()
  return (body.data.orders ?? []) as ShopOrderListItem[]
}

async function getShopOrderDetail(
  request: APIRequestContext,
  sessionId: string,
  orderId: number,
) {
  const response = await merchantGet(request, sessionId, 'shop', `/shop/orders/${orderId}`)
  expect(response.ok(), `Failed to load shop order detail ${orderId}`).toBeTruthy()

  const body = await response.json()
  return body.data as ShopOrderDetail
}

async function findOrderForQueueProbe(
  request: APIRequestContext,
  sessionId: string,
) {
  const probes: TransitionProbe[] = [
    {
      sourceStatus: 'paid',
      targetStatus: 'preparing',
      requestData: { target_status: 'preparing' },
    },
    {
      sourceStatus: 'preparing',
      targetStatus: 'shipped',
      requestData: {
        target_status: 'shipped',
        tracking_number: `PW-E2E-${Date.now()}`,
      },
    },
    {
      sourceStatus: 'shipped',
      targetStatus: 'completed',
      requestData: { target_status: 'completed' },
    },
    {
      sourceStatus: 'pending',
      targetStatus: 'cancelled',
      requestData: {
        target_status: 'cancelled',
        cancel_reason: 'phase4 p0 stability probe',
      },
    },
  ]

  for (const probe of probes) {
    const orders = await listShopOrdersByStatus(request, sessionId, probe.sourceStatus)
    if (orders.length === 0) continue

    return {
      order: orders[0],
      probe,
    }
  }

  throw new Error('No transitionable shop order found for queue probe')
}

async function findShopOrderWithAction(
  request: APIRequestContext,
  sessionId: string,
  status: ShopOrderStatus,
  expectedAction: 'prepare' | 'ship' | 'complete' | 'cancel',
) {
  const orders = await listShopOrdersByStatus(request, sessionId, status)

  for (const order of orders) {
    const detail = await getShopOrderDetail(request, sessionId, order.id)
    if (detail.available_actions?.includes(expectedAction)) {
      return detail
    }
  }

  return null
}

async function findLegalTransitionScenario(
  request: APIRequestContext,
  sessionId: string,
) {
  const scenarios: LegalTransitionScenario[] = [
    {
      sourceStatus: 'paid',
      expectedAction: 'prepare',
      buttonLabel: '确认备货',
      expectedStatusLabel: '备货中',
    },
    {
      sourceStatus: 'preparing',
      expectedAction: 'ship',
      buttonLabel: '确认发货',
      expectedStatusLabel: '配送中',
      requestData: { tracking_number: `PW-E2E-${Date.now()}` },
    },
    {
      sourceStatus: 'shipped',
      expectedAction: 'complete',
      buttonLabel: '确认完成',
      expectedStatusLabel: '已完成',
    },
    {
      sourceStatus: 'pending',
      expectedAction: 'cancel',
      buttonLabel: '取消订单',
      expectedStatusLabel: '已取消',
      requestData: { cancel_reason: 'phase4 p0 legal transition probe' },
    },
    {
      sourceStatus: 'paid',
      expectedAction: 'cancel',
      buttonLabel: '取消订单',
      expectedStatusLabel: '已取消',
      requestData: { cancel_reason: 'phase4 p0 legal transition probe' },
    },
  ]

  for (const scenario of scenarios) {
    const detail = await findShopOrderWithAction(request, sessionId, scenario.sourceStatus, scenario.expectedAction)
    if (detail) {
      return { order: detail, scenario }
    }
  }

  throw new Error('No shop order exposing any legal merchant action for UI transition coverage')
}

async function findTerminalShopOrder(
  request: APIRequestContext,
  sessionId: string,
) {
  for (const status of ['completed', 'cancelled'] as const) {
    const orders = await listShopOrdersByStatus(request, sessionId, status)
    if (orders.length > 0) {
      return orders[0]
    }
  }

  throw new Error('No terminal shop order found for illegal-transition coverage')
}

function getTopBarSubtitle(page: Page, tenantName: string, businessType: BusinessType) {
  return page.getByText(`${tenantName} · ${businessType} view`, { exact: true })
}

function getSidebarTenantLabel(page: Page, tenantName: string) {
  return page.locator('aside').getByText(tenantName, { exact: true })
}

function getSyncStatusCard(page: Page) {
  return page.locator('div.rounded-2xl').filter({
    has: page.getByRole('heading', { name: 'App 同步状态', exact: true }),
  }).first()
}

async function openOrderDrawerByNo(page: Page, orderNo: string) {
  await openShopOrders(page)
  await page.getByPlaceholder('搜索订单号或客户名...').fill(orderNo)

  const row = page.getByRole('button').filter({ hasText: orderNo }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.getByRole('heading', { name: '订单详情' })).toBeVisible()
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
    .filter({ hasText: /#1\d+/ })
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
      generated_at: '2026-03-27T12:00:00Z',
      orders: {
        pending_count: scope === 'shop' ? 2 : 0,
        failed_count: scope === 'shop' ? 1 : 0,
        dead_letter_count: scope === 'shop' ? 0 : 0,
        last_synced_at: scope === 'shop' ? '2026-03-27T11:58:00Z' : null,
      },
      appointments: {
        pending_count: scope === 'clinic' ? 1 : 0,
        failed_count: 0,
        dead_letter_count: 0,
        last_synced_at: scope === 'clinic' ? '2026-03-27T11:57:00Z' : null,
      },
      medical_records: {
        pending_count: scope === 'clinic' ? 1 : 0,
        failed_count: scope === 'clinic' ? 1 : 0,
        dead_letter_count: scope === 'clinic' ? 1 : 0,
        last_synced_at: scope === 'clinic' ? '2026-03-27T11:55:00Z' : null,
      },
      push: {
        consumer_status: scope === 'shop' ? 'healthy' : 'degraded',
        notifications_sent_today: scope === 'shop' ? 6 : 4,
        last_success_at: '2026-03-27T11:59:00Z',
      },
      api_key: {
        masked: scope === 'shop' ? 'pk_app_••••shop' : 'pk_app_••••clinic',
      },
    },
  }
}

function buildPendingTasksEnvelope(tasks: Array<Record<string, unknown>>, cursor: string | null = null) {
  return {
    code: 0,
    message: 'ok',
    data: {
      tasks,
      cursor,
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

test.describe('Phase 4B P0 validation assets', () => {
  test('P0 API contract covers sync/status, pending-tasks and tenant isolation', async ({ request }) => {
    const shopSession = await apiLogin(request, USERS.shopOwner.email)
    const clinicSession = await apiLogin(request, USERS.clinicManager.email)

    const { order: probeOrder, probe } = await findOrderForQueueProbe(request, shopSession.session_id)

    const transitionResponse = await merchantPatch(
      request,
      shopSession.session_id,
      'shop',
      `/shop/orders/${probeOrder.id}/status`,
      probe.requestData,
    )
    expect(transitionResponse.ok()).toBeTruthy()
    const transitionBody = await transitionResponse.json()
    expect(transitionBody).toMatchObject({
      code: 0,
      message: 'ok',
      data: {
        id: probeOrder.id,
        previous_status: probe.sourceStatus,
        current_status: probe.targetStatus,
        sync_queue: {
          entity_type: 'order',
          entity_id: String(probeOrder.id),
          action: 'status_changed',
          status: 'pending',
        },
      },
    })

    const [shopSyncResponse, clinicSyncResponse, shopPendingResponse, clinicPendingResponse] = await Promise.all([
      merchantGet(request, shopSession.session_id, 'shop', '/sync/status'),
      merchantGet(request, clinicSession.session_id, 'clinic', '/sync/status'),
      merchantGet(request, shopSession.session_id, 'shop', '/pending-tasks'),
      merchantGet(request, clinicSession.session_id, 'clinic', '/pending-tasks'),
    ])

    expect(shopSyncResponse.ok()).toBeTruthy()
    expect(clinicSyncResponse.ok()).toBeTruthy()
    expect(shopPendingResponse.ok()).toBeTruthy()
    expect(clinicPendingResponse.ok()).toBeTruthy()

    const shopSync = await shopSyncResponse.json()
    const clinicSync = await clinicSyncResponse.json()
    const shopPending = await shopPendingResponse.json()
    const clinicPending = await clinicPendingResponse.json()

    expect(shopSync).toMatchObject({ code: 0, message: 'ok' })
    expect(shopSync.data).toEqual(
      expect.objectContaining({
        orders: expect.any(Object),
        appointments: expect.any(Object),
        notifications_sent_today: expect.any(Number),
        dead_letter_count: expect.any(Number),
      }),
    )
    expect(clinicSync).toMatchObject({ code: 0, message: 'ok' })

    expect(shopPending).toMatchObject({ code: 0, message: 'ok' })
    expect(shopPending.data.tasks).toEqual(expect.any(Array))
    expect(shopPending.data.count).toBe(shopPending.data.tasks.length)
    if (shopPending.data.tasks.length > 0) {
      expect(shopPending.data.tasks[0]).toEqual(
        expect.objectContaining({
          type: expect.any(String),
          entity_id: expect.any(String),
          payload: expect.any(String),
          created_at: expect.any(String),
        }),
      )
    }

    expect(clinicPending).toMatchObject({ code: 0, message: 'ok' })
    expect(clinicPending.data.tasks).toEqual(expect.any(Array))

    const changedOrderId = String(probeOrder.id)
    const shopTaskEntityIds = (shopPending.data.tasks as Array<{ entity_id: string }>).map((task) => task.entity_id)
    const clinicTaskEntityIds = (clinicPending.data.tasks as Array<{ entity_id: string }>).map((task) => task.entity_id)

    expect(shopTaskEntityIds).toContain(changedOrderId)
    expect(clinicTaskEntityIds).not.toContain(changedOrderId)

  const tenant2AccessResponse = await merchantGet(
      request,
      clinicSession.session_id,
      'shop',
      `/shop/orders/${probeOrder.id}`,
    )
    expect([403, 404]).toContain(tenant2AccessResponse.status())
  })

  test('dashboard sync card requests are tenant-scoped and key pages keep screenshot baselines', async ({ browser }, testInfo) => {
    const shopHeaders: string[] = []
    const clinicHeaders: string[] = []

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

    await shopPage.route('**/api/v1/merchant/sync/status', async (route) => {
      shopHeaders.push(route.request().headers()['x-business-type'] ?? '')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSyncStatusEnvelope('shop')),
      })
    })
    await shopPage.route('**/api/v1/merchant/pending-tasks*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPendingTasksEnvelope([])),
      })
    })

    await clinicPage.route('**/api/v1/merchant/sync/status', async (route) => {
      clinicHeaders.push(route.request().headers()['x-business-type'] ?? '')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSyncStatusEnvelope('clinic')),
      })
    })
    await clinicPage.route('**/api/v1/merchant/pending-tasks*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPendingTasksEnvelope([])),
      })
    })

    await shopPage.goto('/merchant/shop/dashboard')
    await expect(shopPage.getByRole('heading', { name: 'Shop Dashboard' })).toBeVisible({ timeout: 15_000 })
    await expect(shopPage.getByText(USERS.shopOwner.tenantName, { exact: true }).first()).toBeVisible()
    await expect(getSidebarTenantLabel(shopPage, USERS.shopOwner.tenantName)).toBeVisible()
    await expect(getSidebarTenantLabel(shopPage, USERS.clinicManager.tenantName)).toHaveCount(0)
    await expect(getSyncStatusCard(shopPage).getByRole('heading', { name: 'App 同步状态', exact: true })).toBeVisible()
    await expect(getSyncStatusCard(shopPage).getByText('pk_app_••••shop', { exact: true })).toBeVisible()
    await shopPage.screenshot({ path: testInfo.outputPath('phase4b-shop-dashboard-sync-status.png'), fullPage: true })

    await clinicPage.goto('/merchant/clinic/dashboard')
    await expect(clinicPage.getByRole('heading', { name: 'Clinic Dashboard' })).toBeVisible({ timeout: 15_000 })
    await expect(getSidebarTenantLabel(clinicPage, USERS.shopOwner.tenantName)).toHaveCount(0)
    await clinicPage.screenshot({ path: testInfo.outputPath('phase4b-clinic-dashboard-sync-status.png'), fullPage: true })

    expect(shopHeaders, 'Shop dashboard must call sync/status with X-Business-Type=shop').toContain('shop')
    expect(clinicHeaders, 'Clinic dashboard must call sync/status with X-Business-Type=clinic').toContain('clinic')

    await shopContext.close()
    await clinicContext.close()
  })

  test('toast polling dedupes duplicate tasks, refreshes on visibility restore and keeps toast screenshot baseline', async ({ page }, testInfo) => {
    await loginAs(page, USERS.shopOwner.email)

    const pendingTaskHeaders: string[] = []
    let pollCount = 0

    const duplicateTask = {
      type: 'new_order',
      entity_id: '10045',
      payload: JSON.stringify({ order_no: '#10045' }),
      created_at: '2026-03-27T12:00:10Z',
    }
    const newTask = {
      type: 'medical_record_pushed',
      entity_id: '501',
      payload: JSON.stringify({ pet_name: 'Mochi' }),
      created_at: '2026-03-27T12:01:10Z',
    }

    await page.route('**/api/v1/merchant/sync/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSyncStatusEnvelope('shop')),
      })
    })

    await page.route('**/api/v1/merchant/pending-tasks*', async (route) => {
      pendingTaskHeaders.push(route.request().headers()['x-business-type'] ?? '')
      pollCount += 1

      const body = pollCount <= 1
        ? buildPendingTasksEnvelope([duplicateTask], 'cursor-1')
        : buildPendingTasksEnvelope([newTask], 'cursor-2')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    })

    await page.goto('/merchant/shop/dashboard')

    const notifications = page.locator('div[aria-label="Notifications"]').last()
    await expect(notifications).toBeVisible({ timeout: 15_000 })
    await expect(notifications.getByText('新订单', { exact: true })).toBeVisible()
    await expect(notifications.getByText('订单 #10045 已创建', { exact: true })).toBeVisible()

    await setDocumentVisibility(page, true)
    await setDocumentVisibility(page, false)

    await expect.poll(() => pollCount).toBeGreaterThanOrEqual(2)
    await expect(notifications.getByText('新订单', { exact: true })).toHaveCount(1)
    await expect(notifications.getByText('病历已推送', { exact: true })).toBeVisible()
    await expect(notifications.getByText('宠物 Mochi 病历已推送至 App', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('phase4b-toast-polling-dedupe.png'), fullPage: true })

    expect(pendingTaskHeaders, 'Pending task polling must keep shop business header on shop dashboard').toContain('shop')
  })

  test('shop order state machine allows legal transition and blocks illegal transition', async ({ page }, testInfo) => {
    const shopSession = await loginAs(page, USERS.shopOwner.email)

    const { order: legalOrder, scenario } = await findLegalTransitionScenario(page.request, shopSession.session_id)
    const terminalOrder = await findTerminalShopOrder(page.request, shopSession.session_id)

    await openOrderDrawerByNo(page, legalOrder.order_no)
    const drawer = page.locator('div.fixed.inset-y-0.right-0.z-50').last()
    const actionButton = drawer.getByRole('button', { name: scenario.buttonLabel, exact: true })
    await expect(actionButton).toBeVisible()

    if (scenario.expectedAction === 'ship') {
      await drawer.getByPlaceholder('请输入物流单号').fill(String(scenario.requestData?.tracking_number ?? `PW-E2E-${Date.now()}`))
    }

    if (scenario.expectedAction === 'cancel') {
      await actionButton.click()
      await drawer.getByPlaceholder('请输入取消原因...').fill(String(scenario.requestData?.cancel_reason ?? 'phase4 p0 cancel probe'))
      await drawer.getByRole('button', { name: '确认取消', exact: true }).click()
    } else {
      await actionButton.click()
    }

    await expect(drawer.getByText(scenario.expectedStatusLabel, { exact: true }).first()).toBeVisible()
    await expect(drawer.getByRole('button', { name: scenario.buttonLabel, exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('phase4b-order-legal-transition.png'), fullPage: true })

    await openOrderDrawerByNo(page, terminalOrder.order_no)
    const terminalDrawer = page.locator('div.fixed.inset-y-0.right-0.z-50').last()
    await expect(terminalDrawer.getByRole('button', { name: '确认备货' })).toHaveCount(0)
    await expect(terminalDrawer.getByRole('button', { name: '取消订单' })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('phase4b-order-illegal-transition-blocked.png'), fullPage: true })
  })
})
