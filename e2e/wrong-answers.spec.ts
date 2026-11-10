import { test, expect, type Page } from '@playwright/test'
import clfDomain1 from '../src/data/clf-c02/domain1.json' with { type: 'json' }
import { seedSession } from './seededSession'

const KEY = 'cloudcertprep_wrong_answers_v1'
const REVIEW = '/aws/clf-c02/wrong-answers'
type StoredMiss = { certCode: string; questionId: string; userAnswer: string; lastMissedAt: number }
const readMisses = (page: Page): Promise<StoredMiss[]> => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), KEY)

test.use({ reducedMotion: 'reduce' })

test('account deletion clears open review tabs and blocks stale redo writes even before storage events arrive', async ({ page, context }) => {
  test.setTimeout(60000)
  await seedSession(page)
  await page.route('**/functions/v1/delete-account', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }))
  await page.goto('/account')
  const question = clfDomain1.find(q => typeof q.answer === 'string')!
  const wrongKey = Object.keys(question.options).find(key => key !== question.answer)!
  await page.evaluate(({ key, entry }) => localStorage.setItem(key, JSON.stringify([entry])), {
    key: KEY, entry: { certCode: 'clf-c02', questionId: question.id, userAnswer: wrongKey, lastMissedAt: 1 },
  })

  const liveReview = await context.newPage()
  const delayedReview = await context.newPage()
  const delayedStart = await context.newPage()
  // Simulate a suspended tab whose storage events have not been delivered yet.
  for (const review of [delayedReview, delayedStart]) await review.addInitScript(() => {
    const add = window.addEventListener.bind(window)
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type !== 'storage') add(type, listener, options)
    }) as typeof window.addEventListener
  })
  for (const review of [liveReview, delayedReview]) {
    await review.goto(REVIEW)
    await review.getByRole('button', { name: '重做 1 道錯題' }).click()
    await expect(review.getByRole('button', { name: (question.options as Record<string, string>)[wrongKey], exact: true })).toBeVisible()
  }
  await delayedStart.goto(REVIEW)
  await expect(delayedStart.getByRole('button', { name: '重做 1 道錯題' })).toBeVisible()

  await page.getByRole('button', { name: '刪除我的帳戶', exact: true }).click()
  await page.getByPlaceholder('DELETE').fill('DELETE')
  await page.getByRole('button', { name: '刪除帳戶', exact: true }).click()
  await page.waitForURL('**/?account_deleted=1')

  await expect(liveReview.getByRole('heading', { name: '目前沒有錯題' })).toBeVisible()
  await delayedStart.getByRole('button', { name: '重做 1 道錯題' }).click()
  await expect(delayedStart.getByRole('heading', { name: '目前沒有錯題' })).toBeVisible()
  await delayedReview.getByRole('button', { name: (question.options as Record<string, string>)[wrongKey], exact: true }).click()
  await expect(delayedReview.getByRole('heading', { name: '目前沒有錯題' })).toBeVisible()
  expect(await readMisses(delayedReview)).toEqual([])
  await liveReview.close()
  await delayedReview.close()
  await delayedStart.close()
})

