import { afterEach, describe, it, expect, vi } from 'vitest'
import { buildPassShareText } from './shareResult'
import { SITE_URL } from './seo-data'

afterEach(() => vi.unstubAllGlobals())

describe('buildPassShareText', () => {
  it('shares the current browser origin on alternate deployments', () => {
    vi.stubGlobal('window', { location: { origin: 'https://preview.example.com' } })
    const shared = buildPassShareText({ certShortName: 'CLF-C02', scaledScore: 830, correctCount: 52, totalQuestions: 65 })
    expect(shared).toContain('Free + open source: https://preview.example.com')
    expect(shared).not.toContain('www.cloudcertprep.io')
  })
  const text = buildPassShareText({
    certShortName: 'CLF-C02',
    scaledScore: 830,
    correctCount: 52,
    totalQuestions: 65,
  })

  it('matches the findings-doc share shape', () => {
    expect(text).toBe(
      `I scored 830/1000 on the CLF-C02 practice exam at CloudCertPrep-zh (52/65 correct). Free + open source: ${SITE_URL}`
    )
  })

  it('links the bare site URL with no score data in params', () => {
    expect(text).toContain(SITE_URL)
    expect(text).not.toContain('?')
  })
})
