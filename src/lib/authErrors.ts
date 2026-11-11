/**
 * Map Supabase auth errors to non-enumerating user copy.
 *
 * Raw `error.message` strings from the auth endpoints can confirm whether an
 * email is registered ("Invalid login credentials" vs "Email not confirmed";
 * "User already registered" on sign-up). Sign-in and sign-up therefore show
 * only copy that reads the same for existing and unknown accounts. Errors
 * that carry no account information (captcha, rate limits, network) keep
 * actionable copy. Password reset is already non-enumerating: it always
 * reports "Check your email for a reset link".
 *
 * Known trade-off: a registered-but-unconfirmed user who signs in with the
 * correct password sees the generic sign-in copy instead of "Email not
 * confirmed". They were already told to confirm on the sign-up success
 * screen, and revealing confirmation state would confirm the account exists.
 */

export type AuthMode = 'sign-in' | 'sign-up'

const GENERIC_COPY: Record<AuthMode, string> = {
  'sign-in':
    '電子郵件或密碼有誤。若使用第三方註冊，請使用已開放的對應登入方式。',
  'sign-up':
    '無法使用這些資料建立帳戶。若已有帳戶，請登入或使用「忘記密碼？」。',
}

export function authErrorMessage(err: unknown, mode: AuthMode): string {
  const raw = err instanceof Error ? err.message : ''
  const msg = raw.toLowerCase()

  if (msg.includes('captcha')) {
    return '驗證未通過，請完成驗證後再試一次。'
  }
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('security purposes')) {
    return '嘗試次數過多，請稍候一分鐘再試。'
  }
  // fetch() rejects with TypeError("Failed to fetch") / supabase-js wraps it.
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return '網路連線發生問題，請檢查連線後再試一次。'
  }
  // Server-side password policy feedback names no account state; keep it so
  // the user can actually fix the password (client validation runs first).
  if (mode === 'sign-up' && msg.startsWith('password')) {
    return raw
  }
  return GENERIC_COPY[mode]
}
