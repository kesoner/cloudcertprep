import { test, expect } from '@playwright/test'
import { seedSession } from './seededSession'

test.use({ reducedMotion: 'reduce' })

test('Chinese interface preserves English questions and stable domain URLs', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.locator('#home-guest-hero h1')).toContainText('AWS 證照練習平台')
  await expect(page.locator('#home-guest-hero')).toContainText('1,469+')
  await expect(page.getByRole('link', { name: /免費開始練習/ })).toBeVisible()
  await page.goto('/aws/clf-c02/cloud-concepts')
  await expect(page.locator('h1')).toContainText('雲端概念')
  await page.getByRole('link', { name: '開始練習', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: /雲端概念/ })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: '開始練習', exact: true }).click()
  await expect(page.locator('.cc-question-stem')).toBeVisible({ timeout: 15000 })
  // Bank text remains English, independent of which random question is drawn.
  await expect(page.locator('h2').first()).toContainText(/[A-Za-z]{3}/)
  await expect(page.locator('.cc-question-stem [lang="en"]')).toBeVisible()
  await page.goto('/about')
  await expect(page).toHaveTitle(/CloudCertPrep-zh/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('關於 CloudCertPrep-zh')
  await expect(page.locator('main')).toContainText('並非 CloudCertPrep 原專案的開發者或維護者')
  await expect(page.getByRole('link', { name: 'kesoner666@gmail.com', exact: true })).toHaveAttribute('href', 'mailto:kesoner666@gmail.com')
  await expect(page.getByRole('link', { name: '贊助 Alex 的 Ko-fi', exact: true })).toHaveAttribute('href', 'https://ko-fi.com/alexsantonastaso')
})

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    for (const signedIn of [false, true]) {
      test(`Chinese layout ${theme} ${width} ${signedIn ? 'signed-in' : 'guest'}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 })
        await page.addInitScript((value) => localStorage.setItem('cloudcertprep_theme', value), theme)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        if (signedIn) await seedSession(page)
        await page.goto('/')
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
        if (signedIn) await expect(page.locator('.cc-auth-in h1')).toHaveText('準備好了，就開始吧。')
        else await expect(page.locator('#home-guest-hero')).toBeVisible()
        await page.evaluate(async () => {
          // Reveal every section by scrolling just as a reader would.
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y)
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          }
          // Hidden signed-out artwork can remain lazy and never load for a member.
          await Promise.all(Array.from(document.images)
            .filter(image => image.getClientRects().length > 0)
            .map(image => image.decode().catch(() => {})))
          window.scrollTo(0, 0)
          await document.fonts.ready
        })
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `test-results/chinese-${theme}-${width}-${signedIn ? 'member' : 'guest'}.png`, fullPage: true })
        await page.goto('/about')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('關於 CloudCertPrep-zh')
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `test-results/about-${theme}-${width}-${signedIn ? 'member' : 'guest'}.png`, fullPage: true })
      })
    }
  }
}
