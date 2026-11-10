import { test, expect, type Route } from '@playwright/test'
import { seedSession } from './seededSession'

/**
 * Chrome's Google Translate replaces text nodes with nested <font> elements.
 * React can otherwise retain a stale reference to the original text node when
 * a component later swaps a conditional label. (Ported from fork commit
 * 0720651, upstream nastaso/cloudcertprep#275, with zh-TW labels.)
 */
async function emulateGoogleTranslate(page: import('@playwright/test').Page): Promise<void> {
  // The translation mutation covers the entire body, including idle islands.
  // An SSR-visible footer alone does not prove the other islands are ready.
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'), undefined, { timeout: 15000 })
  await page.locator('body').evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []

    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeValue?.trim()) textNodes.push(node as Text)
    }

    for (const textNode of textNodes) {
      const outerFont = document.createElement('font')
      const innerFont = document.createElement('font')
      innerFont.textContent = textNode.nodeValue
      outerFont.append(innerFont)
      textNode.parentNode?.replaceChild(outerFont, textNode)
    }
  })
}

/** Real users translate a page after it has loaded, so wait until the Astro
 *  island holding `selector` has hydrated (Astro drops the `ssr` attribute). */
async function waitForIslandHydrated(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const island = document.querySelector(sel)?.closest('astro-island')
    return !!island && !island.hasAttribute('ssr')
  }, selector, { timeout: 15000 })
}

/** Collects uncaught page errors plus every BaseLayout Translate-guard hit.
 *  The guard keeps real users from crashing, so the specs must fail on a hit
 *  instead: one means a label lost its stable wrapper element. */
