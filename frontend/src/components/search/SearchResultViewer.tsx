import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { getSearchCard, getSearchRecord } from '../../search/api/search'
import type { SearchRecord, SearchTarget } from '../../search/types/search'
import type { PostingCard } from '../../postings/types/postingCard'
import { PostingCardDetails } from '../posting-card/details/PostingCardDetails'

type RecordDialogProps = {
  children: (dismiss: (finish: () => void) => void) => ReactNode
  initialFocusRef?: RefObject<HTMLElement | null>
  onClose: () => void
  onCloseStart: () => void
}

function RecordDialog({ children, initialFocusRef, onClose, onCloseStart }: RecordDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    // Native autofocus runs on every showModal, including StrictMode's effect replay.
    initialFocusRef?.current?.focus({ preventScroll: true })
    return () => element?.close()
  }, [initialFocusRef])
  function handleClose(finish = onClose) {
    const element = dialog.current
    if (!element || element.hasAttribute('inert')) return

    element.setAttribute('inert', '')
    onCloseStart()
    const animations = element.getAnimations?.() ?? []
    if (animations.length === 0) {
      finish()
      return
    }

    // Keep the native modal in the top layer until its exit has settled.
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (dialog.current === element) finish()
    })
  }

  return <dialog ref={dialog} className="search-record" aria-label="Search record" onCancel={event => {
    event.preventDefault()
    handleClose()
  }}>
    <div className="search-record__header"><span>Saved local record</span><button type="button" onClick={() => handleClose()}>Close record</button></div>
    {children(handleClose)}
  </dialog>
}

export function SearchResultViewer({ target, onClose, onGoHome }: { target: SearchTarget; onClose: () => void; onGoHome: () => void }) {
  const [card, setCard] = useState<PostingCard | null>(null)
  const [record, setRecord] = useState<SearchRecord | null>(null)
  const [linkedCard, setLinkedCard] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [isClosing, setIsClosing] = useState(false)
  const [focusLinkedJobOnOpen, setFocusLinkedJobOnOpen] = useState(false)
  const linkedJobButton = useRef<HTMLButtonElement>(null)
  const { kind, id } = target
  useEffect(() => {
    if (isClosing) return
    const controller = new AbortController()
    async function load() {
      try {
        if (kind === 'card') {
          const result = await getSearchCard(id, controller.signal)
          if (!controller.signal.aborted) setCard(result)
        } else {
          const result = await getSearchRecord({ kind, id }, controller.signal)
          if (!controller.signal.aborted) setRecord(result)
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error && caught.message.startsWith('This record')
          ? caught.message : 'This local record could not be opened. Please try again.')
      }
    }
    void load()
    return () => controller.abort()
  }, [kind, id, attempt, isClosing])
  if (linkedCard) return <SearchResultViewer key={linkedCard} target={{ kind: 'card', id: linkedCard }} onClose={() => {
    setFocusLinkedJobOnOpen(true)
    setLinkedCard(null)
  }} onGoHome={onGoHome} />
  if (card && !isClosing) return <PostingCardDetails card={card} isReadOnly onClose={onClose} onUpdate={async () => { throw new Error('Edit this job in Card library.') }} />
  return <RecordDialog
    initialFocusRef={focusLinkedJobOnOpen ? linkedJobButton : undefined}
    onClose={onClose}
    onCloseStart={() => setIsClosing(true)}
  >
    {dismiss => error ? <div><p role="alert">{error}</p><button type="button" onClick={() => { setError(null); setAttempt(value => value + 1) }}>Retry opening record</button></div>
      : !record ? <p role="status">Loading saved record…</p>
        : <>
          <p className="global-search__meta">{record.type} · {record.source}</p>
          <h2>{record.title}</h2>
          <dl>{record.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
          {record.card_missing && <p>Linked job deleted. This saved record is retained; it does not recreate the job.</p>}
          <div className="search-record__actions">
            {record.card_key && !record.card_missing && <button ref={linkedJobButton} type="button" onClick={() => setLinkedCard(record.card_key)}>Open linked job</button>}
            <button type="button" onClick={() => dismiss(onGoHome)}>Go to Home</button>
          </div>
        </>}
  </RecordDialog>
}
