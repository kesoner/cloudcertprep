import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'
import { KOFI_URL } from '../lib/constants'
import { trackEvent } from '../lib/analytics'

// Inline links inside muted prose stay underlined (WCAG 1.4.1 / Lighthouse
// link-in-text-block). Nav-column links are distinguishable as a list, so
// they carry color-on-hover only.
const inlineLink = 'text-text-primary underline underline-offset-2 hover:text-text-primary/70 transition-colors'
const navLink = 'text-text-muted hover:text-text-primary transition-colors duration-200'

/**
 * Footer (DSv4.1) — organized columns over a quiet hairline, generous
 * padding, legal small-print on its own row. Premium pattern: the footer is
 * a calm index, not a cramped strip.
 */
export function Footer() {
  const { theme, toggleTheme } = useTheme()

  return (
    <footer className="border-t border-border-hairline mt-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">
        {/* 2x2 on mobile (brand + 3 nav columns = 4 even cells, no orphan),
            1x4 on desktop. The previous 2-col grid with a full-width brand
            stranded "法律資訊" next to an empty cell on phones. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
          <div>
            <p className="text-base font-semibold text-text-primary tracking-tight">
              Cloud<span className="font-bold">CertPrep-zh</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-text-muted max-w-[28ch]">
              kesoner 自用的繁中 fork，原專案由 Alex 建立。
            </p>
            <button
              onClick={toggleTheme}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors duration-200"
              aria-label={`切換至${theme === 'dark' ? '淺色' : '深色'}模式`}
            >
              {theme === 'dark'
                ? <Sun className="w-4 h-4" aria-hidden="true" />
                : <Moon className="w-4 h-4" aria-hidden="true" />}
              <span>{theme === 'dark' ? '淺色模式' : '深色模式'}</span>
            </button>
          </div>

          <nav aria-label="練習">
            <h2 className="text-sm font-semibold text-text-primary mb-3">練習</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="/aws/clf-c02" className={navLink}>Cloud Practitioner</a></li>
              <li><a href="/aws/aif-c01" className={navLink}>AI Practitioner</a></li>
              <li><a href="/history" className={navLink}>測驗紀錄</a></li>
            </ul>
          </nav>

          <nav aria-label="專案">
            <h2 className="text-sm font-semibold text-text-primary mb-3">專案</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="/about" className={navLink}>關於我們</a></li>
              <li><a href="/blog" className={navLink}>學習文章</a></li>
              <li><a href="/contribute" className={navLink}>參與貢獻</a></li>
              <li><a href="/stats" className={navLink}>社群統計</a></li>
              <li>
                <a
                  href={KOFI_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('donate_click', { location: 'footer' })}
                  className={navLink}
                >
                  贊助原作者 Alex
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="法律資訊">
            <h2 className="text-sm font-semibold text-text-primary mb-3">法律資訊</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="/privacy" className={navLink}>隱私權政策</a></li>
              <li><a href="/terms" className={navLink}>服務條款</a></li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-border-hairline flex flex-col md:flex-row gap-3 md:items-center md:justify-between text-xs leading-relaxed text-text-muted">
          <p>
            © {new Date().getFullYear()}{' '}
            <a href="https://santonastaso.me" target="_blank" rel="noopener noreferrer" className={inlineLink}>Alex Santonastaso</a> · MIT licensed. 本 fork 由 kesoner 自用託管。
          </p>
          <p className="max-w-xl">
            本平台與 AWS 或 Amazon.com, Inc. 無關聯。AWS 及相關商標屬於 Amazon。本平台為獨立學習工具，不保證通過官方證照考試。
          </p>
        </div>
      </div>
    </footer>
  )
}
