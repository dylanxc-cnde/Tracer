import { useEffect, useRef, useState } from 'react'
import { IconBuilding, IconCalendarEvent, IconFileText, IconMail, IconPlus } from '@tabler/icons-react'
import { PostingCardDetails } from '../posting-card/details/PostingCardDetails'
import {
  adjustEvent, completeTask, createApplication, createEvent, createTask,
  getApplicationJobs, HomeApiError, localDateTime,
} from '../../home/api/home'
import type { CreateApplicationRequest, CreateEventRequest, CreateTaskRequest, HomeOverview, ScheduleEvent, Task } from '../../home/types/home'
import type { PostingCard } from '../../postings/types/postingCard'
import './HomeRecords.css'

type Refresh = () => Promise<HomeOverview>
type Operation = { send: () => Promise<unknown>; saved: () => void; matches: (data: HomeOverview) => boolean }

// One local write lifecycle per editor/row. Checking an uncertain outcome is a
// read, never a retry; a later explicit retry reuses the exact frozen operation.
function useRecordWrite(refresh: Refresh) {
  const active = useRef(false)
  const guard = useRef(false)
  const attempt = useRef<Operation | null>(null)
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [checked, setChecked] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  async function run(operation: Operation) {
    if (guard.current || (uncertain && !checked)) return
    guard.current = true
    setPending(true)
    setError(null)
    setMessage(null)
    // Preserve the action/payload after a lost response, even through re-renders.
    const current = uncertain && attempt.current ? attempt.current : operation
    attempt.current = current
    try {
      await current.send()
      if (!active.current) return
      current.saved()
      setUncertain(false)
      setChecked(false)
      attempt.current = null
      setMessage('Saved.')
      try { await refresh() } catch {
        if (active.current) setMessage('Saved, but the updated overview could not be loaded. Refresh Home; do not submit again.')
      }
    } catch (caught) {
      if (!active.current) return
      const unknown = caught instanceof HomeApiError && caught.uncertain
      setError(caught instanceof HomeApiError ? caught.message : 'This change could not be confirmed. Refresh to check saved records before retrying.')
      setUncertain(unknown || !(caught instanceof HomeApiError))
      setChecked(false)
    } finally {
      guard.current = false
      if (active.current) setPending(false)
    }
  }
  async function check() {
    if (guard.current) return
    guard.current = true
    setPending(true)
    try {
      const data = await refresh()
      if (!active.current) return
      if (attempt.current?.matches(data)) {
        attempt.current.saved()
        attempt.current = null
        setUncertain(false)
        setError(null)
        setMessage('Saved record found after refresh.')
      } else {
        setChecked(true)
        setError('Refresh completed. This view does not confirm the change. You can explicitly retry the same request; its record ID will not change.')
      }
    } catch {
      if (active.current) setError('Refresh failed. Keep this draft and retry the check before another write.')
    } finally {
      guard.current = false
      if (active.current) setPending(false)
    }
  }
  return { run, check, pending, uncertain, checked, error, message, locked: pending || uncertain }
}

function WriteFeedback({ write }: { write: ReturnType<typeof useRecordWrite> }) {
  return <div className="home-page__write-feedback">
    {write.error && <p role="alert">{write.error}</p>}
    {write.message && <p role="status">{write.message}</p>}
    {write.uncertain && <button type="button" className="home-page__record-action" disabled={write.pending} onClick={() => void write.check()}>Refresh to check</button>}
  </div>
}

