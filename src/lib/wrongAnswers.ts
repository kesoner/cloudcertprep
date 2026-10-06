import { storageGet, storageSet } from './storage'

const STORAGE_KEY = 'cloudcertprep_wrong_answers_v1'

export interface WrongAnswerEntry {
  certCode: string
  questionId: string
  userAnswer: string
  lastMissedAt: number
}

function readEntries(): WrongAnswerEntry[] {
  try {
    const parsed: unknown = JSON.parse(storageGet(STORAGE_KEY, '[]'))
    if (!Array.isArray(parsed)) return []

    return parsed.filter((entry): entry is WrongAnswerEntry => (
      typeof entry === 'object' && entry !== null
      && typeof entry.certCode === 'string'
      && typeof entry.questionId === 'string'
      && typeof entry.userAnswer === 'string'
      && typeof entry.lastMissedAt === 'number'
    ))
  } catch {
    return []
  }
}

function writeEntries(entries: WrongAnswerEntry[]): boolean {
  return storageSet(STORAGE_KEY, JSON.stringify(entries))
}

/** Return the current certification's misses, newest first. */
export function getWrongAnswers(certCode: string): WrongAnswerEntry[] {
  return readEntries()
    .filter(entry => entry.certCode === certCode)
    .sort((a, b) => b.lastMissedAt - a.lastMissedAt)
}

/** Add or refresh a question after an incorrect response. */
export function recordWrongAnswer(
  certCode: string,
  questionId: string,
  userAnswer: string,
  now = Date.now(),
): boolean {
  const entries = readEntries().filter(
    entry => entry.certCode !== certCode || entry.questionId !== questionId,
  )

  return writeEntries([...entries, { certCode, questionId, userAnswer, lastMissedAt: now }])
}

/** Remove a question once the learner answers it correctly. */
export function resolveWrongAnswer(certCode: string, questionId: string): boolean {
  return writeEntries(readEntries().filter(
    entry => entry.certCode !== certCode || entry.questionId !== questionId,
  ))
}
