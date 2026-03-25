import { expect, Page, test } from '@playwright/test'

test.use({
  baseURL: 'http://localhost:3000',
  viewport: { width: 1440, height: 900 },
})

const TEST_PASSWORD = process.env.TEST_PASSWORD

const USERS = {
  owner: {
    email: 'owner@happypaws.com',
    name: 'Happy Paws Owner',
    tenantName: 'Happy Paws',
    role: 'owner',
  },
  clinicManager: {
    email: 'admin@pawsclinic.com',
    name: 'Paws Clinic Manager',
    tenantName: 'Paws Clinic',
    role: 'manager',
  },
} as const

function getPassword() {
  expect(TEST_PASSWORD, 'TEST_PASSWORD must be set for Phase 1 Playwright tests').toBeTruthy()
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

async function expectLoginPage(page: Page) {
  await expect(page.getByRole('heading', { name: 'Merchant Portal' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
}

async function loginAs(page: Page, email: string, password = getPassword()) {
  await page.goto('/login')
  await expectLoginPage(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/merchant/dashboard')
}

async function expectDashboard(page: Page, user: (typeof USERS)[keyof typeof USERS], activeBusiness: 'shop' | 'clinic') {
  await expect(page).toHaveURL(/\/merchant\/dashboard$/)
  await expect(page.getByText(user.tenantName)).toBeVisible()
  await expect(page.getByText(user.name)).toBeVisible()
  await expect(page.getByRole('heading', { name: `Welcome back, ${user.name}` })).toBeVisible()
  await expect(page.getByText(new RegExp(`${user.tenantName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\.`))).toBeVisible()
  await expect(page.getByText(new RegExp(`${activeBusiness} view`, 'i'))).toBeVisible()
  await expect(page.getByText('Session active')).toBeVisible()
}

test.describe('Phase 1 P0 auth and dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page)
  })

  test('登录页面渲染测试', async ({ page }) => {
    await page.goto('/login')

    await expectLoginPage(page)
    await expect(page.getByText('Sign in to access your merchant dashboard and business context.')).toBeVisible()
    await expect(page.getByText('登录后将自动建立 24 小时 Session，并根据账号权限进入对应业务视图。')).toBeVisible()

    await expect(page).toHaveScreenshot('phase1-login-page.png', { fullPage: true })
  })

  test('登录成功流程测试', async ({ page }) => {
    await loginAs(page, USERS.owner.email)

    await expectDashboard(page, USERS.owner, 'shop')
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Shop Overview' })).toBeVisible()

    await expect(page).toHaveScreenshot('phase1-dashboard-after-login.png', { fullPage: true })
  })

  test('登录失败测试（错误密码）', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill(USERS.owner.email)
    await page.getByLabel('Password').fill(`${getPassword()}-wrong`)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('密码错误或账号不存在')).toBeVisible()

    await expect(page).toHaveScreenshot('phase1-login-invalid-password.png', { fullPage: true })
  })

  test('Session 过期跳转测试', async ({ page }) => {
    await loginAs(page, USERS.owner.email)

    await page.route('**/merchant/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'session_expired',
          message: 'Session is invalid or expired.',
        }),
      })
    })

    await page.goto('/merchant/dashboard')
    await page.waitForURL('**/login')

    await expectLoginPage(page)
    await expect(page).toHaveScreenshot('phase1-login-after-session-expired.png', { fullPage: true })
  })

  test('Dashboard 页面渲染测试', async ({ page }) => {
    await loginAs(page, USERS.owner.email)

    await expectDashboard(page, USERS.owner, 'shop')
    await expect(page.getByRole('heading', { name: 'Summary Skeleton' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Operational Notes' })).toBeVisible()
    await expect(page.getByText('Tenant Status')).toBeVisible()
    await expect(page.getByText('Role')).toBeVisible()
    await expect(page.getByText('Can Switch')).toBeVisible()

    await expect(page).toHaveScreenshot('phase1-dashboard-shell.png', { fullPage: true })
  })

  test('状态机流转测试：可切换账号合法切换业务成功', async ({ page }) => {
    await loginAs(page, USERS.owner.email)

    await page.getByRole('button', { name: 'clinic' }).click()

    await expect(page.getByText(/Happy Paws · clinic view/i)).toBeVisible()
    await expect(page.getByText(/Current business context is\s+clinic/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Clinic Overview' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Shop Overview' })).toHaveCount(0)

    await expect(page).toHaveScreenshot('phase1-dashboard-after-legal-switch.png', { fullPage: true })
  })

  test('状态机流转测试：非法业务域访问被拦截', async ({ page, request }) => {
    await loginAs(page, USERS.clinicManager.email)

    const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'session_id')
    expect(sessionCookie?.value).toBeTruthy()

    const forbiddenResponse = await request.get('/merchant/me', {
      headers: {
        'X-Session-ID': sessionCookie!.value,
        'X-Business-Type': 'shop',
      },
    })

    expect(forbiddenResponse.status()).toBe(403)
    await expect(forbiddenResponse.json()).resolves.toMatchObject({
      error: 'business_scope_forbidden',
    })

    await page.goto('/merchant/403')

    await expect(page.getByRole('heading', { name: '403 Forbidden' })).toBeVisible()
    await expect(page.getByText('You do not have permission to access this business area.')).toBeVisible()
    await expect(page.getByText(/Current active business:\s+clinic/i)).toBeVisible()

    await expect(page).toHaveScreenshot('phase1-forbidden-illegal-business-access.png', { fullPage: true })
  })
})