// Identical retries keep their UUID. A corrected, definitely rejected draft is
// a new creation request; an uncertain draft is locked and cannot take this path.
function creationId(ref: { current: { key: string; id: string } | null }, body: object): string {
  const key = JSON.stringify(body)
  if (!ref.current || ref.current.key !== key) ref.current = { key, id: crypto.randomUUID() }
  return ref.current.id
}
export function jobTitle(card: PostingCard): string {
  return card.posting_alias || card.posting.identity.position_title?.value || 'Untitled job'
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function dateFact(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function TaskForm({ today, refresh }: { today: string; refresh: Refresh }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const focusAfterSave = useRef(false)
  const id = useRef<{ key: string; id: string } | null>(null)
  const write = useRecordWrite(refresh)
  useEffect(() => {
    if (!write.pending && focusAfterSave.current) {
      focusAfterSave.current = false
      input.current?.focus({ preventScroll: true })
    }
  }, [write.pending])
  function submit() {
    const fields = { title: title.trim(), due_on: due || null }
    const body: CreateTaskRequest = { ...fields, task_id: creationId(id, fields) }
    void write.run({ send: () => createTask(body), saved: () => {
      setTitle(''); setDue(''); id.current = null
      // Stay in the same inline form; focus must not scroll the list to a new row.
      focusAfterSave.current = true
    }, matches: data => [...data.today.tasks, ...data.today.completed_tasks, ...data.upcoming.tasks].some(t => t.task_id === body.task_id) })
  }
  return <form className="home-page__record-form home-page__task-form" aria-label="Add task" onSubmit={e => { e.preventDefault(); submit() }}>
    <label>Task title<input ref={input} value={title} maxLength={200} required disabled={write.locked} onChange={e => setTitle(e.target.value)} placeholder="Your next step" /></label>
    <label>Due date <span className="home-page__optional">(optional)</span><input type="date" value={due} disabled={write.locked} onChange={e => setDue(e.target.value)} aria-description={`Today is ${today}`} /></label>
    <button className="home-page__record-primary" disabled={write.pending || (write.uncertain && !write.checked)}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : 'Add task'}</button>
    <WriteFeedback write={write} />
  </form>
}

function TaskRow({ task, refresh }: { task: Task; refresh: Refresh }) {
  const write = useRecordWrite(refresh)
  return <li className="home-page__task-row">
    <div className="home-page__row-copy"><strong>{task.title}</strong><span>{task.due_on ? `Due ${dateFact(task.due_on)}` : 'No due date'}</span><WriteFeedback write={write} /></div>
    <button className="home-page__record-action" type="button" disabled={write.pending || (write.uncertain && !write.checked)} onClick={() => void write.run({
      send: () => completeTask(task.task_id), saved: () => {},
      matches: data => data.today.completed_tasks.some(t => t.task_id === task.task_id),
    })} aria-label={`Complete ${task.title}`}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : 'Complete'}</button>
  </li>
}

function EventForm({ event, refresh, close }: { event: ScheduleEvent | null; refresh: Refresh; close: () => void }) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [kind, setKind] = useState<ScheduleEvent['kind']>(event?.kind ?? 'interview')
  const [start, setStart] = useState(event ? localDateTime(event.starts_at) : '')
  const [end, setEnd] = useState(event?.ends_at ? localDateTime(event.ends_at) : '')
  const [cancelled, setCancelled] = useState(event?.cancelled ?? false)
  const [validation, setValidation] = useState<string | null>(null)
  const id = useRef<{ key: string; id: string } | null>(null)
  const write = useRecordWrite(refresh)
  function submit() {
    if (end && new Date(end) < new Date(start)) { setValidation('End time must not precede start time.'); return }
    setValidation(null)
    const fields = { title: title.trim(), kind, starts_at: new Date(start).toISOString(), ends_at: end ? new Date(end).toISOString() : null, cancelled }
    const body: CreateEventRequest = { ...fields, event_id: event?.event_id ?? creationId(id, fields) }
    void write.run({ send: () => event ? adjustEvent(event.event_id, fields) : createEvent(body), saved: close,
      matches: data => [...data.today.events, ...data.upcoming.events].some(v => v.event.event_id === body.event_id
        && v.event.title === body.title && v.event.kind === body.kind && new Date(v.event.starts_at).getTime() === new Date(body.starts_at).getTime()
        && (v.event.ends_at === null) === (body.ends_at === null)
        && (v.event.ends_at === null || new Date(v.event.ends_at).getTime() === new Date(body.ends_at!).getTime()) && v.event.cancelled === cancelled),
    })
  }
  return <form className="home-page__record-form" aria-label={event ? 'Adjust event' : 'Add event'} onSubmit={e => { e.preventDefault(); submit() }}>
    <fieldset disabled={write.locked}>
      <label>Event title<input value={title} maxLength={200} required onChange={e => setTitle(e.target.value)} autoFocus /></label>
      <label>Event type<select value={kind} onChange={e => setKind(e.target.value as ScheduleEvent['kind'])}><option value="interview">Interview</option><option value="deadline">Deadline</option><option value="other">Other</option></select></label>
      <label>Starts (local time)<input type="datetime-local" value={start} required onChange={e => setStart(e.target.value)} /></label>
      <label>Ends (optional)<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      {event && <label className="home-page__check-label"><input type="checkbox" checked={cancelled} onChange={e => setCancelled(e.target.checked)} />Cancel this event</label>}
    </fieldset>
    {validation && <p role="alert">{validation}</p>}
    <div className="home-page__record-actions"><button className="home-page__record-primary" disabled={write.pending || (write.uncertain && !write.checked)}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : event ? 'Save event' : 'Add event'}</button><button type="button" className="home-page__record-action" onClick={close} disabled={write.locked}>Cancel editing</button></div>
    <WriteFeedback write={write} />
  </form>
}

