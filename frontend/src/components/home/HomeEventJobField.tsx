import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { getApplicationJobs } from '../../home/api/home'
import { isPostingCardResponse } from '../../postings/api/postingCardResponse'
import type { PostingCard } from '../../postings/types/postingCard'
import { visiblePostingText } from '../posting-card/details/PostingCardFormatters'

type HomeEventJobFieldProps = {
  cardKey: string | null
  initialJob?: PostingCard | null
  onChange: (cardKey: string | null) => void
  disabled: boolean
}

type JobRead = { status: 'loading'; isRetry: boolean } | { status: 'failed' | 'ready' }

function savedJobLabel(card: PostingCard) {
  const title = visiblePostingText(card.posting_alias) ??
    visiblePostingText(card.posting.identity.position_title?.value) ?? 'Untitled job'
  const company = visiblePostingText(card.posting.identity.company_name?.value)
  return company ? `${title} · ${company}` : title
}

export function HomeEventJobField({ cardKey, initialJob, onChange, disabled }: HomeEventJobFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [read, setRead] = useState<JobRead | null>(null)
  const [jobs, setJobs] = useState<PostingCard[] | null>(() => initialJob ? [initialJob] : null)
  const pendingRead = useRef<object | null>(null)
  const focusFrom = useRef<HTMLButtonElement | null>(null)
  const select = useRef<HTMLSelectElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const pickerId = useId()
  const descriptionId = useId()

  useEffect(() => () => { pendingRead.current = null }, [])

  useLayoutEffect(() => {
    if (read?.status === 'loading') return
    const trigger = focusFrom.current
    focusFrom.current = null
    if (!trigger || !isOpen || disabled) return
    if (document.activeElement === trigger || (!trigger.isConnected && document.activeElement === document.body)) {
      const target = read?.status === 'ready' ? select.current : retry.current
      target?.focus({ preventScroll: true })
    }
  }, [disabled, isOpen, read])

  async function loadJobs(trigger: HTMLButtonElement, isRetry = false) {
    if (pendingRead.current || disabled) return
    const request = {}
    pendingRead.current = request
    setRead({ status: 'loading', isRetry })
    try {
      const cards = await getApplicationJobs()
      if (pendingRead.current !== request) return
      if (!Array.isArray(cards) || !cards.every(card => isPostingCardResponse(card, card?.card_key))) {
        throw new Error('Invalid saved jobs response.')
      }
      if (document.activeElement === trigger) focusFrom.current = trigger
      setJobs(cards)
      setRead({ status: 'ready' })
    } catch {
      if (pendingRead.current !== request) return
      if (document.activeElement === trigger) focusFrom.current = trigger
      setRead({ status: 'failed' })
    } finally {
      if (pendingRead.current === request) pendingRead.current = null
    }
  }

  function handleToggle(trigger: HTMLButtonElement) {
    if (isOpen) {
      pendingRead.current = null
      focusFrom.current = null
      setIsOpen(false)
    } else {
      setIsOpen(true)
      void loadJobs(trigger)
    }
  }

  const selectedJob = jobs?.find((card) => card.card_key === cardKey)
  const unknownJob = cardKey !== null && jobs !== null && !selectedJob
  const isLoading = read?.status === 'loading'

  return <div>
    <button type="button" className="home-page__record-action" aria-expanded={isOpen} aria-controls={pickerId}
      disabled={disabled} onClick={(event) => handleToggle(event.currentTarget)}>
      {isOpen ? 'Hide saved jobs' : cardKey ? 'Change linked job' : 'Link saved job'}
    </button>
    <div id={pickerId} hidden={!isOpen}>
      {isLoading && <p role="status">Loading saved jobs…</p>}
      {(read?.status === 'failed' || (isLoading && read.isRetry)) && <div className="home-page__load-error">
        {!isLoading && <p role="alert">Saved jobs could not be loaded.</p>}
        <button type="button" className="home-page__record-action" ref={retry} disabled={disabled}
          aria-disabled={isLoading} onClick={(event) => void loadJobs(event.currentTarget, true)}>
          Retry loading saved jobs
        </button>
      </div>}
      {read?.status === 'ready' && <>
        <label>Saved job
          <select ref={select} value={cardKey ?? ''} disabled={disabled}
            aria-describedby={selectedJob ? descriptionId : undefined}
            onChange={(event) => onChange(event.target.value || null)}>
            <option value="">No linked job</option>
            {unknownJob && <option value={cardKey} disabled>Previously linked job unavailable</option>}
            {jobs?.map((card) => <option key={card.card_key} value={card.card_key}>{savedJobLabel(card)}</option>)}
          </select>
        </label>
        {jobs?.length === 0 && <p>No saved jobs yet.</p>}
      </>}
    </div>
    {selectedJob ? <p className="home-page__selected-job" id={descriptionId}>Selected job: <strong>{savedJobLabel(selectedJob)}</strong></p>
      : cardKey && !isOpen && <p>{unknownJob ? 'Previously linked job unavailable' : 'Linked to a saved job'}</p>}
  </div>
}
