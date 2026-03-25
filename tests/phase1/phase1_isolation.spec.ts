import { expect, Page, test } from '@playwright/test'

test.use({
  baseURL: 'http://localhost:3000',
  viewport: { width: 1440, height: 900 },
})

const TEST_PASSWORD = process.env.TEST_PASSWORD

const TENANT_A = {
  email: 'owner@happypaws.com',
  userName: 'Happy Paws Owner',
  tenantName: 'Happy Paws',
  forbiddenTenantName: 'Paws Clinic',
  forbiddenEmail: 'admin@pawsclinic.com',
}

const TENANT_B = {
  email: 'admin@pawsclinic.com',
  userName: 'Paws Clinic Manager',
  tenantName: 'Paws Clinic',
  forbiddenTenantName: 'Happy Paws',
  forbiddenEmail: 'owner@happypaws.com',
}

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

async function loginAndOpenDashboard(page: Page, email: string) {
  await preparePage(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(getPassword())
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/merchant/dashboard')
}

async function expectTenantScopedDashboard(
  page: Page,
  current: typeof TENANT_A,
) {
  await expect(page.getByRole('heading', { name: `Welcome back, ${current.userName}` })).toBeVisible()
  await expect(page.getByText(current.tenantName)).toBeVisible()
  await expect(page.getByText(current.email)).toBeVisible()
  await expect(page.getByText(current.forbiddenTenantName)).toHaveCount(0)
  await expect(page.getByText(current.forbiddenEmail)).toHaveCount(0)
}

test.describe('Phase 1 tenant isolation', () => {
  test('租户 A / B 数据隔离', async ({ browser }) => {
    const tenantAContext = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } })
    const tenantBContext = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } })

    const tenantAPage = await tenantAContext.newPage()
    const tenantBPage = await tenantBContext.newPage()

    await loginAndOpenDashboard(tenantAPage, TENANT_A.email)
    await loginAndOpenDashboard(tenantBPage, TENANT_B.email)

    await expectTenantScopedDashboard(tenantAPage, TENANT_A)
    await expectTenantScopedDashboard(tenantBPage, TENANT_B)

    await expect(tenantAPage).toHaveScreenshot('phase1-tenant-a-dashboard.png', { fullPage: true })
    await expect(tenantBPage).toHaveScreenshot('phase1-tenant-b-dashboard.png', { fullPage: true })

    await tenantAContext.close()
    await tenantBContext.close()
  })
})