function ApplicationForm({ jobs, selected, today, refresh, close }: { jobs: PostingCard[]; selected: string; today: string; refresh: Refresh; close: () => void }) {
  const [key, setKey] = useState(selected)
  const [date, setDate] = useState(today)
  const id = useRef<{ key: string; id: string } | null>(null)
  const write = useRecordWrite(refresh)
  const selectedJob = jobs.find(card => card.card_key === key)
  function submit() {
    const fields = { card_key: key, applied_on: date }
    const body: CreateApplicationRequest = { ...fields, application_id: creationId(id, fields) }
    void write.run({ send: () => createApplication(body), saved: close, matches: data => data.applications.some(a => a.record.application_id === body.application_id) })
  }
  return <form className="home-page__record-form" aria-label="Record application" onSubmit={e => { e.preventDefault(); submit() }}>
    <p>Record an application you have already submitted. Saving a job is not applying.</p>
    <fieldset disabled={write.locked}>
      <label>Job<select value={key} required autoFocus aria-describedby={selectedJob ? 'home-selected-job' : undefined} onChange={e => setKey(e.target.value)}><option value="">Choose a saved job</option>{jobs.map(card => <option key={card.card_key} value={card.card_key}>{jobTitle(card)}</option>)}</select></label>
      <label>Application date<input type="date" value={date} required onChange={e => setDate(e.target.value)} /></label>
    </fieldset>
    {selectedJob && <p className="home-page__selected-job" id="home-selected-job" aria-live="polite">Selected job: <strong>{jobTitle(selectedJob)}</strong> · {selectedJob.posting.identity.company_name?.value || 'Company not specified'}</p>}
    <div className="home-page__record-actions"><button className="home-page__record-primary" disabled={write.pending || (write.uncertain && !write.checked)}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : 'Record application'}</button><button type="button" className="home-page__record-action" disabled={write.locked} onClick={close}>Cancel</button></div>
    <WriteFeedback write={write} />
  </form>
}

