import { useEffect, useRef, useState } from 'react'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'
import { activityLabels } from '../home/activityLabels'
import { getHomeActivityInWindow, localDate } from '../home/api/home'
import type { ActivityEvent } from '../home/types/home'
import type { PostingCard } from '../postings/types/postingCard'
import { getSearchCard } from '../search/api/search'
import './ActivityPage.css'

function groupActivity(events: ActivityEvent[]) {
  const days = new Map<string, ActivityEvent[]>()
  const latestFirst = [...events].sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
  for (const event of latestFirst) {
    const date = localDate(new Date(event.occurred_at))
    const day = days.get(date)
    if (day) day.push(event)
    else days.set(date, [event])
  }
  return [...days.values()]
}

export function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [cardRead, setCardRead] = useState<{ eventId: string; error: string | null } | null>(null)
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const cardRequest = useRef<AbortController | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const request = new AbortController()
    const now = new Date()
    const midnight = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)

    async function loadActivity() {
      // Let Strict Mode discard the first setup before it can issue a read.
      await Promise.resolve()
      if (request.signal.aborted) return
      try {
        const activity = await getHomeActivityInWindow(midnight(-29), midnight(1), request.signal)
        if (!request.signal.aborted) setEvents(activity.events)
      } catch {
        if (!request.signal.aborted) setError('Activity could not be loaded. Please retry.')
      } finally {
        if (!request.signal.aborted) setIsLoading(false)
      }
    }

    void loadActivity()
    return () => request.abort()
  }, [attempt])

  useEffect(() => () => cardRequest.current?.abort(), [])

  function handleRefresh() {
    if (isLoading) return
    setError(null)
    setIsLoading(true)
    setAttempt(value => value + 1)
  }

  async function handleOpenJob(event: ActivityEvent, button: HTMLButtonElement) {
    if (!event.card_key || (cardRead?.eventId === event.event_id && cardRead.error === null)) return
    cardRequest.current?.abort()
    const request = new AbortController()
    cardRequest.current = request
    opener.current = button
    setCardRead({ eventId: event.event_id, error: null })
    try {
      const card = await getSearchCard(event.card_key, request.signal)
      if (!request.signal.aborted) {
        setCardRead(null)
        setOpenedCard(card)
      }
    } catch (caught) {
      if (request.signal.aborted) return
      const missing = caught instanceof Error && caught.message.startsWith('This record is no longer available')
      setCardRead({ eventId: event.event_id, error: missing
        ? 'This saved job is no longer available. Its activity remains here.'
        : 'Could not open the saved job. Try again.' })
    }
  }

  function handleCloseJob() {
    setOpenedCard(null)
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }

  return (
    <section className="activity-page" aria-labelledby="activity-page-title">
      <header className="activity-page__header">
        <div>
          <h1 id="activity-page-title" className="page-title">Activity</h1>
          <p className="page-description">Recorded workspace changes over the last 30 days.</p>
        </div>
        <button type="button" aria-disabled={isLoading} onClick={handleRefresh}>
          {error ? 'Retry activity' : 'Refresh activity'}
        </button>
      </header>
      {isLoading && <p role="status">Loading activity…</p>}
      {error && <p role="alert">{error}{events && ' Showing the last loaded activity.'}</p>}
      {events?.length === 0 && <p>No activity recorded in the last 30 days.</p>}
      {events && groupActivity(events).map(day => {
        const date = new Date(day[0].occurred_at)
        const dateLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        return <section className="activity-page__day" key={localDate(date)} aria-label={dateLabel}>
          <h2>{dateLabel}</h2>
          <ul>
            {day.map(event => {
              const read = cardRead?.eventId === event.event_id ? cardRead : null
              return <li key={event.event_id}>
                <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>
                <span>{activityLabels[event.kind]}</span>
                {event.card_key && <button type="button" aria-disabled={read?.error === null} onClick={e => void handleOpenJob(event, e.currentTarget)}>
                  {read?.error === null ? 'Opening job…' : 'Open job'}
                </button>}
                {read?.error && <p role="alert">{read.error}</p>}
              </li>
            })}
          </ul>
        </section>
      })}
      {openedCard && <PostingCardDetails card={openedCard} isReadOnly onClose={handleCloseJob}
        onUpdate={async () => { throw new Error('Edit this job in Card library.') }} />}
    </section>
  )
}
