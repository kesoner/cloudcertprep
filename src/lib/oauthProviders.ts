export type OAuthProvider = 'google' | 'github'
export type OAuthProviders = Record<OAuthProvider, boolean>

/** Public auth settings are the source of truth, including after a deploy. */
export async function getOAuthProviders(): Promise<OAuthProviders> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration')
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Unable to load authentication providers')
  const settings = await response.json()
  return {
    google: settings?.external?.google === true,
    github: settings?.external?.github === true,
  }
}
