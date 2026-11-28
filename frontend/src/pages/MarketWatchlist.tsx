import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref, SyntheticEvent } from 'react'
import { changePostingWatch, getPostingWatchlist, MissingPostingCardError, PostingWatchlistChangedError, PostingWatchlistUncertainError } from '../postings/api/postings'
import { postingSourceCheckLabels } from '../postings/sourceCheckLabels'
import type { PostingCard, PostingSourceObservation, PostingWatchChange, WatchedPostingCard } from '../postings/types/postingCard'
import { savedJobCompany, savedJobTitle } from './marketJobs'
import type { MarketJobRead } from './marketJobs'
import './MarketWatchlist.css'

type Recovery = { change: PostingWatchChange; status: 'check' | 'retry' | 'changed' }
type Feedback = { error: boolean; message: string }

export type MarketWatchlistHandle = {
  observeSourceCheck: (cardKey: string, observation: PostingSourceObservation) => void
}

type WatchlistProps = {
  ref: Ref<MarketWatchlistHandle>
  cards: PostingCard[]
  detailRead: MarketJobRead | null
  onOpenJob: (cardKey: string, opener: HTMLButtonElement) => void
  onDismiss: () => void
}

type ReadOptions = {
  verify?: Recovery
  trigger?: HTMLButtonElement
  replace?: boolean
}

function submillisecondPart(timestamp: string) {
  const fraction = timestamp.match(/\.\d{3}(\d+)/)?.[1]
  return fraction ? Number(`0.${fraction}`) : 0
}

function newestSourceCheck(previous: WatchedPostingCard['last_source_check'], received: WatchedPostingCard['last_source_check']) {
  if (!previous) return received
  if (!received) return previous
  // Date.parse truncates the server's microsecond timestamps to milliseconds.
  const difference = Date.parse(received.recorded_at) - Date.parse(previous.recorded_at) ||
    submillisecondPart(received.recorded_at) - submillisecondPart(previous.recorded_at)
  return difference > 0 ? received : previous
}

function keepLatestProjection(row: WatchedPostingCard, previous: WatchedPostingCard['last_source_check']) {
  const latest = newestSourceCheck(previous, row.last_source_check)
  return latest === row.last_source_check ? row : { ...row, last_source_check: latest }
}

