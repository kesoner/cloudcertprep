/** Resolve the fork's origin without treating upstream as a deployment default.
 * @param {string | undefined} value
 */
export function resolveSiteOrigin(value) {
  if (!value?.trim()) return 'http://localhost:4321'
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_SITE_URL must be an HTTP(S) origin without credentials, path, query or hash.')
  }
  return url.origin
}
