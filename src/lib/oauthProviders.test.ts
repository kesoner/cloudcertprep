import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getOAuthProviders } from './oauthProviders'

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('accepts only explicitly enabled providers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ external: { google: true, github: 'true' } }))))
  await expect(getOAuthProviders()).resolves.toEqual({ google: true, github: false })
})

it('treats missing provider settings as disabled', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
  await expect(getOAuthProviders()).resolves.toEqual({ google: false, github: false })
})

it('rejects unavailable settings rather than assuming OAuth works', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
  await expect(getOAuthProviders()).rejects.toThrow('Unable to load authentication providers')
})

it('does not request settings when the project is unconfigured', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(getOAuthProviders()).rejects.toThrow('Missing Supabase configuration')
  expect(fetchMock).not.toHaveBeenCalled()
})
