import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { getPostingCardSourceReceipt } from '../../../../postings/api/postings'
import type { PostingSourceObservation } from '../../../../postings/types/postingCard'
import type { PostingImportReceipt } from '../../../../postings/types/postingImport'
import { getSafeHttpUrl } from '../PostingCardSanitizers'
import { PostingCardSourceChecks } from './PostingCardSourceChecks'
import './PostingCardImportSource.css'

type ReceiptRead = { status: 'loading' | 'retrying' | 'failed' }
  | { status: 'ready'; receipt: PostingImportReceipt | null }

export function PostingCardImportSource({ cardKey, isReadOnly, onSourceCheckObserved }: {
  cardKey: string
  isReadOnly: boolean
  onSourceCheckObserved?: (observation: PostingSourceObservation) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const disclosure = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const [read, setRead] = useState<ReceiptRead>({ status: 'loading' })
  const retryButton = useRef<HTMLButtonElement>(null)
  const isReading = read.status === 'loading' || read.status === 'retrying'

  useEffect(() => {
    if (!isOpen || (read.status !== 'loading' && read.status !== 'retrying')) return

    const controller = new AbortController()
    // Start after React's development effect replay has cleaned up.
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      getPostingCardSourceReceipt(cardKey, controller.signal).then(
        (receipt) => {
          if (controller.signal.aborted) return
          if (retryButton.current && retryButton.current === document.activeElement) {
            summary.current?.focus({ preventScroll: true })
          }
          setRead({ status: 'ready', receipt })
        },
        () => {
          if (!controller.signal.aborted) setRead({ status: 'failed' })
        },
      )
    })
    return () => controller.abort()
  }, [cardKey, isOpen, read])

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.target !== event.currentTarget) return
    setIsOpen(event.currentTarget.open)
    // The browser can combine a quick close and reopen into a single event.
    setRead({ status: 'loading' })
  }

  const receipt = read.status === 'ready' ? read.receipt : null
  const safeSourceUrl = getSafeHttpUrl(receipt?.source_url ?? null)

  return (
    <details className="posting-card-import-source" ref={disclosure} onToggle={handleToggle}>
      <summary ref={summary}>Import source</summary>
      {isOpen && <div className="posting-card-import-source__receipt">
        <div role="status">
          {isReading && <p>Reading import receipt…</p>}
          {read.status === 'failed' && <p>Could not load the import receipt.</p>}
          {read.status === 'ready' && receipt === null && <p>Import receipt is unavailable.</p>}
          {receipt && <dl>
            <dt>Input</dt>
            <dd>{receipt.kind === 'url' ? 'Submitted link' : 'Pasted text'}</dd>
            <dt>Submitted</dt>
            <dd><time dateTime={receipt.submitted_at}>{new Date(receipt.submitted_at).toLocaleString('en-GB', {
              dateStyle: 'medium', timeStyle: 'short',
            })}</time></dd>
            {safeSourceUrl !== null && <>
              <dt>Source link</dt>
              <dd><a href={safeSourceUrl} target="_blank" rel="noopener noreferrer">{receipt.source_url}</a></dd>
            </>}
          </dl>}
        </div>
        {(read.status === 'failed' || read.status === 'retrying') && <button
          ref={retryButton}
          type="button"
          aria-disabled={isReading}
          onClick={() => { if (!isReading) setRead({ status: 'retrying' }) }}
        >Retry</button>}
      </div>}
      <PostingCardSourceChecks
        cardKey={cardKey}
        isSourceOpen={isOpen}
        canRecord={!isReadOnly && safeSourceUrl !== null}
        onSourceUnavailable={() => setRead({ status: 'ready', receipt: null })}
        onSourceCheckObserved={onSourceCheckObserved && ((observation) => {
          if (disclosure.current?.open) onSourceCheckObserved(observation)
        })}
      />
    </details>
  )
}
