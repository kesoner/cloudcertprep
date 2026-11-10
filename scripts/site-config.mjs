import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolveSiteOrigin } from '../src/lib/site-origin.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const env = loadEnv(process.env.NODE_ENV || 'production', root, 'PUBLIC_')
if (process.argv.includes('build') && !env.PUBLIC_SITE_URL?.trim() && env.PUBLIC_NOINDEX !== 'true') {
  throw new Error('Set PUBLIC_SITE_URL before a production build, or use PUBLIC_NOINDEX=true for a local preview.')
}
export const SITE_URL = resolveSiteOrigin(env.PUBLIC_SITE_URL)
