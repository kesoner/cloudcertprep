import { storageGet, storageSet } from './storage'

const STORAGE_KEY = 'cloudcertprep_wrong_answers_v1'
const REVISION_KEY = 'cloudcertprep_wrong_answers_revision_v1'
const CHANGE_EVENT = 'cloudcertprep_wrong_answers_changed'

export function getWrongAnswersRevision(): string {
  return storageGet(REVISION_KEY, '')
}

function notifyChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Observe changes in this document and in other tabs on the same origin. */
export function subscribeWrongAnswers(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === REVISION_KEY || event.key === null) onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Delete the device-scoped mistake book when account deletion is confirmed. */
export function clearWrongAnswers(): void {
  // A new revision invalidates existing redo queues, even when the book is empty.
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* Storage may be unavailable. */ }
  // Free the book's space first so a full quota cannot block invalidation.
  storageSet(REVISION_KEY, `${Date.now()}-${Math.random()}`)
  notifyChange()
}

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
  const saved = storageSet(STORAGE_KEY, JSON.stringify(entries))
  if (saved) notifyChange()
  return saved
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
  expectedRevision?: string,
): boolean {
  if (expectedRevision !== undefined && expectedRevision !== getWrongAnswersRevision()) return false
  const entries = readEntries().filter(
    entry => entry.certCode !== certCode || entry.questionId !== questionId,
  )

  return writeEntries([...entries, { certCode, questionId, userAnswer, lastMissedAt: now }])
}

/** Remove a question once the learner answers it correctly. */
export function resolveWrongAnswer(certCode: string, questionId: string, expectedRevision?: string): boolean {
  if (expectedRevision !== undefined && expectedRevision !== getWrongAnswersRevision()) return false
  return writeEntries(readEntries().filter(
    entry => entry.certCode !== certCode || entry.questionId !== questionId,
  ))
}
