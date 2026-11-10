import { useEffect, useMemo, useRef, useState } from 'react'
import { useCert } from '../hooks/useCert'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { useSEO } from '../hooks/useSEO'
import { loadAllQuestions } from '../data/questions'
import type { OptionKey, Question } from '../types'
import { getWrongAnswers, getWrongAnswersRevision, subscribeWrongAnswers, recordWrongAnswer, resolveWrongAnswer, type WrongAnswerEntry } from '../lib/wrongAnswers'
import { correctAnswerFor, isAnswerCorrect } from '../lib/scoring'
import { encodeAnswerForDb, getQuestionType, shuffleAndMapQuestions, toggleMultiAnswer, type OptionKeyMap } from '../lib/utils'
import { AnswerButton } from '../components/AnswerButton'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { MatchingInput } from '../components/MatchingInput'
import { OrderingInput } from '../components/OrderingInput'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { Alert } from '../components/Alert'
import { BookOpen, Check, RotateCcw } from 'lucide-react'

type Screen = 'review' | 'redo' | 'complete'

interface StoredQuestion {
  entry: WrongAnswerEntry
  question: Question
}

export function WrongAnswers() {
  const cert = useCert()
  const { goHome } = useCertNavigate()
  const [entries, setEntries] = useState<WrongAnswerEntry[]>([])
  const [questionBank, setQuestionBank] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('review')
  const [reviewIndex, setReviewIndex] = useState(0)
  const [redoQuestions, setRedoQuestions] = useState<Question[]>([])
  const [redoKeyMaps, setRedoKeyMaps] = useState<Map<string, OptionKeyMap>>(new Map())
  const [redoIndex, setRedoIndex] = useState(0)
  const [redoAnswer, setRedoAnswer] = useState<string | string[] | null>(null)
  const [redoCorrect, setRedoCorrect] = useState<boolean | null>(null)
  const [answerWarning, setAnswerWarning] = useState<string | null>(null)
  const observedRevision = useRef(getWrongAnswersRevision())
  const [redoRevision, setRedoRevision] = useState(getWrongAnswersRevision)

  useSEO({
    title: `${cert.shortName} 錯題本 · CloudCertPrep-zh`,
    description: `查看與重做 ${cert.shortName} 錯題，紀錄儲存在目前瀏覽器。`,
    canonical: null,
  })

  useEffect(() => {
    let cancelled = false
    const unsubscribe = subscribeWrongAnswers(() => {
      setEntries(getWrongAnswers(cert.code))
      const revision = getWrongAnswersRevision()
      if (revision !== observedRevision.current) {
        observedRevision.current = revision
        setScreen('review')
        setReviewIndex(0)
        setRedoQuestions([])
        setRedoIndex(0)
        setRedoKeyMaps(new Map())
        setRedoAnswer(null)
        setRedoCorrect(null)
        setAnswerWarning(null)
      }
    })

    void (async () => {
      setLoading(true)
      setLoadError(null)
      setEntries(getWrongAnswers(cert.code))
      try {
        const questions = await loadAllQuestions(cert.code)
        if (!cancelled) setQuestionBank(questions)
      } catch {
        if (!cancelled) setLoadError('無法載入題庫，請重新整理後再試。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true; unsubscribe() }
  }, [cert.code])

  const storedQuestions = useMemo<StoredQuestion[]>(() => {
    const byId = new Map(questionBank.map(question => [question.id, question]))
    return entries.flatMap(entry => {
      const question = byId.get(entry.questionId)
      return question ? [{ entry, question }] : []
    })
  }, [entries, questionBank])

  const currentReview = storedQuestions[reviewIndex]
  const currentRedo = redoQuestions[redoIndex]
  const currentType = currentRedo ? getQuestionType(currentRedo) : 'single'

  function refreshEntries() {
    const next = getWrongAnswers(cert.code)
    setEntries(next)
    setReviewIndex(index => Math.min(index, Math.max(0, next.length - 1)))
  }

  function startRedo() {
    const revision = getWrongAnswersRevision()
    const currentIds = new Set(getWrongAnswers(cert.code).map(entry => entry.questionId))
    const queue = storedQuestions.filter(item => currentIds.has(item.question.id))
    if (queue.length === 0) {
      refreshEntries()
      setScreen('review')
      return
    }
    setRedoRevision(revision)
    const { questions, keyMaps } = shuffleAndMapQuestions(queue.map(item => item.question))
    setRedoQuestions(questions)
    setRedoKeyMaps(keyMaps)
    setRedoIndex(0)
    setRedoAnswer(null)
    setRedoCorrect(null)
    setAnswerWarning(null)
    setScreen('redo')
    window.scrollTo(0, 0)
  }

  function gradeRedo(answer: string | string[]) {
    if (!currentRedo) return
    if (redoRevision !== getWrongAnswersRevision()) {
      refreshEntries()
      setRedoQuestions([])
      setRedoKeyMaps(new Map())
      setRedoAnswer(null)
      setRedoCorrect(null)
      setAnswerWarning(null)
      setScreen('review')
      return
    }
    const type = getQuestionType(currentRedo)
    const correct = isAnswerCorrect(answer, correctAnswerFor(currentRedo), type)
    const keyMap = redoKeyMaps.get(currentRedo.id) ?? {}
    const storedAnswer = encodeAnswerForDb(answer, keyMap, type)

    if (correct) {
      resolveWrongAnswer(cert.code, currentRedo.id, redoRevision)
    } else {
      recordWrongAnswer(cert.code, currentRedo.id, storedAnswer, undefined, redoRevision)
    }

    refreshEntries()
    setRedoAnswer(answer)
    setRedoCorrect(correct)
    setAnswerWarning(null)
  }

  function selectSingleAnswer(answer: string) {
    if (redoCorrect !== null) return
    setRedoAnswer(answer)
    gradeRedo(answer)
  }

  function submitRedoAnswer() {
    if (!currentRedo || redoCorrect !== null) return
    const optionCount = Object.values(currentRedo.options).filter(Boolean).length
    const answer = redoAnswer ?? []

    if (currentType === 'multi') {
      const required = Array.isArray(currentRedo.answer) ? currentRedo.answer.length : 1
      if (!Array.isArray(answer) || answer.length !== required) {
        setAnswerWarning(`送出前請選擇 ${required} 個答案。`)
        return
      }
    }

    if (currentType === 'ordering' && (!Array.isArray(answer) || answer.length === 0)) {
      setAnswerWarning('送出前請先調整步驟順序。')
      return
    }

    if (currentType === 'matching' && (!Array.isArray(answer) || answer.length !== optionCount)) {
      setAnswerWarning(`送出前請完成全部 ${optionCount} 個配對。`)
      return
    }

    gradeRedo(answer)
  }

  function nextRedoQuestion() {
    if (redoIndex >= redoQuestions.length - 1) {
      setScreen('complete')
      window.scrollTo(0, 0)
      return
    }
    setRedoIndex(index => index + 1)
    setRedoAnswer(null)
    setRedoCorrect(null)
    setAnswerWarning(null)
    window.scrollTo(0, 0)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center p-8 min-h-[70vh]"><LoadingSpinner text="正在載入錯題本…" /></div>
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-8"><div className="max-w-3xl mx-auto"><Alert tone="danger">{loadError}</Alert></div></div>
    )
  }

  if (screen === 'complete') {
    const remaining = getWrongAnswers(cert.code).length
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card padding="lg" className="text-center">
            <Check className="w-10 h-10 mx-auto text-success mb-4" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-text-primary">本次錯題重做完成</h1>
            <p className="mt-2 text-text-muted">
              {remaining === 0
                ? '做得好！這組錯題已全部答對。'
                : `還有 ${remaining} 道錯題需要再複習。`}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button onClick={() => { refreshEntries(); setScreen('review') }} variant="secondary" className="flex-1">
                查看錯題本
              </Button>
              <Button onClick={goHome} variant="primary" className="flex-1">
                返回證照總覽
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (screen === 'redo' && currentRedo) {
    const selectedAnswers = Array.isArray(redoAnswer) ? redoAnswer : []
    const requiredAnswers = Array.isArray(currentRedo.answer) ? currentRedo.answer.length : 1

    return (
      <div className="p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <p className="font-mono text-xs text-text-muted">錯題重做</p>
              <h1 className="text-xl md:text-2xl font-semibold text-text-primary">第 {redoIndex + 1} 題，共 {redoQuestions.length} 題</h1>
            </div>
            <Button onClick={() => { refreshEntries(); setScreen('review') }} variant="secondary" size="sm">
              結束重做
            </Button>
          </div>

          {redoCorrect !== null ? (
            <>
              <QuestionReviewCard
                question={currentRedo}
                userAnswer={redoAnswer ?? ''}
                isCorrect={redoCorrect}
                questionNumber={redoIndex + 1}
                totalQuestions={redoQuestions.length}
                certCode={cert.code}
              />
              <Button onClick={nextRedoQuestion} variant="primary" fullWidth className="mt-4">
                {redoIndex === redoQuestions.length - 1 ? '完成重做' : '下一題'}
              </Button>
            </>
          ) : (
            <Card padding="lg">
              <div className="mb-4">
                <span className="font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-bg-dark border border-border-hairline text-text-muted">
                  {cert.domains.find(domain => domain.id === currentRedo.domainId)?.nameZh ?? cert.domains.find(domain => domain.id === currentRedo.domainId)?.name ?? `領域 ${currentRedo.domainId}`}
                </span>
              </div>
              <h2 lang="en" className="text-base md:text-lg text-text-primary mb-5">{currentRedo.question}</h2>

              <div className="space-y-2.5">
                {currentType === 'ordering' ? (
                  <OrderingInput
                    mode="input"
                    options={currentRedo.options}
                    value={Array.isArray(redoAnswer) ? redoAnswer : null}
                    onChange={order => { setRedoAnswer(order); setAnswerWarning(null) }}
                  />
                ) : currentType === 'matching' ? (
                  <MatchingInput
                    mode="input"
                    options={currentRedo.options}
                    targets={currentRedo.targets ?? {}}
                    value={Array.isArray(redoAnswer) ? redoAnswer : null}
                    onChange={tokens => { setRedoAnswer(tokens); setAnswerWarning(null) }}
                  />
                ) : (
                  Object.entries(currentRedo.options).map(([key, value]) => {
                    const selected = currentType === 'multi'
                      ? selectedAnswers.includes(key)
                      : redoAnswer === key
                    const limitReached = currentType === 'multi' && !selected && selectedAnswers.length >= requiredAnswers
                    return (
                      <AnswerButton
                        key={key}
                        label={key as OptionKey}
                        text={value}
                        state={selected ? 'selected' : 'default'}
                        disabled={limitReached}
                        onClick={() => {
                          if (currentType === 'multi') {
                            setRedoAnswer(toggleMultiAnswer(selectedAnswers, key, requiredAnswers))
                            setAnswerWarning(null)
                          } else {
                            selectSingleAnswer(key)
                          }
                        }}
                      />
                    )
                  })
                )}
              </div>

              {answerWarning && <Alert tone="warning" role="alert" className="mt-4">{answerWarning}</Alert>}
              {currentType !== 'single' && (
                <Button onClick={submitRedoAnswer} variant="primary" fullWidth className="mt-4">
                  送出答案
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>
    )
  }

  if (storedQuestions.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card padding="lg" className="text-center">
            <BookOpen className="w-10 h-10 mx-auto text-text-muted mb-4" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-text-primary">目前沒有錯題</h1>
            <p className="mt-2 text-text-muted">答錯的題目會自動儲存在這個瀏覽器，讓你查看解析並再次練習。不需登入，題目與解析保留英文。</p>
            <Button onClick={goHome} variant="primary" className="mt-6">開始練習</Button>
          </Card>
        </div>
      </div>
    )
  }

  const missingCount = entries.length - storedQuestions.length
  const selectedReview = currentReview ?? storedQuestions[0]

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
          <div>
            <p className="font-mono text-xs text-text-muted">僅儲存在目前瀏覽器</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-text-primary">錯題本</h1>
            <p className="mt-1 text-text-muted">先閱讀英文解析釐清觀念，再重做這組錯題。答對的題目會自動移出錯題本。清除瀏覽器資料會刪除紀錄，資料不會跨裝置同步。</p>
          </div>
          <Button onClick={startRedo} variant="primary" className="shrink-0 whitespace-nowrap" leftIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}>
            重做 {storedQuestions.length} 道錯題
          </Button>
        </div>

        {missingCount > 0 && (
          <Alert tone="warning" className="mb-4">有 {missingCount} 道已記錄的題目不在目前題庫中。</Alert>
        )}

        <Card padding="sm" className="mb-4">
          <div className="flex flex-wrap justify-center gap-1.5">
            {storedQuestions.map((item, index) => (
              <button
                key={item.entry.questionId}
                onClick={() => setReviewIndex(index)}
                aria-label={`查看第 ${index + 1} 道錯題`}
                aria-current={selectedReview.entry.questionId === item.entry.questionId ? 'true' : undefined}
                className={`w-9 h-9 rounded-lg border text-sm font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  selectedReview.entry.questionId === item.entry.questionId
                    ? 'border-danger bg-danger/10 text-danger'
                    : 'border-border-hairline bg-bg-dark text-text-muted hover:text-text-primary hover:border-text-muted/50'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </Card>

        <QuestionReviewCard
          question={selectedReview.question}
          userAnswer={selectedReview.entry.userAnswer}
          isCorrect={false}
          questionNumber={reviewIndex + 1}
          totalQuestions={storedQuestions.length}
          certCode={cert.code}
        />

        <div className="mt-4 flex gap-3">
          <Button onClick={() => setReviewIndex(index => Math.max(0, index - 1))} disabled={reviewIndex === 0} variant="secondary" className="flex-1">
            上一題
          </Button>
          <Button onClick={() => setReviewIndex(index => Math.min(storedQuestions.length - 1, index + 1))} disabled={reviewIndex === storedQuestions.length - 1} variant="secondary" className="flex-1">
            下一題
          </Button>
        </div>
      </div>
    </div>
  )
}
