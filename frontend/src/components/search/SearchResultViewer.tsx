import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getSearchCard, getSearchRecord } from '../../search/api/search'
import type { SearchRecord, SearchTarget } from '../../search/types/search'
import type { PostingCard } from '../../postings/types/postingCard'
import { PostingCardDetails } from '../posting-card/details/PostingCardDetails'

function RecordDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="search-record" aria-label="Search record" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="search-record__header"><span>Saved local record</span><button type="button" onClick={onClose}>Close record</button></div>
    {children}
  </dialog>
}

export function SearchResultViewer({ target, onClose, onGoHome }: { target: SearchTarget; onClose: () => void; onGoHome: () => void }) {
  const [card, setCard] = useState<PostingCard | null>(null)
  const [record, setRecord] = useState<SearchRecord | null>(null)
  const [linkedCard, setLinkedCard] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const linkedJobButton = useRef<HTMLButtonElement>(null)
  const restoreLinkedFocus = useRef(false)
  const { kind, id } = target
  useEffect(() => {
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
  }, [kind, id, attempt])
  useEffect(() => {
    if (linkedCard || !restoreLinkedFocus.current) return
    restoreLinkedFocus.current = false
    linkedJobButton.current?.focus({ preventScroll: true })
  }, [linkedCard])
  if (linkedCard) return <SearchResultViewer key={linkedCard} target={{ kind: 'card', id: linkedCard }} onClose={() => {
    restoreLinkedFocus.current = true
    setLinkedCard(null)
  }} onGoHome={onGoHome} />
  if (card) return <PostingCardDetails card={card} isReadOnly onClose={onClose} onUpdate={async () => { throw new Error('Edit this job in Card library.') }} />
  return <RecordDialog onClose={onClose}>
    {error ? <div><p role="alert">{error}</p><button type="button" onClick={() => { setError(null); setAttempt(value => value + 1) }}>Retry opening record</button></div>
      : !record ? <p role="status">Loading saved record…</p>
        : <>
          <p className="global-search__meta">{record.type} · {record.source}</p>
          <h2>{record.title}</h2>
          <dl>{record.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
          {record.card_missing && <p>Linked job deleted. This saved record is retained; it does not recreate the job.</p>}
          <div className="search-record__actions">
            {record.card_key && !record.card_missing && <button ref={linkedJobButton} type="button" onClick={() => setLinkedCard(record.card_key)}>Open linked job</button>}
            <button type="button" onClick={onGoHome}>Go to Home</button>
          </div>
        </>}
  </RecordDialog>
}
