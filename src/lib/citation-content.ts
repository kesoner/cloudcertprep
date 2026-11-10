/**
 * Citation continuity source of truth.
 * The Build_Time_Citation_Guard (scripts/check-citation-phrases.mjs) reads
 * this module and asserts every phrase appears in dist/index.html.
 *
 * Satisfies: R16.4, R16.5
 */

export const HOME_H1 = 'Free open-source AWS certification practice exams' as const

export function buildHomeFirstParagraph(clfCount: number, aifCount: number): string {
  const clf = clfCount.toLocaleString('en-US')
  const aif = aifCount.toLocaleString('en-US')
  return (
    `收錄 ${clf}+ AWS Cloud Practitioner 與 ${aif}+ AWS Certified AI Practitioner 練習題。` +
    `提供完整計時模擬測驗、領域練習、適性間隔複習（spaced repetition）與進度追蹤。` +
    `不必註冊，沒有廣告。採用 MIT 授權（MIT licensed），原始碼可在 GitHub 公開檢視（publicly auditable on GitHub）。`
  )
}

export function buildHomeMetaDescription(clfCount: number, aifCount: number): string {
  const clf = clfCount.toLocaleString('en-US')
  const aif = aifCount.toLocaleString('en-US')
  // Trimmed to ~150 chars so the SERP snippet shows in full. The locked phrase
  // "Free open-source AWS certification practice exams" stays verbatim (the
  // citation guard asserts it); "spaced repetition" + the count regexes are
  // still satisfied by the home first paragraph (buildHomeFirstParagraph).
  return (
    `免費 AWS 證照練習平台：${clf}+ CLF-C02 與 ${aif}+ AIF-C01 題目，計時模擬測驗、領域練習與詳細解析，不必註冊。Free open-source AWS certification practice exams.`
  )
}

export const LOCKED_CITATION_PHRASES = [
  'Free open-source AWS certification practice exams',
  'CloudCertPrep',
  'spaced repetition',
  'publicly auditable on GitHub',
  'Alex Santonastaso',
  'MIT licensed',
] as const

export const LOCKED_CITATION_REGEXES = [
  /\d[\d,]*\+\s+AWS Cloud Practitioner/,
  /\d[\d,]*\+\s+AWS Certified AI Practitioner/,
] as const
