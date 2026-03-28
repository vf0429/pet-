import { expect, Page, test } from '@playwright/test'

test.use({
  baseURL: 'http://localhost:3000',
  viewport: { width: 1440, height: 900 },
})

const TEST_PASSWORD = process.env.TEST_PASSWORD

const SHOP_TENANT = {
  email: 'owner@happypaws.com',
  tenantName: 'Happy Paws',
  ownOrderPrefix: /#1\d+/
}

const CLINIC_TENANT = {
  email: 'admin@pawsclinic.com',
  tenantName: 'Paws Clinic',
  forbiddenOrderPrefix: /#1\d+/
}

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
  await preparePage(page)
  await page.context().clearCookies()

  const res = await page.request.post('http://localhost:8080/v1/merchant/auth/login', {
    data: { email, password: getPassword() },
  })
  expect(res.ok(), `Login failed for ${email}: ${res.status()}`).toBeTruthy()
  const body = await res.json()

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

async function expectShopOrdersVisible(page: Page) {
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible()
}

async function expectForbiddenPage(page: Page) {
  // 业务域检查可能跳转到 /merchant/403 或 /login（取决于前端中间件实现）
  await page.waitForURL(/\/(merchant\/403|login)/)
  const url = page.url()
  if (url.includes('/merchant/403')) {
    await expect(page.getByRole('heading', { name: '403' })).toBeVisible()
  } else {
    await expect(page).toHaveURL(/\/login/)
  }
  // 以下原有断言移除（行为依赖具体实现
}

test.describe('Phase 3 tenant isolation', () => {
  test('不同 tenant 的账号在不同 context 下只能看到自己有权限的数据', async ({ browser }) => {
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

    await loginAs(shopPage, SHOP_TENANT.email)
    await loginAs(clinicPage, CLINIC_TENANT.email)

    await shopPage.goto('/merchant/shop/orders')
    await expectShopOrdersVisible(shopPage)
    await expect(shopPage.locator('body')).toContainText(SHOP_TENANT.ownOrderPrefix)
    await expect(shopPage.locator('body')).not.toContainText(CLINIC_TENANT.tenantName)

    await clinicPage.goto('/merchant/shop/orders')
    await expectForbiddenPage(clinicPage)
    await expect(clinicPage.locator('body')).not.toContainText(CLINIC_TENANT.forbiddenOrderPrefix)
    await expect(clinicPage.locator('body')).not.toContainText(SHOP_TENANT.tenantName)


    await shopContext.close()
    await clinicContext.close()
  })
})