test('guest practice stores canonical answers; review persists and correct redo removes only that question', async ({ page }) => {
  await page.goto('/aws/clf-c02/domain-practice?domain=1')
  await page.getByRole('button', { name: '開始練習', exact: true }).click()
  const stem = page.locator('.cc-question-stem [lang="en"]')
  await expect(stem).toBeVisible({ timeout: 15000 })
  const questionText = (await stem.textContent())?.trim()
  const question = clfDomain1.find(q => q.question === questionText)
  expect(question).toBeTruthy()
  if (!question) throw new Error('Practice question missing from the original bank')
  const correctKeys = Array.isArray(question.answer) ? question.answer : [question.answer]
  const optionText = (key: string) => (question.options as Record<string, string>)[key]
  const optionKeys = Object.keys(question.options).filter(key => optionText(key))
  const wrongKey = optionKeys.find(key => !correctKeys.includes(key))!
  const selectedKeys = [wrongKey, ...optionKeys.filter(key => key !== wrongKey)].slice(0, correctKeys.length)
  for (const key of selectedKeys) await page.getByRole('button', { name: optionText(key), exact: true }).click()
  if (Array.isArray(question.answer)) await page.getByRole('button', { name: '送出答案', exact: true }).click()
  await expect.poll(() => readMisses(page)).toHaveLength(1)
  const [stored] = await readMisses(page)
  expect(stored.questionId).toBe(question.id)
  expect(stored.userAnswer.split(',').sort()).toEqual([...selectedKeys].sort())

  // A different certification's record must survive clearing this question.
  await page.evaluate(({ key, entry }) => {
    const entries = JSON.parse(localStorage.getItem(key) ?? '[]')
    localStorage.setItem(key, JSON.stringify([...entries, entry]))
  }, { key: KEY, entry: { ...stored, certCode: 'aif-c01' } })
  await page.getByRole('button', { name: '結束練習', exact: true }).click()
  await page.getByRole('dialog', { name: '要結束本次練習嗎？' }).getByRole('button', { name: '結束並查看結果' }).click()
  // Cross-page navigation proves persistence outside React state.
  await page.getByRole('link', { name: '查看錯題本' }).click()
  await expect(page.getByRole('heading', { name: '錯題本', exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(question.question, { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '重做 1 道錯題' }).click()
  for (const key of correctKeys) await page.getByRole('button', { name: optionText(key), exact: true }).click()
  if (Array.isArray(question.answer)) await page.getByRole('button', { name: '送出答案', exact: true }).click()
  await expect.poll(async () => (await readMisses(page)).filter(entry => entry.certCode === 'clf-c02')).toHaveLength(0)
  expect((await readMisses(page))[0].certCode).toBe('aif-c01')
  await page.getByRole('button', { name: '完成重做' }).click()
  await expect(page.getByText('做得好！這組錯題已全部答對。')).toBeVisible()
})

test('guest mock exam records misses even when too short for cloud history', async ({ page }) => {
  await page.goto('/aws/clf-c02/practice-exam')
  await page.getByRole('button', { name: '開始測驗', exact: true }).click()
  await page.getByRole('button', { name: '交卷', exact: true }).first().click()
  await page.getByRole('dialog', { name: '確定要交卷嗎？' }).getByRole('button', { name: '交卷並評分' }).click()
  await expect(page.getByRole('link', { name: '查看 65 道錯題' })).toBeVisible()
  expect((await readMisses(page)).filter(entry => entry.certCode === 'clf-c02')).toHaveLength(65)
})

test('blocked browser storage does not crash mistake review', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.goto(REVIEW)
  await expect(page.getByRole('heading', { name: '目前沒有錯題' })).toBeVisible({ timeout: 15000 })
})

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    for (const signedIn of [false, true]) {
      test(`mistake review ${theme} ${width} ${signedIn ? 'member' : 'guest'}`, async ({ page }) => {
        const question = clfDomain1.find(q => typeof q.answer === 'string')!
        const wrongKey = Object.keys(question.options).find(key => key !== question.answer)!
        await page.setViewportSize({ width, height: 1000 })
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.addInitScript(({ key, theme, entry }) => {
          localStorage.setItem('cloudcertprep_theme', theme)
          localStorage.setItem(key, JSON.stringify([entry]))
        }, { key: KEY, theme, entry: { certCode: 'clf-c02', questionId: question.id, userAnswer: wrongKey, lastMissedAt: 1 } })
        if (signedIn) await seedSession(page)
        await page.goto(REVIEW)
        await expect(page.getByRole('heading', { name: '錯題本', exact: true })).toBeVisible({ timeout: 15000 })
        await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
        expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex')
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `test-results/wrong-review-${theme}-${width}-${signedIn ? 'member' : 'guest'}.png`, fullPage: true })
      })
    }
  }
}