export function MarketWatchlist({ ref, cards, detailRead, onOpenJob, onDismiss }: WatchlistProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [watched, setWatched] = useState<WatchedPostingCard[] | null>(null)
  const [selection, setSelection] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [readError, setReadError] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const active = useRef(false)
  const readRequest = useRef<AbortController>(null)
  const writing = useRef(false)
  const summary = useRef<HTMLElement>(null)

  useImperativeHandle(ref, () => ({
    observeSourceCheck(cardKey, observation) {
      if (!summary.current?.closest('details')?.open) return
      setWatched((current) => {
        const row = current?.find((entry) => entry.card_key === cardKey)
        if (!current || !row) return current
        const latest = newestSourceCheck(row.last_source_check, observation)
        if (latest === row.last_source_check) return current
        return current.map((entry) => entry === row ? { ...entry, last_source_check: latest } : entry)
      })
    },
  }), [])

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      readRequest.current?.abort()
    }
  }, [])

  function finishChange(change: PostingWatchChange) {
    if (change.watching) setSelection('')
    setRecovery(null)
    setFeedback({ error: false, message: 'Watchlist updated.' })
  }

  function returnFocus(trigger: HTMLButtonElement | undefined) {
    const heading = summary.current
    if (trigger && document.activeElement === trigger && heading?.closest('details')?.open) {
      heading.focus({ preventScroll: true })
    }
  }

  async function readWatchlist({ verify, trigger, replace }: ReadOptions = {}) {
    if (writing.current || (readRequest.current && !replace)) return
    readRequest.current?.abort()
    const request = new AbortController()
    readRequest.current = request
    setIsReading(true)
    if (recovery?.status === 'retry') setRecovery({ change: recovery.change, status: 'check' })

    try {
      const rows = await getPostingWatchlist(request.signal)
      if (request.signal.aborted) return
      setWatched((current) => {
        const previous = new Map(current?.map((row) => [row.card_key, row.last_source_check]))
        return rows.map((row) => keepLatestProjection(row, previous.get(row.card_key)))
      })
      setReadError(false)
      if (verify) {
        const { change, status } = verify
        const current = rows.find((row) => row.card_key === change.cardKey)
        if (!change.watching && current && current.watch_id !== change.watchId) {
          setRecovery(null)
          setFeedback({ error: false, message: 'The newer watch is still active.' })
        } else if (Boolean(current) === change.watching) {
          finishChange(change)
        } else if (status === 'changed') {
          setRecovery(null)
          setFeedback({ error: false, message: 'Watchlist refreshed.' })
        } else {
          setRecovery({ change, status: 'retry' })
        }
      }
      returnFocus(trigger)
    } catch {
      if (!request.signal.aborted) setReadError(true)
    } finally {
      if (!request.signal.aborted) {
        readRequest.current = null
        setIsReading(false)
      }
    }
  }

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.target !== event.currentTarget) return
    const open = event.currentTarget.open
    setIsOpen(open)
    if (open) {
      void readWatchlist({ replace: true })
    } else {
      readRequest.current?.abort()
      readRequest.current = null
      setIsReading(false)
      onDismiss()
    }
  }

  const canChange = watched !== null && !readError && !isReading && !isWriting
  const editLocked = !canChange || recovery !== null
  const watchedKeys = new Set(watched?.map((row) => row.card_key))
  const cardsByKey = new Map(cards.map((card) => [card.card_key, card]))
  const availableJobs = cards.filter((card) => !watchedKeys.has(card.card_key) || card.card_key === selection)
  const selectedCard = cardsByKey.get(selection)
  const canWatch = !editLocked && selectedCard !== undefined && !watchedKeys.has(selection)
  const pendingCard = recovery ? cardsByKey.get(recovery.change.cardKey) : undefined

  async function writeChange(change: PostingWatchChange, trigger: HTMLButtonElement) {
    if (!canChange || readRequest.current || writing.current) return
    if (recovery && (recovery.status !== 'retry' || recovery.change !== change)) return
    writing.current = true
    setIsWriting(true)
    setRecovery(null)
    setFeedback(null)

    try {
      const saved = await changePostingWatch(change)
      if (!active.current) return
      setWatched((current) => {
        const others = (current ?? []).filter((row) =>
          row.card_key !== change.cardKey || (!change.watching && row.watch_id !== change.watchId))
        const previous = current?.find((row) => row.card_key === change.cardKey)?.last_source_check
        return saved ? [keepLatestProjection(saved, previous), ...others].sort((left, right) =>
          Date.parse(right.watched_at) - Date.parse(left.watched_at)) : others
      })
      finishChange(change)
      returnFocus(trigger)
    } catch (error) {
      if (!active.current) return
      if (error instanceof PostingWatchlistChangedError) {
        setRecovery({ change, status: 'changed' })
      } else if (error instanceof PostingWatchlistUncertainError) {
        setRecovery({ change, status: 'check' })
      } else {
        setFeedback({
          error: true,
          message: error instanceof MissingPostingCardError
            ? 'This saved job is no longer available.'
            : 'Could not update watchlist.',
        })
      }
    } finally {
      writing.current = false
      if (active.current) setIsWriting(false)
    }
  }

  return (
    <details className="market-watchlist" onToggle={handleToggle}>
      <summary ref={summary}>Watchlist</summary>
      {isOpen && <div className="market-watchlist__body">
        <div role="status">
          {(isReading || (watched === null && !readError)) && <p>Loading watchlist…</p>}
          {watched?.length === 0 && !isReading && !readError && <p>No watched jobs yet.</p>}
        </div>
        {readError && !isReading && <p className="market-page__error" role="alert">Could not load watchlist.</p>}
        {readError && recovery === null && <button className="market-page__action" type="button"
          aria-disabled={isReading} onClick={(event) => void readWatchlist({ trigger: event.currentTarget })}>
          Retry loading watchlist
        </button>}
        {feedback && <p className={feedback.error ? 'market-page__error' : undefined} role={feedback.error ? 'alert' : 'status'}>
          {feedback.message}
        </p>}
        {recovery && <div className="market-watchlist__recovery">
          <p>{recovery.change.watching ? 'Watch' : 'Stop watching'} <strong>{pendingCard ? savedJobTitle(pendingCard) : 'saved job'}</strong></p>
          {recovery.status === 'retry' ? <>
            <p role="status">The watchlist does not reflect this change.</p>
            <button className="market-page__action" type="button" aria-disabled={!canChange}
              onClick={(event) => void writeChange(recovery.change, event.currentTarget)}>Retry same change</button>
          </> : <>
            <p className="market-page__error" role="alert">
              {recovery.status === 'changed'
                ? 'This saved job was watched again. Check the watchlist to refresh it.'
                : 'Change outcome unknown. Check the watchlist before trying again.'}
            </p>
            <button className="market-page__action" type="button" aria-disabled={isReading}
              onClick={(event) => void readWatchlist({ verify: recovery, trigger: event.currentTarget })}>Check watchlist</button>
          </>}
        </div>}
        {availableJobs.length > 0 && <div className="market-watchlist__controls" role="group" aria-label="Add to watchlist">
          <div className="market-page__reference">
            <label htmlFor="market-watchlist-selection">Saved job to watch</label>
            <select id="market-watchlist-selection" value={selection} disabled={editLocked}
              onChange={(event) => setSelection(event.target.value)}>
              <option value="">Choose a saved job</option>
              {availableJobs.map((card) => <option key={card.card_key} value={card.card_key} disabled={watchedKeys.has(card.card_key)}>
                {savedJobTitle(card)} · {savedJobCompany(card)}
              </option>)}
            </select>
          </div>
          <button className="market-page__action" type="button" aria-disabled={!canWatch} onClick={(event) => {
            if (canWatch) void writeChange({ cardKey: selection, watching: true }, event.currentTarget)
          }}>Watch job</button>
          {selectedCard && <p className="market-page__reference-title" aria-hidden="true">{savedJobTitle(selectedCard)}</p>}
        </div>}
        {watched && watched.length > 0 && <ul aria-label="Watched jobs" className="market-page__jobs">
          {watched.map((row) => {
            const card = cardsByKey.get(row.card_key)
            const title = card ? savedJobTitle(card) : 'Saved job details unavailable'
            const detail = detailRead?.cardKey === row.card_key ? detailRead : null
            const isOpening = detail?.status === 'loading'
            return <li key={row.watch_id} className="market-page__job">
              <div className="market-page__job-copy">
                <h3>{title}</h3>
                {card && <p className="market-page__company">{savedJobCompany(card)}</p>}
                <time dateTime={row.watched_at}>{new Date(row.watched_at).toLocaleString('en-GB', {
                  dateStyle: 'medium', timeStyle: 'short',
                })}</time>
                {row.last_source_check !== undefined && <dl className="market-page__reason">
                  <dt>Last source check</dt>
                  <dd>{row.last_source_check === null ? 'No source check recorded.' : <>
                    <span>{postingSourceCheckLabels[row.last_source_check.result]}</span>
                    {' · '}
                    <time dateTime={row.last_source_check.recorded_at}>
                      {new Date(row.last_source_check.recorded_at).toLocaleString('en-GB', {
                        dateStyle: 'medium', timeStyle: 'medium',
                      })}
                    </time>
                  </>}</dd>
                </dl>}
              </div>
              <div className="market-watchlist__row-actions">
                <button className="market-page__action" type="button" aria-label={`View saved job: ${title}`}
                  aria-haspopup="dialog" aria-disabled={isOpening}
                  onClick={(event) => onOpenJob(row.card_key, event.currentTarget)}>
                  {isOpening ? 'Opening…' : 'View saved job'}
                </button>
                <button className="market-page__action" type="button" aria-label={`Stop watching: ${title}`}
                  aria-disabled={editLocked} onClick={(event) => {
                    if (!editLocked) void writeChange({ cardKey: row.card_key, watching: false, watchId: row.watch_id }, event.currentTarget)
                  }}>Stop watching</button>
              </div>
              {detail?.status === 'failed' && <p className="market-page__error" role="alert">{detail.message}</p>}
            </li>
          })}
        </ul>}
      </div>}
    </details>
  )
}
