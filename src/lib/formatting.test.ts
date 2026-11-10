import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelativeDate } from './formatting'

// `formatRelativeDate` hard-codes the 'zh-TW' locale and reads `new Date()` for
// "now", so tests freeze the clock with fake timers (restored after each test)
// and assert against zh-TW wording. System-time strings use local-time ISO
// (no trailing 'Z') so the local-midnight calendar-day math is independent of
// the runner's timezone.

const LOCALE = 'zh-TW'
// Built with the same Intl config as the production fallback so the expected
// absolute string stays correct under any timezone, rather than hard-coded.
const absoluteFmt = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** Freeze "now" at nowISO, then format dateISO. */
function relativeAt(nowISO: string, dateISO: string): string {
  vi.setSystemTime(new Date(nowISO))
  return formatRelativeDate(dateISO)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('formatRelativeDate', () => {
  it('returns "剛剛" for under a minute', () => {
    expect(relativeAt('2026-06-16T09:00:00', '2026-06-16T08:59:30')).toBe('剛剛')
  })

  it('reports minutes within the hour', () => {
    expect(relativeAt('2026-06-16T10:00:00', '2026-06-16T09:30:00')).toBe('30 分鐘前')
  })

  it('reports hours within the day', () => {
    expect(relativeAt('2026-06-16T10:00:00', '2026-06-16T07:00:00')).toBe('3 小時前')
  })

  // ACTUAL behaviour of the current implementation: the sub-24h `diffHours`
  // branch is evaluated BEFORE the calendar-day comparison, so a 23:00 -> 09:00
  // overnight gap (10 elapsed hours) reads "10 小時前" and never reaches the
  // calendar-day "昨天" branch. NOTE: the function's docstring claims this
  // case returns "昨天"; this test pins what the code actually does today.
  it('uses elapsed hours, not calendar day, for a sub-24h overnight gap', () => {
    expect(relativeAt('2026-06-16T09:00:00', '2026-06-15T23:00:00')).toBe('10 小時前')
  })

  // The calendar-day "昨天" branch is reached only once >= 24h have
  // elapsed while the date still falls on the previous local calendar day
  // (~32.5h here: 00:30 the prior day, read at 09:00).
  it('returns "昨天" for the previous calendar day past 24h', () => {
    expect(relativeAt('2026-06-16T09:00:00', '2026-06-15T00:30:00')).toBe('昨天')
  })

  it('reports the day bucket for a few days ago', () => {
    expect(relativeAt('2026-06-16T09:00:00', '2026-06-13T09:00:00')).toBe('3 天前')
  })

  it('reports the week bucket for ~2 週前', () => {
    expect(relativeAt('2026-06-16T09:00:00', '2026-06-02T09:00:00')).toBe('2 週前')
  })

  it('reports the month bucket for ~2 個月前', () => {
    expect(relativeAt('2026-06-16T09:00:00', '2026-04-16T09:00:00')).toBe('2 個月前')
  })

  it('falls back to an absolute date for dates over a year old', () => {
    const oldDate = '2024-01-01T09:00:00'
    expect(relativeAt('2026-06-16T09:00:00', oldDate)).toBe(absoluteFmt.format(new Date(oldDate)))
  })
})