export function HomeRecords({ data, today, refresh }: { data: HomeOverview; today: string; refresh: Refresh }) {
  const [eventEditor, setEventEditor] = useState<ScheduleEvent | 'new' | null>(null)
  const [applicationEditor, setApplicationEditor] = useState<string | null>(null)
  const [jobs, setJobs] = useState<PostingCard[] | null>(null)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const active = useRef(false)
  const jobsGuard = useRef(false)
  const applicationHeading = useRef<HTMLHeadingElement>(null)
  const eventHeading = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function openApplication(key: string) {
    if (jobsGuard.current) return
    opener.current = document.activeElement as HTMLElement
    setApplicationEditor(key)
    setJobsError(null)
    setJobsLoading(true)
    jobsGuard.current = true
    try { const cards = await getApplicationJobs(); if (active.current) setJobs(cards) } catch (e) {
      if (active.current) { setJobs(null); setJobsError(e instanceof HomeApiError ? e.message : 'Saved jobs could not be loaded.') }
    } finally { jobsGuard.current = false; if (active.current) setJobsLoading(false) }
  }
  function closeApplication() {
    setApplicationEditor(null)
    requestAnimationFrame(() => applicationHeading.current?.focus({ preventScroll: true }))
  }
  function closeEvent() {
    setEventEditor(null)
    requestAnimationFrame(() => eventHeading.current?.focus({ preventScroll: true }))
  }
  const upcoming = [
    ...data.upcoming.events.map(v => ({ key: v.event.event_id, date: v.event.starts_at, title: v.event.title, detail: `${v.event.kind}${v.card_missing ? ' · Job deleted' : ''}`, event: v.event })),
    ...data.upcoming.tasks.map(t => ({ key: t.task_id, date: `${t.due_on}T00:00:00`, title: t.title, detail: 'Task due', event: null })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const nextEvent = data.today.events.find(v => new Date(v.event.ends_at ?? v.event.starts_at).getTime() >= Date.now())
  return <>
    <div className="home-page__schedule-columns">
      <section aria-labelledby="home-today-title">
        <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-today-title">Today</h2><span className="home-page__count">{data.today.tasks.length} tasks</span></div>
        {nextEvent ? <article className="home-page__featured-event"><span className="home-page__eyebrow">Next up · {nextEvent.event.kind}</span><strong>{nextEvent.event.title}</strong><span>{dateTime(nextEvent.event.starts_at)}{nextEvent.card_missing ? ' · Job deleted' : ''}</span><button className="home-page__record-action" type="button" disabled={eventEditor !== null} onClick={() => setEventEditor(nextEvent.event)}>Adjust event</button></article> : <p className="home-page__empty">No more events scheduled today. Add one in Upcoming.</p>}
        <TaskForm today={today} refresh={refresh} />
        <ul className="home-page__task-list home-page__stable-list" aria-label="Today's tasks">{data.today.tasks.map(t => <TaskRow key={t.task_id} task={t} refresh={refresh} />)}</ul>
        {data.today.tasks.length === 0 && <p className="home-page__empty">No pending tasks for today. Add your next step above.</p>}
        <details className="home-page__completed"><summary>{data.today.completed_count} completed today</summary><ul>{data.today.completed_tasks.map(t => <li key={t.task_id}>{t.title}</li>)}</ul></details>
      </section>
      <section className="home-page__upcoming" aria-labelledby="home-upcoming-title">
        <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-upcoming-title" ref={eventHeading} tabIndex={-1}>Upcoming</h2><span className="home-page__count">Next 14 days</span><button className="home-page__record-action" type="button" disabled={eventEditor !== null} onClick={() => setEventEditor('new')}><IconPlus aria-hidden="true" />Add event</button></div>
        {eventEditor !== null && <EventForm key={eventEditor === 'new' ? 'new' : eventEditor.event_id} event={eventEditor === 'new' ? null : eventEditor} refresh={refresh} close={closeEvent} />}
        {upcoming.length === 0 ? <p className="home-page__empty">No recorded deadlines or events in the next 14 days.</p> : <ul className="home-page__upcoming-list" aria-label="Upcoming records">{upcoming.map(item => <li className="home-page__upcoming-row home-page__record-upcoming" key={item.key}><div className="home-page__row-copy"><time dateTime={item.date}>{dateTime(item.date)}</time><strong>{item.title}</strong><span>{item.detail}</span></div>{item.event && <button className="home-page__record-action" type="button" disabled={eventEditor !== null} onClick={() => setEventEditor(item.event)}>Adjust</button>}</li>)}</ul>}
      </section>
    </div>
    <section aria-labelledby="home-search-title">
      <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-search-title" ref={applicationHeading} tabIndex={-1}>Your search</h2><button className="home-page__record-action" type="button" disabled={applicationEditor !== null} onClick={() => void openApplication('')}>Record application</button></div>
      <dl className="home-page__metrics"><div className="home-page__metric"><span className="home-page__metric-icon home-page__metric-icon--applications" aria-hidden="true"><IconFileText /></span><dt>Active applications</dt><dd>{data.your_search.active}</dd></div><div className="home-page__metric"><span className="home-page__metric-icon" aria-hidden="true"><IconMail /></span><dt>Awaiting reply</dt><dd>{data.your_search.awaiting_reply}</dd></div><div className="home-page__metric"><span className="home-page__metric-icon" aria-hidden="true"><IconCalendarEvent /></span><dt>Interviews in next 7 days</dt><dd>{data.your_search.interviews}</dd></div></dl>
      {applicationEditor !== null && <div className="home-page__application-editor">
        {jobsLoading ? <p role="status">Loading saved jobs…</p> : jobsError ? <div><p role="alert">{jobsError}</p><button className="home-page__record-action" type="button" onClick={() => void openApplication(applicationEditor)}>Retry loading jobs</button><button className="home-page__record-action" type="button" onClick={closeApplication}>Cancel</button></div> : jobs?.length ? <ApplicationForm jobs={jobs} selected={applicationEditor} today={today} refresh={refresh} close={closeApplication} /> : <p className="home-page__empty">Save a job in Import posting first, then return here to record an application. <button className="home-page__record-action" type="button" onClick={closeApplication}>Close</button></p>}
      </div>}
      {data.applications.length > 0 && <details className="home-page__application-history"><summary>Recorded applications ({data.applications.length})</summary><ul>{data.applications.map(({ record, card_missing }) => {
        const card = data.recent_jobs.find(j => j.card.card_key === record.card_key)?.card ?? jobs?.find(j => j.card_key === record.card_key)
        return <li key={record.application_id}><strong>{card_missing ? 'Job deleted' : card ? jobTitle(card) : 'Saved job'}</strong> · {record.status} · <time dateTime={record.applied_on}>{dateFact(record.applied_on)}</time></li>
      })}</ul></details>}
    </section>
    <section className="home-page__recent-jobs" aria-labelledby="home-recent-jobs-title"><div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-recent-jobs-title">Recent jobs</h2><span className="home-page__count">Latest saved jobs</span></div>
      {data.recent_jobs.length === 0 ? <p className="home-page__empty">No saved jobs yet. Use Import posting to review and save your first job.</p> : <ul className="home-page__recent-list" aria-label="Recent saved jobs">{data.recent_jobs.map(({ card, application }) => <li className="home-page__recent-row home-page__record-job" key={card.card_key}><span className="home-page__company-mark" aria-hidden="true"><IconBuilding /></span><div className="home-page__row-copy"><button type="button" className="home-page__job-title" onClick={() => { opener.current = document.activeElement as HTMLElement; setOpenedCard(card) }}>{jobTitle(card)}</button><span>{card.posting.identity.company_name?.value || 'Company not specified'}</span><span>{application ? `Application: ${application.status}` : 'Saved · No application recorded'}</span></div>{!application && <button className="home-page__record-action" type="button" disabled={applicationEditor !== null} onClick={() => void openApplication(card.card_key)}>Record application</button>}</li>)}</ul>}
    </section>
    {openedCard && <PostingCardDetails card={openedCard} isReadOnly onUpdate={async () => { throw new Error('Edit this job in Card library.') }} onClose={() => { setOpenedCard(null); requestAnimationFrame(() => opener.current?.focus({ preventScroll: true })) }} />}
  </>
}
