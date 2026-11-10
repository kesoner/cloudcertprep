import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('allows guest modules to load without Supabase and rejects only cloud actions', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  const { isSupabaseConfigured, getSupabase } = await import('./supabase')
  expect(isSupabaseConfigured).toBe(false)
  await expect(getSupabase()).rejects.toThrow('Missing Supabase environment variables')
})
