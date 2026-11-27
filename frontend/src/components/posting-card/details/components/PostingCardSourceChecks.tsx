import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import {
  getPostingSourceChecks,
  PostingSourceCheckUnavailableError,
  PostingSourceCheckUncertainError,
  recordPostingSourceCheck,
} from '../../../../postings/api/postings'
import { postingSourceCheckLabels } from '../../../../postings/sourceCheckLabels'
import type { PostingSourceCheck, PostingSourceCheckResult, RecordPostingSourceCheckRequest } from '../../../../postings/types/postingCard'

type Recovery = { request: RecordPostingSourceCheckRequest; retryAllowed: boolean }
type Feedback = { kind: 'success' | 'error'; message: string }

export function PostingCardSourceChecks({
  cardKey,
  isSourceOpen,
  canRecord,
  onSourceUnavailable,
}: {
  cardKey: string
  isSourceOpen: boolean
  canRecord: boolean
  onSourceUnavailable: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [history, setHistory] = useState<PostingSourceCheck[] | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [readError, setReadError] = useState(false)
  const [result, setResult] = useState<PostingSourceCheckResult | ''>('')
  const [isSaving, setIsSaving] = useState(false)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const readRequest = useRef<AbortController>(null)
  const saving = useRef(false)
  const active = useRef(false)
  const summary = useRef<HTMLElement>(null)
  const recordButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      readRequest.current?.abort()
    }
  }, [])

  function finishSave() {
    setResult('')
    setRecovery(null)
    setFeedback({ kind: 'success', message: 'Source check recorded.' })
  }

  async function readHistory(verify?: RecordPostingSourceCheckRequest, trigger?: HTMLElement) {
    if (readRequest.current || saving.current) return
    const controller = new AbortController()
    readRequest.current = controller
    setIsReading(true)
    if (recovery?.retryAllowed) setRecovery({ request: recovery.request, retryAllowed: false })

    try {
      const checks = await getPostingSourceChecks(cardKey, controller.signal)
      if (controller.signal.aborted) return
      setHistory(checks)
      setReadError(false)
      if (verify) {
        const existing = checks.find((check) => check.check_id === verify.check_id)
        if (existing?.result === verify.result) {
          finishSave()
        } else if (existing) {
          setRecovery(null)
          setFeedback({ kind: 'error', message: 'A different result is already recorded for this check.' })
        } else {
          setRecovery({ request: verify, retryAllowed: true })
          if (trigger && trigger === document.activeElement && recordButton.current) {
            recordButton.current.focus({ preventScroll: true })
            return
          }
        }
      }
      if (trigger && trigger === document.activeElement) summary.current?.focus({ preventScroll: true })
    } catch {
      if (!controller.signal.aborted) setReadError(true)
    } finally {
      if (!controller.signal.aborted) {
        readRequest.current = null
        setIsReading(false)
      }
    }
  }

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const open = event.currentTarget.open
    setIsOpen(open)
    if (open && isSourceOpen) {
      void readHistory()
    } else {
      readRequest.current?.abort()
      readRequest.current = null
      setIsReading(false)
    }
  }

  const canSubmit = canRecord && result !== '' && history !== null && !readError && !isReading && !isSaving &&
    (recovery === null || recovery.retryAllowed)

  async function recordCheck() {
    if (!canSubmit || readRequest.current || saving.current) return
    const request = recovery?.request ?? { check_id: crypto.randomUUID(), result }
    saving.current = true
    setIsSaving(true)
    setRecovery(null)
    setFeedback(null)

    try {
      const saved = await recordPostingSourceCheck(cardKey, request)
      if (!active.current) return
      setHistory((current) => [
        saved,
        ...(current ?? []).filter((check) => check.check_id !== saved.check_id),
      ].sort((left, right) => Date.parse(right.recorded_at) - Date.parse(left.recorded_at)))
      finishSave()
      if (document.activeElement === recordButton.current) summary.current?.focus({ preventScroll: true })
    } catch (error) {
      if (!active.current) return
      if (error instanceof PostingSourceCheckUncertainError) {
        setRecovery({ request, retryAllowed: false })
      } else {
        if (error instanceof PostingSourceCheckUnavailableError) {
          if (document.activeElement === recordButton.current) summary.current?.focus({ preventScroll: true })
          onSourceUnavailable()
        }
        setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not record the source check.' })
      }
    } finally {
      saving.current = false
      if (active.current) setIsSaving(false)
    }
  }

  return (
    <details className="posting-card-import-source__checks" open={isSourceOpen && isOpen} onToggle={handleToggle}>
      <summary ref={summary}>Source checks</summary>
      {isSourceOpen && isOpen && <div className="posting-card-import-source__check-history">
        <div role="status">
          {(isReading || (history === null && !readError)) && <p>Reading source checks…</p>}
          {history?.length === 0 && !isReading && !readError && <p>No source checks recorded.</p>}
        </div>
        {readError && !isReading && <p role="alert">Could not load source checks.</p>}
        {readError && recovery === null && <button
          type="button"
          aria-disabled={isReading}
          onClick={(event) => void readHistory(undefined, event.currentTarget)}
        >Retry reading source checks</button>}
        {history && history.length > 0 && <ul aria-label="Recorded source checks">
          {history.map((check) => <li key={check.check_id}>
            <strong>{postingSourceCheckLabels[check.result]}</strong>
            <time dateTime={check.recorded_at}>{new Date(check.recorded_at).toLocaleString('en-GB', {
              dateStyle: 'medium', timeStyle: 'medium',
            })}</time>
          </li>)}
        </ul>}
        {canRecord && <div className="posting-card-import-source__check-controls" role="group" aria-label="Record source check">
          <label>Check result
            <select value={result} disabled={isSaving || recovery !== null}
              onChange={(event) => setResult(event.target.value as PostingSourceCheckResult | '')}>
              <option value="">Choose a result</option>
              {Object.entries(postingSourceCheckLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <button ref={recordButton} type="button" aria-disabled={!canSubmit} onClick={() => void recordCheck()}>
            {isSaving ? 'Recording…' : recovery?.retryAllowed ? 'Retry same check' : 'Record check'}
          </button>
        </div>}
        {recovery && (recovery.retryAllowed ? <p role="status">
          No matching check was found.{canRecord && ' You can retry the same check.'}
        </p> : <>
          <p role="alert">Save outcome unknown. Read source checks before trying again.</p>
          <button type="button" aria-disabled={isReading}
            onClick={(event) => void readHistory(recovery.request, event.currentTarget)}>Read source checks</button>
        </>)}
        {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
      </div>}
    </details>
  )
}
