import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { PostingCardRecovery } from '../editor/usePostingCardSave'
import './PostingCardSaveError.css'

type RecoveryProps = {
  recovery: PostingCardRecovery
  isReading: boolean
  saveButton: RefObject<HTMLButtonElement | null>
  onRead: () => void
  onUseSavedVersion: () => void
  onDiscard: () => void
}

export function PostingCardSaveRecovery({ recovery, isReading, saveButton, onRead, onUseSavedVersion, onDiscard }: RecoveryProps) {
  const action = useRef<HTMLButtonElement>(null)
  const shouldMoveFocus = useRef(true)
  const { state } = recovery

  useEffect(() => {
    if (isReading || !shouldMoveFocus.current) return
    const nextAction = state === 'retry-available' ? saveButton.current : action.current
    nextAction?.focus({ preventScroll: true })
  }, [state, isReading, saveButton])

  function handleRead() {
    if (isReading) return
    shouldMoveFocus.current = document.activeElement === action.current
    onRead()
  }

  const title = state === 'needs-read'
    ? 'Save outcome unknown.'
    : state === 'retry-available'
      ? 'The saved Card is unchanged.'
      : recovery.matchesSubmission ? 'The saved Card matches the submitted changes.' : 'The saved Card has different changes.'

  return <div className="posting-card-save-error posting-card-save-recovery" data-state={state}>
    <div className="posting-card-save-error__content" role={state === 'needs-read' ? 'alert' : 'status'}>
      <p className="posting-card-save-error__title">{title}</p>
      {state === 'needs-read' && <p className="posting-card-save-error__message">{recovery.readFailed
        ? 'Could not read the saved Card. Your draft is still here. Try reading it again.'
        : 'Read the saved Card before saving again. Your draft is still here.'}</p>}
      {state === 'retry-available' && <p className="posting-card-save-error__message">Your draft is still here. You can save it again.</p>}
      {state === 'saved-version' && <p className="posting-card-save-error__message">Using the saved version replaces this draft with the current Card.</p>}
    </div>
    {state !== 'retry-available' && <div className="posting-card-save-recovery__actions">
      {state === 'needs-read' ? <button ref={action} type="button" className="button--primary" onClick={handleRead}
        aria-disabled={isReading} onBlur={event => { if (event.relatedTarget) shouldMoveFocus.current = false }}>
        {isReading ? 'Reading saved Card…' : 'Read saved Card'}
      </button> : <button ref={action} type="button" className="button--primary" onClick={onUseSavedVersion}>Use saved version</button>}
      <button type="button" onClick={onDiscard}>Discard draft and close</button>
    </div>}
  </div>
}
