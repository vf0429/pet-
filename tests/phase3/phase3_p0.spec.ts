import { expect, Locator, Page, test } from '@playwright/test'

test.use({
  baseURL: 'http://localhost:3000',
  viewport: { width: 1440, height: 900 },
})

test.describe.configure({ mode: 'serial' })

const TEST_PASSWORD = process.env.TEST_PASSWORD

const USERS = {
  owner: 'owner@happypaws.com',
  clinicManager: 'admin@pawsclinic.com',
} as const

const HAPPY_PAWS_ORDER_PREFIX = /#1\d+/

function getPassword() {
  expect(TEST_PASSWORD, 'TEST_PASSWORD must be set for Phase 3 Playwright tests').toBeTruthy()
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

async function loginAs(page: Page, email: string) {
  // Clear any existing session cookie so we always start fresh
  await page.context().clearCookies()

  // Call the backend login API directly (bypass UI form — avoids middleware-redirect race conditions)
  const res = await page.request.post('http://localhost:8080/v1/merchant/auth/login', {
    data: { email, password: getPassword() },
  })
  expect(res.ok(), `Login failed for ${email}: ${res.status()}`).toBeTruthy()
  const body = await res.json()

  // Inject the session cookie so the Next.js middleware and apiFetch both see it
  await page.context().addCookies([{
    name: 'session_id',
    value: body.session_id,
    domain: 'localhost',
    path: '/',
    expires: Math.floor(new Date(body.expires_at).getTime() / 1000),
    sameSite: 'Lax',
    httpOnly: false,
  }])
}

async function openShopOrders(page: Page) {
  await page.goto('/merchant/shop/orders')
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible()
  await expect(page.getByRole('button').filter({ hasText: HAPPY_PAWS_ORDER_PREFIX }).first()).toBeVisible()
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

async function expectForbiddenPage(page: Page) {
  // 业务域检查可能跳转到 /merchant/403 或 /login（取决于前端中间件实现）
  await page.waitForURL(/\/(merchant\/403|login)/)
  const url = page.url()
  if (url.includes('/merchant/403')) {
    await expect(page.getByRole('heading', { name: '403' })).toBeVisible()
  } else {
    // 重定向到 login 也说明无权访问 shop，隔离测试通过
    await expect(page).toHaveURL(/\/login/)
  }
}

test.describe('Phase 3 P0 shop workspace and access control', () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page)
  })

  test('Shop Dashboard 渲染测试', async ({ page }) => {
    await loginAs(page, USERS.owner)
    await page.goto('/merchant/shop/dashboard')

    // heading always renders; KPI cards only render once isLoadingStats resolves
    await expect(page.getByRole('heading', { name: 'Shop Dashboard' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('今日订单')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('今日营收')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('待发货')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('低库存').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '近期订单' })).toBeVisible()

  })

  test('订单列表渲染测试', async ({ page }) => {
    await loginAs(page, USERS.owner)
    await openShopOrders(page)

    await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '待付款', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '已付款', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '备货中', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '配送中', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '已取消', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('搜索订单号或客户名...')).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: HAPPY_PAWS_ORDER_PREFIX }).first()).toBeVisible()

  })

  test('订单状态流转测试（合法：paid → preparing）', async ({ page }) => {
    await loginAs(page, USERS.owner)
    await openFirstOrderByStatus(page, '已付款', '已付款')

    await expect(page.getByRole('button', { name: '确认备货' })).toBeVisible()
    await page.getByRole('button', { name: '确认备货' }).click()

    await expect(page.getByText('备货中')).toBeVisible()
    await expect(page.getByRole('button', { name: '确认备货' })).toHaveCount(0)

  })

  test('订单状态流转测试（非法：completed → preparing）', async ({ page }) => {
    await loginAs(page, USERS.owner)
    await openFirstOrderByStatus(page, '已完成', '已完成')

    await expect(page.getByRole('button', { name: '确认备货' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '取消订单' })).toHaveCount(0)
  })

  test('订单取消测试（需填原因）', async ({ page }) => {
    await loginAs(page, USERS.owner)
    await openFirstOrderByStatus(page, '待付款', '待付款')

    await expect(page.getByRole('button', { name: '取消订单' })).toBeVisible()
    await page.getByRole('button', { name: '取消订单' }).click()

    const cancelReasonInput = page.getByPlaceholder('请输入取消原因...')
    await expect(cancelReasonInput).toBeVisible()
    await cancelReasonInput.fill('customer changed mind during checkout review')
    await page.getByRole('button', { name: '确认取消' }).click()

    await expect(page.getByText('已取消')).toBeVisible()
    await expect(page.getByText('customer changed mind during checkout review')).toBeVisible()

  })

  test('商品列表渲染测试', async ({ page }) => {
    await loginAs(page, USERS.owner)
    await page.goto('/merchant/shop/products')

    await expect(page).toHaveURL(/\/merchant\/shop\/products/)
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()
    await expect(page.getByRole('button', { name: '仅显示低库存' })).toBeVisible()
    await expect(page.getByPlaceholder('搜索商品名称或 SKU...')).toBeVisible()
    await expect(page.getByText(/^SKU:/).first()).toBeVisible()
    await expect(page.getByText('低库存').first()).toBeVisible()

  })

  test('Clinic 账号无法访问 Shop 页面', async ({ page }) => {
    await loginAs(page, USERS.clinicManager)
    await page.goto('/merchant/shop/orders')

    await expectForbiddenPage(page)

  })
})
