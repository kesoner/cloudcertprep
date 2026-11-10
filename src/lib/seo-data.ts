// Platform-level SEO defaults and FAQ content. Cert-scoped routes
// (`/:provider/:certCode/...`) generate their metadata at render time from the
// cert registry; cert-agnostic React routes fall back to `DEFAULT_SEO` via the
// `useSEO` hook.

import { APP_NAME } from './constants'
import { TOTAL_ACTIVE_QUESTIONS } from './generated/question-counts'
import { resolveSiteOrigin } from './site-origin.mjs'

export const SITE_URL = resolveSiteOrigin(import.meta.env.PUBLIC_SITE_URL)

/**
 * Build a fully-qualified canonical URL from a site-relative path. Single
 * source of truth so canonical/og:url strings never drift from SITE_URL across
 * pages (audit D1). Pass the path with a leading slash, e.g.
 * `canonicalFor('/aws/clf-c02/practice-exam')`. The root path returns
 * `${SITE_URL}/`.
 */
export function canonicalFor(path: string): string {
  if (path === '/' || path === '') return `${SITE_URL}/`
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Platform-wide active question total, rounded DOWN to the nearest 10 and
 * suffixed with "+". Derived from the generated counts so marketing copy never
 * drifts from the real bank size (the previous hardcoded "1,450+" had already
 * fallen behind the live total).
 */
const TOTAL_QUESTIONS_LABEL = `${(Math.floor(TOTAL_ACTIVE_QUESTIONS / 10) * 10).toLocaleString('en-US')}+`

export interface SEOData {
  title: string
  description: string
  /** Canonical path (no domain). Use null for noindex routes. */
  canonical: string | null
}

/**
 * Platform-level fallback SEO. Cert-agnostic so route transitions don't flash
 * a CLF-C02-specific title between mounting and `useSEO` setting its own
 * metadata. Per-cert landings inject their own SEO via `useSEO` at render time.
 */
export const DEFAULT_SEO: SEOData = {
  title: `免費雲端證照模擬測驗 · ${APP_NAME}`,
  description:
    `免費開源 AWS 證照練習平台，收錄 ${TOTAL_QUESTIONS_LABEL} 道英文題目，提供繁體中文介面、計時模擬測驗、適性領域練習及進度追蹤，無須註冊，沒有廣告。`,
  canonical: '/',
}

/**
 * FAQ data rendered both as a visible section on every page that mounts the
 * `常見問題` component AND as JSON-LD emitted alongside the visible markup. Google
 * requires the FAQ content be visible on the page for rich-result eligibility
 * having only the schema (without rendering) risks the snippet being
 * ignored or flagged as deceptive structured data.
 */
/**
 * FAQ category groupings. Used by the FAQ component to render entries under
 * H3 sub-headings, improving scannability and semantic structure. Categories
 * are ordered intentionally: general -> format -> strategy -> platform
 * roughly tracks 'is this for me?' -> 'what is it?' -> 'how do I use it?'
 * -> 'what about the future?'.
 */
export type FAQCategory = 'general' | 'format' | 'strategy' | 'platform'

export const FAQ_CATEGORY_LABEL: Record<FAQCategory, string> = {
  general: '一般問題',
  format: '測驗形式',
  strategy: '學習策略',
  platform: '平台與證照',
}

export const FAQ_CATEGORY_ORDER: FAQCategory[] = ['general', 'format', 'strategy', 'platform']

/**
 * Optional structured replacement for the flat `answer` string. When present,
 * the FAQ component renders `intro` -> <ol> of `items` -> `outro` instead of
 * the flat answer. The flat `answer` is still the canonical plaintext used
 * for JSON-LD (Schema.org Answer.text is plain text only, so structure is
 * flattened back out for crawlers). Keeping both in the same record means a
 * single source of truth for content, with structure as a UI concern.
 */
export interface FAQSteps {
  intro: string
  items: string[]
  outro?: string
}

export interface FAQEntry {
  question: string
  answer: string
  steps?: FAQSteps
  category: FAQCategory
  /**
   * Cert code this entry applies to (e.g. 'clf-c02'). Undefined = generic
   * platform entry shown for every cert. Lets the FAQ component filter
   * cert-specific entries when SAA-C03 / other certs ship.
   */
  certCode?: string
  /**
   * When true, this entry renders on the website but is EXCLUDED from the
   * generated `llms.txt`. Use for answers that carry personal anecdote, study
   * strategy/opinion, external recommendations, or subjective difficulty/
   * pass-likelihood claims — fine as on-page voice, but llms.txt should stay a
   * high-confidence factual signal for LLM browse-mode.
   */
  excludeFromLlms?: boolean
}

export const FAQ_ENTRIES: FAQEntry[] = [
  {
    question: 'CloudCertPrep-zh 真的完全免費嗎？',
    answer: '是的，所有題目、模擬測驗、領域練習與進度追蹤皆免費，沒有隱藏費用、付費等級或廣告。',
    category: 'general',
  },
  {
    question: '需要建立帳戶才能練習嗎？',
    answer: '不需要。訪客可使用完整模擬測驗與領域練習。免費登入後，即可儲存進度、查看歷史紀錄，並使用適性間隔複習。',
    category: 'general',
  },
  {
    question: '介面與題庫使用什麼語言？',
    answer: '網站主要介面使用繁體中文。練習題的題幹、選項與解析目前保留英文，方便對照 AWS 官方術語；作答時會標示題庫語言。',
    category: 'general',
  },
  {
    question: 'CloudCertPrep-zh 有開放原始碼嗎？',
    answer: '有，專案採用 MIT 授權。可在 https://github.com/nastaso/cloudcertprep 查看原始碼與原始題庫，並依 CONTRIBUTING.md 參與貢獻。',
    category: 'general',
  },
  {
    question: '間隔複習如何運作？',
    answer: '登入後，領域練習會依作答歷史增加錯題的出現權重，降低熟悉題目的出現頻率。連續答對的題目會暫時排除，並保留約 20% 的名額給未見過的題目。訪客模式使用隨機選題。',
    category: 'strategy',
  },
  {
    question: '目前支援哪些證照？',
    answer: '目前開放 CLF-C02 與 AIF-C01。SAA-C03 題庫仍在建置中，尚未開放完整練習。',
    category: 'platform',
  },
  {
    question: '如何回報錯誤答案或題目？',
    answer: '使用題目旁的 GitHub 回報連結，或前往 https://github.com/nastaso/cloudcertprep/issues 說明題目編號與問題，也歡迎透過 Pull Request 提出修正。',
    category: 'platform',
  },
  {
    question: '如何新增題目或參與開發？',
    answer: '請閱讀專案的 CONTRIBUTING.md。題庫使用 JSON 格式，貢獻內容會經過驗證與審查。也歡迎協助改善無障礙體驗、修正問題或新增學習內容。',
    category: 'platform',
  },
  {
    question: 'CLF-C02 模擬測驗的形式是什麼？',
    answer: '完整測驗為 65 題、90 分鐘，使用 100 至 1000 的換算分數，通過門檻為 700 分。此平台的分數僅供練習參考，並非官方評分結果。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'CLF-C02 涵蓋哪些領域？',
    answer: '雲端概念、安全與合規、雲端技術與服務，以及帳務、定價與支援。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'CLF-C02 題目有詳細解析嗎？',
    answer: '有。每題解析說明正確答案的理由與其他選項的差異，幫助你理解概念，而非只記住答案。原始題庫與解析目前為英文。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'CLF-C02 題目如何維護？',
    answer: '題目依公開的 AWS 考試指南與文件撰寫，透過 GitHub Pull Request 進行審查。可使用題目旁的原始檔連結公開檢視與回報問題。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: '該如何準備 CLF-C02？',
    answer: '先閱讀官方考試指南，了解各領域範圍，再透過領域練習加強不熟悉的主題。每次作答後閱讀解析，最後以完整計時模擬測驗練習配速。',
    category: 'strategy',
    certCode: 'clf-c02',
  },
  {
    question: 'CLF-C02 的通過率是多少？',
    answer: 'AWS 未公布官方通過率。本平台社群統計只反映使用者在模擬測驗中的表現，不代表正式考試的通過率，也不保證實際考試結果。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'CLF-C02 可以重考嗎？',
    answer: '原始考試資訊說明未通過後須等待 14 天才可重考，且每次重考須支付費用。報考前請以 AWS 官方最新規定為準。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'CLF-C02 證照有效期限多久？',
    answer: '原始指南說明證照有效期為三年。續證方式與有效期限請以你的 AWS Certification 帳戶及官方最新規定為準。',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: '這裡提供 CLF-C02 的真實考題洩題嗎？',
    answer: '不提供。題目為依公開考試指南與文件撰寫的原創練習內容，不是洩漏的真實考題。目標是協助你理解觀念並正當準備考試。',
    category: 'general',
    certCode: 'clf-c02',
  },
  {
    question: 'AIF-C01 模擬測驗的形式是什麼？',
    answer: '完整測驗為 65 題、90 分鐘，使用 100 至 1000 的換算分數，通過門檻為 700 分。此平台的分數僅供練習參考，並非官方評分結果。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'AIF-C01 涵蓋哪些領域？',
    answer: 'AI 與機器學習基礎、生成式 AI、基礎模型應用、負責任 AI，以及安全、合規與治理。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'AIF-C01 題目有詳細解析嗎？',
    answer: '有。每題解析說明正確答案的理由與其他選項的差異，幫助你理解概念，而非只記住答案。原始題庫與解析目前為英文。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'AIF-C01 題目如何維護？',
    answer: '題目依公開的 AWS 考試指南與文件撰寫，透過 GitHub Pull Request 進行審查。可使用題目旁的原始檔連結公開檢視與回報問題。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: '該如何準備 AIF-C01？',
    answer: '先閱讀官方考試指南，了解各領域範圍，再透過領域練習加強不熟悉的主題。每次作答後閱讀解析，最後以完整計時模擬測驗練習配速。',
    category: 'strategy',
    certCode: 'aif-c01',
  },
  {
    question: 'AIF-C01 的通過率是多少？',
    answer: 'AWS 未公布官方通過率。本平台社群統計只反映使用者在模擬測驗中的表現，不代表正式考試的通過率，也不保證實際考試結果。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'AIF-C01 可以重考嗎？',
    answer: '原始考試資訊說明未通過後須等待 14 天才可重考，且每次重考須支付費用。報考前請以 AWS 官方最新規定為準。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'AIF-C01 證照有效期限多久？',
    answer: '原始指南說明證照有效期為三年。續證方式與有效期限請以你的 AWS Certification 帳戶及官方最新規定為準。',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: '這裡提供 AIF-C01 的真實考題洩題嗎？',
    answer: '不提供。題目為依公開考試指南與文件撰寫的原創練習內容，不是洩漏的真實考題。目標是協助你理解觀念並正當準備考試。',
    category: 'general',
    certCode: 'aif-c01',
  },
]
