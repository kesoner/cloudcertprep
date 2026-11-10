import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSEO } from '../hooks/useSEO'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { trackEvent } from '../lib/analytics'
import { Button } from '../components/Button'

export function NotFound() {
  const location = useLocation()
  const { goHome } = useCertNavigate()
  useSEO({
    title: '404 · Page not found · CloudCertPrep-zh',
    description: '你要找的頁面不存在。',
    canonical: null,
  })

  useEffect(() => {
    trackEvent('page_not_found', { path: location.pathname })
  }, [location.pathname])

  // Mirrors the static 404.astro exactly (mono number + '找不到頁面' + the
  // same subline + '返回首頁'), so an in-app SPA miss and a static-host miss
  // are one consistent experience.
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <h1 className="font-mono text-7xl md:text-8xl font-bold tracking-tight text-text-primary mb-4">404</h1>
      <p className="text-xl font-semibold tracking-[-0.01em] text-text-primary mb-2">找不到頁面</p>
      <p className="text-text-muted mb-8 max-w-md">{"你要找的頁面不存在，或已移至其他位置。"}</p>
      <Button variant="primary" onClick={goHome}>返回首頁</Button>
      <a href="/#certifications" className="mt-4 text-sm text-text-muted underline underline-offset-2 hover:text-text-primary transition-colors">
        瀏覽證照
      </a>
    </div>
  )
}