function collectTranslateProblems(page: import('@playwright/test').Page): string[] {
  const problems: string[] = []
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`))
  page.on('console', msg => {
    if (msg.text().includes('[cc-translate-guard]')) problems.push(msg.text())
  })
  return problems
}

test('footer theme toggle survives Google Translate DOM changes', async ({ page }) => {
  const problems = collectTranslateProblems(page)

  await page.goto('/')

  const toggle = page.getByRole('button', { name: '切換至深色模式' })
  await expect(toggle).toBeVisible({ timeout: 15000 })
  await waitForIslandHydrated(page, 'footer')
  await emulateGoogleTranslate(page)

  await toggle.click()

  // The accessible name comes from aria-label, which Translate never touches,
  // so also assert the visible label: a stale <font> text node would keep
  // showing the old one.
  const toggled = page.getByRole('button', { name: '切換至淺色模式' })
  await expect(toggled).toBeVisible()
  await expect(toggled).toHaveText('淺色模式')
  expect(problems).toEqual([])
})

test('practice exam starts and advances after Google Translate DOM changes', async ({ page }) => {
  const problems = collectTranslateProblems(page)

  await page.goto('/aws/clf-c02/practice-exam')

  const startExam = page.getByRole('button', { name: '開始測驗' })
  // The exam body is a client:only island, so a visible button is a mounted one.
  await expect(startExam).toBeVisible({ timeout: 15000 })

  // Starting the exam swaps the button label for its loading state. Without a
  // stable label wrapper, React tries to remove the text node that Translate
  // already replaced and the app ErrorBoundary takes over.
  await emulateGoogleTranslate(page)
  await startExam.click()
  await expect(page.getByText('第 1 題，共 65 題', { exact: true })).toBeVisible({ timeout: 15000 })

  // Translate also processes the freshly-rendered question and answer text.
  // Moving to the next question must replace those values rather than leaving
  // the previous question visible inside nested <font> elements.
  const stem = page.locator('h2.cc-question-stem')
  const firstStem = (await stem.innerText()).trim()
  await emulateGoogleTranslate(page)
  await page.getByRole('button', { name: '下一題' }).click()

  await expect(page.getByText('第 2 題，共 65 題', { exact: true })).toBeVisible()
  await expect(stem).not.toContainText(firstStem)
  await expect(page.getByText('發生問題')).toHaveCount(0)
  expect(problems).toEqual([])
})

/**
 * PR-2: localStorage crash safety + stuck dashboard error state.
 * Runs in CI with the seeded-session fixture (no real backend / Turnstile).
 * Source: EDGE-CASE-FINDINGS-2026-06-28.md, surfaces 3 + 7.
 */

// ---------------------------------------------------------------------------
// Storage crash safety: theme toggle with localStorage blocked
// ---------------------------------------------------------------------------

test('useTheme: theme toggles without crashing when localStorage is blocked', async ({ page }) => {
  // Proxy localStorage so setItem throws a SecurityError (storage-blocked browser).
  await page.addInitScript(() => {
    const orig = window.localStorage
    const proxy = new Proxy(orig, {
      get(target, prop) {
        if (prop === 'setItem') {
          return () => { throw new DOMException('SecurityError: storage blocked', 'SecurityError') }
        }
        const val = target[prop as keyof Storage]
        return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(target) : val
      },
    })
    Object.defineProperty(window, 'localStorage', { get: () => proxy, configurable: true })
  })

  await page.goto('/')

  // Theme toggle must be present and interactable
  const toggle = page.getByRole('button', { name: /切換至.*模式|淺色模式|深色模式/ }).first()
  await expect(toggle).toBeVisible({ timeout: 15000 })

  // Click should not crash - if it did, the no-transition class would be stuck
  // (killing all site transitions) and a second click would fail silently.
  await toggle.click()

  // Double-rAF takes <50ms; wait a bit then verify no-transition was removed.
  await page.waitForTimeout(200)

  const hasNoTransition = await page.evaluate(
    () => document.documentElement.classList.contains('no-transition'),
  )
  expect(
    hasNoTransition,
    '.no-transition must be removed after toggle even when localStorage throws',
  ).toBe(false)

  // A second toggle must also work (state is not jammed).
  await toggle.click()
  await page.waitForTimeout(200)
  const stillStuck = await page.evaluate(
    () => document.documentElement.classList.contains('no-transition'),
  )
  expect(stillStuck, 'second toggle must also clean up no-transition').toBe(false)
})

// ---------------------------------------------------------------------------
// useCert: exam page renders when localStorage.getItem is blocked (surface 7)
// ---------------------------------------------------------------------------

test('useCert: practice-exam renders without crashing when localStorage.getItem is blocked', async ({ page }) => {
  // Block localStorage.getItem to simulate a storage-disabled / sandboxed browser.
  // This is the exact condition that made getStored() throw during render, causing
  // the AppIsland ErrorBoundary to catch it and show "Something went wrong."
  await page.addInitScript(() => {
    const orig = window.localStorage
    const proxy = new Proxy(orig, {
      get(target, prop) {
        if (prop === 'getItem') {
          return () => { throw new DOMException('SecurityError', 'SecurityError') }
        }
        const val = target[prop as keyof Storage]
        return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(target) : val
      },
    })
    Object.defineProperty(window, 'localStorage', { get: () => proxy, configurable: true })
  })

  await page.goto('/aws/clf-c02/practice-exam')

  // The ErrorBoundary must NOT fire.
  await expect(page.getByText(/發生問題/i)).toHaveCount(0)

  // The exam start screen must render (useCert fell back to DEFAULT_CERT_ID,
  // not an uncaught SecurityError that crashes the island).
  await expect(page.getByRole('button', { name: "開始測驗" })).toBeVisible({ timeout: 15000 })
})

// ---------------------------------------------------------------------------
// Dashboard: error clears on successful re-fetch (surface 7)
// ---------------------------------------------------------------------------

test('CertDashboard: error alert clears when a re-fetch succeeds', async ({ page }) => {
  // Use a closure flag so the route handler switches from fail -> succeed once
  // the test is ready to click "Try again".
  let shouldFail = true

  await seedSession(page, {
    rest: (route: Route) => {
      if (shouldFail) {
        // Abort (network error): caught by the .catch() in CertDashboard, sets dataError=true.
        return route.abort()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
        headers: { 'Content-Range': '0-0/0' },
      })
    },
  })

  await page.goto('/aws/clf-c02')

  // Wait for auth to resolve and the dashboard kicker to appear (proves
  // useAuth().user resolved from the seeded token). The middot separator
  // distinguishes the kicker from the sr-only "Loading your dashboard" status.
  await expect(page.getByText(/·\s*你的學習總覽/i)).toBeVisible({ timeout: 15000 })

  // With both REST queries aborted, the dashboard must show the error alert.
  await expect(
    page.getByText(/無法載入最新進度/),
  ).toBeVisible({ timeout: 10000 })

  // Switch the route handler to succeed, then trigger a re-fetch via "Try again".
  shouldFail = false
  await page.getByRole('button', { name: /再試一次/i }).click()

  // The error alert must disappear (dataError cleared by the success path).
  await expect(
    page.getByText(/無法載入最新進度/),
  ).toBeHidden({ timeout: 10000 })

  // "Domain mastery" heading is only rendered when !dataError (the section is
  // conditionally removed, not just hidden), so its presence confirms the error
  // state was fully resolved, not merely styled away.
  await expect(
    page.getByRole('heading', { name: "領域熟練度", exact: true }),
  ).toBeVisible({ timeout: 5000 })
})
