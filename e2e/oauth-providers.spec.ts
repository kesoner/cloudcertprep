import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('disabled OAuth providers are absent from both login and signup', async ({ page }) => {
  await page.route('**/auth/v1/settings', route => route.fulfill({ json: { external: { google: false, github: false } } }))
  await page.goto('/login')
  await expect(page.getByText('目前僅提供電子郵件登入。')).toBeVisible()
  await expect(page.getByRole('button', { name: /使用 (Google|GitHub) 繼續/ })).toHaveCount(0)
  await page.getByRole('button', { name: '還沒有帳戶？註冊' }).click()
  await expect(page.getByRole('button', { name: /使用 (Google|GitHub) 繼續/ })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '電子郵件', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '以訪客身分繼續' })).toBeVisible()
})

for (const provider of ['google', 'github'] as const) {
  test(`${provider} enabled login still starts the OAuth flow`, async ({ page }) => {
    await page.route('**/auth/v1/settings', route => route.fulfill({ json: { external: { [provider]: true } } }))
    await page.route('**/auth/v1/authorize**', route => route.fulfill({ contentType: 'text/html', body: '<h1>OAuth redirect</h1>' }))
    await page.goto('/login')
    await page.getByRole('button', { name: `使用 ${provider === 'google' ? 'Google' : 'GitHub'} 繼續` }).click()
    await expect(page).toHaveURL(new RegExp(`/auth/v1/authorize\\?.*provider=${provider}`))
    const redirect = new URL(page.url())
    expect(redirect.searchParams.get('redirect_to')).toBe(new URL('/', test.info().project.use.baseURL).href)
  })

  test(`${provider} is shown only when enabled and is rechecked before redirect`, async ({ page }) => {
    let enabled = true
    let redirects = 0
    await page.route('**/auth/v1/settings', route => route.fulfill({ json: { external: { [provider]: enabled } } }))
    await page.route('**/auth/v1/authorize**', route => { redirects++; return route.abort() })
    await page.goto('/login')
    const label = provider === 'google' ? 'Google' : 'GitHub'
    const other = provider === 'google' ? 'GitHub' : 'Google'
    await expect(page.getByRole('button', { name: `使用 ${label} 繼續` })).toBeVisible()
    await expect(page.getByRole('button', { name: `使用 ${other} 繼續` })).toHaveCount(0)
    enabled = false
    await page.getByRole('button', { name: `使用 ${label} 繼續` }).click()
    await expect(page.getByText('此登入方式目前未開放，請使用電子郵件登入。')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(redirects).toBe(0)
  })
}

test('settings failure hides OAuth without blocking the email form', async ({ page }) => {
  await page.route('**/auth/v1/settings', route => route.fulfill({ status: 503 }))
  await page.goto('/login')
  await expect(page.getByText('暫時無法確認第三方登入，請稍後重新整理或使用電子郵件登入。')).toBeVisible()
  await expect(page.getByRole('button', { name: /使用 (Google|GitHub) 繼續/ })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '電子郵件', exact: true })).toBeEnabled()
})

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1440]) {
    test(`email-only login layout ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(value => localStorage.setItem('cloudcertprep_theme', value), theme)
      await page.route('**/auth/v1/settings', route => route.fulfill({ json: { external: {} } }))
      await page.goto('/login')
      await expect(page.getByText('目前僅提供電子郵件登入。')).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/oauth-login-${theme}-${width}.png`, fullPage: true })
    })
  }
}
