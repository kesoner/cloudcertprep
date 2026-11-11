import { useEffect, useRef, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { validatePassword, isPasswordStrongEnough } from '../lib/validation'
import { trackEvent } from '../lib/analytics'
import { useSEO } from '../hooks/useSEO'
import { BookOpen, FileText, Target, TrendingUp, CheckCircle, Mail, Github } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../hooks/useAuth'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { Turnstile, type TurnstileHandle } from '../components/Turnstile'
import { getActiveTotalQuestions } from '../data/certifications'
import { safeFrom } from '../lib/navigation'
import { authErrorMessage } from '../lib/authErrors'
import { getOAuthProviders, type OAuthProvider, type OAuthProviders } from '../lib/oauthProviders'

// Client cooldown for resend / reset emails. Sized to Supabase's per-email
// rate-limit window (the default minimum interval between auth emails to the
// same address is 60s), so the button only re-enables once a send can actually
// succeed (bug 2: an instant resend after signup otherwise hits "too many
// attempts").
const RESEND_COOLDOWN_SECONDS = 60

export function Login() {
  const location = useLocation()
  const from = safeFrom((location.state as { from?: string })?.from)
  // A signed-in visitor has no reason to see the login form, so bounce them away
  // (to `from`, which is "/" for a directly-typed /login). useAuth resolves the
  // REAL session (not a stale token); for an in-page sign-in the form does its
  // own navigation to the same `from`, so this never fights it. (owner request)
  const { user: authedUser, loading: authLoading } = useAuth()
  useEffect(() => {
    if (!authLoading && authedUser) window.location.replace(from)
  }, [authLoading, authedUser, from])
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  // Resend-confirmation state for the "請查看你的電子郵件" card (P0-1). The
  // cooldown throttles repeat sends to match Supabase's resend rate limit.
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendCooldown, setResendCooldown] = useState(0) // seconds remaining
  // Whether the lazily-revealed resend captcha is showing. The "Check your
  // email" card no longer renders a second Turnstile upfront (a jarring repeat
  // bot-check right after signup); pressing Resend reveals it only when a fresh
  // single-use token is needed, then sends as soon as it resolves (bug 1).
  const [resendChallenge, setResendChallenge] = useState(false)
  // Cooldown after a password-reset email is sent, so a user who doesn't see it
  // immediately can't hammer the button (Supabase rate-limits server-side; this
  // is the visible feedback that a send is in flight). (M3 [H])
  const [resetCooldown, setResetCooldown] = useState(0)

  // Title varies by auth mode; canonical=null since auth pages are noindex.
  useSEO({
    title: isForgotPassword ? '重設密碼 · CloudCertPrep-zh'
      : isSignUp ? '註冊 · CloudCertPrep-zh'
      : '登入 · CloudCertPrep-zh',
    description: '登入 CloudCertPrep-zh，追蹤證照練習紀錄與學習進度。',
    canonical: null,
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState(() => {
    // Surface the OAuth unverified-email refusal redirected here by AuthProvider
    // (R5.5). Read once on mount from the query string.
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('error') === 'email_unverified'
      ? 'Google 帳戶的電子郵件尚未驗證。請至 https://myaccount.google.com 完成驗證後重試。'
      : ''
  })
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<OAuthProviders>({ google: false, github: false })
  const [providerStatus, setProviderStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let active = true
    getOAuthProviders().then(available => {
      if (active) {
        setProviders(available)
        setProviderStatus('ready')
      }
    }).catch(() => {
      if (active) setProviderStatus('failed')
    })
    return () => { active = false }
  }, [])

  // Restoring from the bfcache after an OAuth redirect must reset `loading`. The
  // Google / GitHub handlers set `loading` true then hand off to
  // `signInWithOAuth`, which navigates away WITHOUT clearing it (only the catch
  // does). Pressing Back restores this page from the bfcache with `loading`
  // frozen true, leaving the submit + OAuth buttons stuck on the spinner.
  // `pageshow` with `persisted` is the bfcache-restore signal; clear the flag so
  // the form is usable again. (A fresh reload re-mounts with loading=false, so
  // the persisted guard keeps this to the restore case.)
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) setLoading(false) }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  // Cloudflare Turnstile token. Passed to Supabase as options.captchaToken on
  // every auth call; Supabase validates it server-side. Tokens are single-use,
  // so the widget is reset after each attempt. When no site key is configured
  // (local dev), the widget renders nothing and the token stays null.
  const { theme } = useTheme()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const hasCaptcha = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)
  const resetCaptcha = () => {
    setCaptchaToken(null)
    turnstileRef.current?.reset()
  }

  // Warm the lazy Supabase client on mount. The login page is the one place a
  // logged-out visitor is about to need auth, so loading the ~53 KB chunk while
  // they fill the form keeps the first sign-in click instant. (useAuth itself
  // skips Supabase for logged-out visitors with no `?code=` callback, so this
  // page is responsible for its own warm-up.)
  useEffect(() => {
    if (isSupabaseConfigured) void getSupabase()
  }, [])

  // Tick the resend cooldown down to zero, then re-enable the resend button.
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = window.setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resendCooldown])

  // Same, for the forgot-password "寄送重設連結" button.
  useEffect(() => {
    if (resetCooldown <= 0) return
    const id = window.setInterval(() => setResetCooldown(s => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resetCooldown])

  // Re-arm the captcha when the reset cooldown ends (transition to 0), so a
  // follow-up "寄送重設連結" has a fresh single-use token. This keeps the
  // challenge hidden DURING the wait (bug 3: no second Turnstile on the normal
  // single send) while still allowing a working resend. Gated on the forgot
  // mode so it never re-challenges the sign-in form.
  const prevResetCooldownRef = useRef(0)
  useEffect(() => {
    if (prevResetCooldownRef.current > 0 && resetCooldown === 0 && isForgotPassword) {
      resetCaptcha()
    }
    prevResetCooldownRef.current = resetCooldown
  }, [resetCooldown, isForgotPassword])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (hasCaptcha && !captchaToken) {
      setError('請完成下方驗證。')
      return
    }

    setLoading(true)

    try {
      const supabase = await getSupabase()
      if (isSignUp) {
        if (!acceptedTerms) {
          setError('註冊前請先同意服務條款與隱私權政策。')
          setLoading(false)
          return
        }

        const validationError = validatePassword(password, confirmPassword)
        if (validationError) {
          setError(validationError)
          setLoading(false)
          return
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken: captchaToken ?? undefined,
            data: { accepted_terms_at: new Date().toISOString() },
            // Land the confirmation link on home with a marker the AuthLinkNotice
            // island reads to show the "you are in" welcome (P0-2). The actual
            // redirect target is gated by the Supabase Site URL / Redirect allow-list.
            emailRedirectTo: `${window.location.origin}/?verified=1`,
          }
        })

        if (error) throw error
        trackEvent('sign_up', { method: 'email' })
        setPassword('')
        setConfirmPassword('')
        // The signup token is now consumed; clear it so a later resend reveals a
        // fresh challenge rather than reusing a dead token (P0-1, bug 1).
        resetCaptcha()
        // Start the resend cooldown immediately: signup just sent the first
        // email, so Supabase's per-email rate limit is already counting. Without
        // this, an instant Resend hits "too many attempts" (bug 2).
        setResendCooldown(RESEND_COOLDOWN_SECONDS)
        setSignUpSuccess(true)
        return
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: captchaToken ?? undefined },
        })

        if (error) throw error
        // Note: `sign_in` is fired centrally from `AuthProvider`
        // for both email and OAuth paths (see `src/hooks/useAuth.ts`), so
        // this branch no longer fires its own event to avoid double-count.
        // `from` is a real Astro document (e.g. `/` or a cert practice route),
        // not necessarily a route in this island's router, so navigate for real.
        window.location.assign(from)
      }
    } catch (err: unknown) {
      // Generic, non-enumerating copy — raw Supabase messages can confirm
      // whether an email is registered.
      setError(authErrorMessage(err, isSignUp ? 'sign-up' : 'sign-in'))
      // Token is single-use; re-arm the widget so the user can retry.
      resetCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setError('')
    setLoading(true)
    try {
      // Recheck before navigation: an administrator may have disabled it since mount.
      const available = await getOAuthProviders()
      setProviders(available)
      if (!available[provider]) {
        setError('此登入方式目前未開放，請使用電子郵件登入。')
        setLoading(false)
        return
      }
      trackEvent('sign_in_initiated', { method: provider })
      const supabase = await getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${from}` },
      })
      if (error) throw error
    } catch {
      setError('無法啟動第三方登入，請稍後再試或使用電子郵件登入。')
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (hasCaptcha && !captchaToken) {
      setError('請完成下方驗證。')
      return
    }

    setLoading(true)

    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        captchaToken: captchaToken ?? undefined,
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error
      setSuccess('請查看電子郵件中的密碼重設連結')
      setResetCooldown(RESEND_COOLDOWN_SECONDS)
      // Do NOT re-arm the captcha here. The token is now consumed, but the
      // button is on its cooldown so no token is needed until it ends -
      // re-challenging now is the visible "Turnstile twice" bug (bug 3). A fresh
      // token is re-armed when the cooldown expires (effect below).
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '發生錯誤，請稍後重試')
      resetCaptcha() // re-arm so the user can retry after a failed send
    } finally {
      setLoading(false)
    }
  }

  // Actually send the resend (token already solved). Separated so both the
  // direct path and the lazy-challenge completion below reuse it (P0-1).
  const sendResend = async () => {
    setError('')
    setResendState('sending')
    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { captchaToken: captchaToken ?? undefined },
      })
      if (error) throw error
      setResendState('sent')
      setResendChallenge(false)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'sign-up'))
      setResendState('idle')
    } finally {
      resetCaptcha() // token is single-use; re-arm for the next attempt
    }
  }

  // Resend the sign-up confirmation email (P0-1, bug 1). The captcha is shown
  // lazily: pressing Resend reveals the Turnstile only when a fresh token is
  // needed, instead of rendering a second widget on the success card upfront.
  const handleResend = () => {
    if (resendCooldown > 0 || resendState === 'sending') return
    if (hasCaptcha && !captchaToken) { setResendChallenge(true); return }
    void sendResend()
  }

  // Lazy-resend completion: once the revealed challenge yields a token, send.
  // Deferred (setTimeout) so the state updates land outside the effect body, and
  // fired only on the challenge/token edge (sendResend is recreated each render,
  // so it is intentionally not a dependency).
  useEffect(() => {
    if (!resendChallenge || !captchaToken) return
    const t = window.setTimeout(() => { void sendResend() }, 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resendChallenge, captchaToken])

  // A signed-in (or still-resolving) visitor is being redirected away by the
  // effect above; show a spinner instead of flashing the form. A logged-out
  // guest resolves synchronously (useAuth skips Supabase with no token), so the
  // form still paints immediately for the conversion path.
  if (authLoading || authedUser) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <LoadingSpinner />
      </div>
    )
  }

  return (
      // The marketing column is centered against the SIGN-IN card height (its own
      // md:min-h below) and the grid is top-aligned, so it stays put when the card
      // grows downward for sign-up - no shift (bug 4). The cards keep their NATURAL
      // sizes (compact sign-in, taller sign-up); login.astro reserves the sign-in
      // height so the footer is stable on load. (owner: natural sizes, not forced-equal.)
      <div className="flex-1 flex items-start justify-center px-4 py-10 md:py-16">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 md:items-start gap-8 lg:gap-12">
          {/* Left Column - Features/Benefits. min-h = the sign-in card height so
              justify-center centers it against that, and it does not move when the
              sign-up card grows past it. */}
          <div className="hidden md:flex flex-col justify-center space-y-6 md:pr-6 lg:pr-8 md:min-h-[718px] xl:min-h-[758px]">
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary mb-3">
                  免費 AWS 證照練習平台
                </h1>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-brand" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-text-primary font-semibold mb-1">{getActiveTotalQuestions().toLocaleString('en-US')}+ 道練習題</h2>
                    <p className="text-text-muted text-sm">涵蓋多項 AWS 證照，依考試指南設計練習內容</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-brand" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-text-primary font-semibold mb-1">完整模擬測驗</h2>
                    <p className="text-text-muted text-sm">透過計時測驗，熟悉正式考試的作答節奏</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-brand" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-text-primary font-semibold mb-1">領域練習</h2>
                    <p className="text-text-muted text-sm">每次專注一個領域，作答後立即查看回饋</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-brand" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-text-primary font-semibold mb-1">學習進度追蹤</h2>
                    <p className="text-text-muted text-sm">掌握各領域成績，隨時回顧過往測驗</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-brand" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-text-primary font-semibold mb-1">完全免費</h2>
                    <p className="text-text-muted text-sm">沒有隱藏費用、付費等級、使用門檻或廣告</p>
                  </div>
                </div>
              </div>
            </div>

          {/* Right Column - Auth Form. Force the elevated shadow tier so the
              card lifts off the page even in dark mode, where the base card
              shadow is `none` and the hairline border alone barely separates
              it from the background (M3 [F]). Inline style beats the utility
              class reliably regardless of Tailwind's generated rule order. */}
          {/* Natural height: sign-in is compact, sign-up grows downward for its
              extra fields. The marketing column (centered against the sign-in
              height) and the footer (login.astro reserves the sign-in height) do
              not shift on load; a click to sign-up expands the card.
              The short terminal states (forgot-password, check-your-email) are
              much shorter than the marketing column, so top-pinning them leaves
              them floating high; `md:self-center` centers ONLY those against the
              marketing height. Sign-in / sign-up stay top-aligned so toggling
              between them does not move the card (bug 4). */}
          <Card padding="lg" className={`flex flex-col${isForgotPassword || signUpSuccess ? ' md:self-center' : ''}`} style={{ boxShadow: 'var(--shadow-card-hover)' }}>

          {signUpSuccess ? (
            <div className="text-center">
              <Mail className="w-12 h-12 text-brand mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-2">請查看你的電子郵件</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                我們已寄送驗證連結至 <span className="text-text-primary font-medium">{email}</span>。若未收到，請查看垃圾郵件匣。
              </p>

              {resendState === 'sent' && (
                <Alert tone="success" role="status" className="mb-4 text-left">
                  已重新寄送連結，若未收到，請查看垃圾郵件匣。
                </Alert>
              )}
              {error && (
                <Alert tone="danger" role="alert" className="mb-4 text-left text-danger">
                  <span id="auth-error">{error}</span>
                </Alert>
              )}

              {/* Lazily-revealed captcha for the resend call (bug 1): shown only
                  after the user presses Resend, when a fresh single-use token is
                  needed - never a second widget upfront. Renders nothing when no
                  site key is configured. Shares turnstileRef because only one of
                  the two card branches is ever mounted at a time. */}
              {resendChallenge && (
                <Turnstile ref={turnstileRef} onToken={setCaptchaToken} theme={theme} />
              )}

              <Button
                onClick={handleResend}
                variant="secondary"
                fullWidth
                loading={resendState === 'sending'}
                loadingText="寄送中…"
                disabled={resendCooldown > 0}
                className="mt-4 mb-3"
              >
                {resendCooldown > 0 ? `${resendCooldown} 秒後可重新寄送` : '重新寄送驗證郵件'}
              </Button>

              <button
                type="button"
                onClick={() => { setSignUpSuccess(false); setIsSignUp(true); setError(''); setResendState('idle'); setResendCooldown(0); setResendChallenge(false) }}
                className="block w-full text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
              >
                電子郵件有誤？重新編輯
              </button>

              <Button
                onClick={() => { setSignUpSuccess(false); setIsSignUp(false); setError(''); setResendState('idle'); setResendCooldown(0); setResendChallenge(false) }}
                variant="ghost"
                fullWidth
              >
                返回登入
              </Button>
            </div>
          ) : (
          <>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-2">
              {isForgotPassword ? '重設密碼' : isSignUp ? '註冊' : '登入'}
            </h2>
            {isForgotPassword && (
              <p className="text-text-muted text-sm">
                我們會寄送重設密碼連結給你
              </p>
            )}
          </div>

          <form onSubmit={isForgotPassword ? handlePasswordReset : handleEmailAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
              電子郵件
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              hasError={Boolean(error)}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'auth-error' : undefined}
              placeholder="you@example.com"
            />
          </div>

          {!isForgotPassword && (
            <>
              <div>
                <div className="flex items-baseline justify-between mb-2 gap-3">
                  <label htmlFor="password" className="block text-sm font-medium text-text-primary">
                    密碼
                  </label>
                  {/* Forgot-password lives next to the field it relates to (the
                      conventional spot), not orphaned below the submit button
                      (M3 [D]). Sign-in mode only. */}
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); setSuccess('') }}
                      className="text-sm text-text-muted hover:text-text-primary transition-colors"
                    >
                      忘記密碼？
                    </button>
                  )}
                </div>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={setPassword}
                  required
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                {isSignUp && <PasswordStrengthMeter password={password} />}
              </div>

              {isSignUp && (
                <>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-2">
                    確認密碼
                  </label>
                  <PasswordInput
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    required
                    autoComplete="new-password"
                    placeholder="再次輸入密碼"
                  />
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    id="acceptedTerms"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-text-muted/30 accent-brand flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  />
                  <label htmlFor="acceptedTerms" className="text-text-muted text-sm leading-relaxed cursor-pointer">
                    我同意{' '}
                    <Link to="/terms" className="text-text-primary hover:underline" target="_blank" rel="noopener noreferrer">服務條款</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="text-text-primary hover:underline" target="_blank" rel="noopener noreferrer">隱私權政策</Link>
                  </label>
                </div>
                </>
              )}
            </>
          )}

          {success && (
            <Alert tone="success" role="status">
              {success}
            </Alert>
          )}

          {/* Cloudflare Turnstile bot challenge. Renders nothing when no site
              key is configured (local dev). The token is validated by Supabase
              server-side on submit. */}
          <Turnstile ref={turnstileRef} onToken={setCaptchaToken} theme={theme} />

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            loadingText="載入中…"
            disabled={
              // NOT gated on the Turnstile token: the security boundary is
              // Supabase verifying the token server-side, so disabling the
              // primary CTA here only made it look broken on load. The submit
              // handlers validate the captcha and show an inline message if the
              // challenge isn't solved. (Sign-up form requirements still gate,
              // since those have visible invalid feedback.)
              (isSignUp && !acceptedTerms) ||
              (isSignUp && !isPasswordStrongEnough(password)) ||
              (isSignUp && password !== confirmPassword) ||
              (isForgotPassword && resetCooldown > 0)
            }
          >
            {isForgotPassword
              ? (resetCooldown > 0 ? `Resend in ${resetCooldown}s` : '寄送重設連結')
              : isSignUp ? '註冊' : '登入'}
          </Button>

          {/* Error rendered below the submit button so it never shoves the
              Turnstile + CTA down when it appears (P4 CLS fix). */}
          {error && (
            <Alert tone="danger" role="alert" className="text-danger">
              <span id="auth-error">{error}</span>
            </Alert>
          )}
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              if (isForgotPassword) {
                setIsForgotPassword(false)
              } else {
                setIsSignUp(!isSignUp)
              }
              setError('')
              setSuccess('')
              setConfirmPassword('')
              setAcceptedTerms(false)
            }}
            className="text-text-muted hover:text-text-primary transition-colors text-sm"
          >
            {isForgotPassword 
              ? '返回登入'
              : isSignUp 
              ? '已經有帳戶？登入'
              : "還沒有帳戶？註冊"}
          </button>

          {!isForgotPassword && (
            <>
              {providerStatus === 'loading' && <p role="status" className="mt-4 text-sm text-text-muted">正在確認可用的登入方式…</p>}
              {providerStatus === 'failed' && <p role="status" className="mt-4 text-sm text-text-muted">暫時無法確認第三方登入，請稍後重新整理或使用電子郵件登入。</p>}
              {providerStatus === 'ready' && !providers.google && !providers.github && <p className="mt-4 text-sm text-text-muted">目前僅提供電子郵件登入。</p>}
              {(providers.google || providers.github) && (
              <div className="my-4 flex items-center">
                <div className="flex-1 border-t border-text-muted/30"></div>
                <span className="px-4 text-text-muted text-sm">或</span>
                <div className="flex-1 border-t border-text-muted/30"></div>
              </div>
              )}

              {providers.google && (
              <Button
                type="button"
                onClick={() => handleOAuthSignIn('google')}
                disabled={loading}
                variant="secondary"
                fullWidth
                leftIcon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                  </svg>
                }
                className="mb-3"
              >
                使用 Google 繼續
              </Button>
              )}

              {providers.github && (
              <Button
                type="button"
                onClick={() => handleOAuthSignIn('github')}
                disabled={loading}
                variant="secondary"
                fullWidth
                leftIcon={<Github className="w-5 h-5" />}
                className="mb-3"
              >
                使用 GitHub 繼續
              </Button>
              )}

              {/* Quieter than the bordered OAuth buttons: on the login page the
                  goal is account creation, so the guest escape hatch shouldn't
                  carry equal weight. Still a full-width tap target + clearly
                  visible (the product's 'free, no signup' promise depends on it). */}
              <Button
                type="button"
                onClick={() => window.location.assign(from)}
                variant="ghost"
                fullWidth
              >
                以訪客身分繼續
              </Button>

            </>
          )}
        </div>
          </>
          )}
          </Card>
        </div>
    </div>
  )
}
