import { afterEach, describe, expect, it } from 'vitest'
import { getWrongAnswers, recordWrongAnswer, resolveWrongAnswer } from './wrongAnswers'

function makeStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
    clear: () => { values.clear() },
    key: () => null,
    get length() { return values.size },
  }
}

function setStorage(value: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value,
    writable: true,
    configurable: true,
  })
}

afterEach(() => setStorage(undefined))

describe('wrong answer storage', () => {
  it('stores one entry per certification and question, keeping the latest answer', () => {
    setStorage(makeStorage())

    recordWrongAnswer('clf-c02', 'q-1', 'A', 10)
    recordWrongAnswer('clf-c02', 'q-1', 'B', 20)
    recordWrongAnswer('aif-c01', 'q-1', 'C', 30)

    expect(getWrongAnswers('clf-c02')).toEqual([
      { certCode: 'clf-c02', questionId: 'q-1', userAnswer: 'B', lastMissedAt: 20 },
    ])
    expect(getWrongAnswers('aif-c01')).toEqual([
      { certCode: 'aif-c01', questionId: 'q-1', userAnswer: 'C', lastMissedAt: 30 },
    ])
  })

  it('orders entries by most recent miss', () => {
    setStorage(makeStorage())

    recordWrongAnswer('clf-c02', 'older', 'A', 10)
    recordWrongAnswer('clf-c02', 'newer', 'B', 20)

    expect(getWrongAnswers('clf-c02').map(entry => entry.questionId)).toEqual(['newer', 'older'])
  })

  it('removes only the resolved question in the selected certification', () => {
    setStorage(makeStorage())

    recordWrongAnswer('clf-c02', 'q-1', 'A', 10)
    recordWrongAnswer('clf-c02', 'q-2', 'B', 20)
    recordWrongAnswer('aif-c01', 'q-1', 'C', 30)
    resolveWrongAnswer('clf-c02', 'q-1')

    expect(getWrongAnswers('clf-c02').map(entry => entry.questionId)).toEqual(['q-2'])
    expect(getWrongAnswers('aif-c01').map(entry => entry.questionId)).toEqual(['q-1'])
  })

  it('degrades safely when storage is unavailable', () => {
    expect(recordWrongAnswer('clf-c02', 'q-1', 'A', 10)).toBe(false)
    expect(getWrongAnswers('clf-c02')).toEqual([])
  })
})
