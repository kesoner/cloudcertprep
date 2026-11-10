import { describe, expect, it } from 'vitest'
import { resolveSiteOrigin } from './site-origin.mjs'

describe('fork origin configuration', () => {
  it('uses localhost for development instead of upstream', () => {
    expect(resolveSiteOrigin(undefined)).toBe('http://localhost:4321')
    expect(resolveSiteOrigin('')).toBe('http://localhost:4321')
  })
  it('accepts a configured fork origin and removes its trailing slash', () => {
    expect(resolveSiteOrigin('https://study.example.com/')).toBe('https://study.example.com')
    expect(resolveSiteOrigin('http://localhost:4423')).toBe('http://localhost:4423')
  })
  it.each(['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/fork', 'https://example.com/?x=1', 'https://example.com/#x'])('rejects an invalid origin: %s', value => {
    expect(() => resolveSiteOrigin(value)).toThrow()
  })
})
