import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { IconBuilding, IconCalendarEvent, IconFileText, IconMail, IconPlus } from '@tabler/icons-react'
import { PostingCardDetails } from '../posting-card/details/PostingCardDetails'
import { visiblePostingText } from '../posting-card/details/PostingCardFormatters'
import {
  adjustEvent, changeApplication, completeTask, createApplication, createEvent, createTask,
  getApplicationJobs, HomeApiError, localDateTime,
} from '../../home/api/home'
import type { ApplicationRecord, ApplicationStatus, CreateApplicationRequest, CreateEventRequest, CreateTaskRequest, HomeCardIntent, HomeOverview, ScheduleEvent, Task } from '../../home/types/home'
import type { PostingCard } from '../../postings/types/postingCard'
import { getPostingCard, MissingPostingCardError } from '../../postings/api/postings'
import { HomeEventJobField } from './HomeEventJobField'
import { useRecordWrite } from './useRecordWrite'
import type { HomeRecordsRefresh } from './useRecordWrite'
import './HomeRecords.css'

type WriteFeedbackState = Pick<ReturnType<typeof useRecordWrite>, 'check' | 'pending' | 'uncertain' | 'error' | 'message'>

function WriteFeedback({ write, onCheckStart }: { write: WriteFeedbackState; onCheckStart?: () => void }) {
  return <div className="home-page__write-feedback">
    {write.error && <p role="alert">{write.error}</p>}
    {write.message && <p role="status">{write.message}</p>}
    {write.uncertain && <button type="button" className="home-page__record-action" disabled={write.pending} onClick={() => { onCheckStart?.(); void write.check() }}>Refresh to check</button>}
  </div>
}

// Identical retries keep their UUID. A corrected, definitely rejected draft is
// a new creation request; an uncertain draft is locked and cannot take this path.
function creationId(ref: { current: { key: string; id: string } | null }, body: object): string {
  const key = JSON.stringify(body)
  if (!ref.current || ref.current.key !== key) ref.current = { key, id: crypto.randomUUID() }
  return ref.current.id
}
function jobTitle(card: PostingCard): string {
  return visiblePostingText(card.posting_alias) ?? visiblePostingText(card.posting.identity.position_title?.value) ?? 'Untitled job'
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function dateFact(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function TaskForm({ today, refresh }: { today: string; refresh: HomeRecordsRefresh }) {
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

function TaskRow({ task, refresh }: { task: Task; refresh: HomeRecordsRefresh }) {
  const write = useRecordWrite(refresh)
  return <li className="home-page__task-row">
    <div className="home-page__row-copy"><strong>{task.title}</strong><span>{task.due_on ? `Due ${dateFact(task.due_on)}` : 'No due date'}</span><WriteFeedback write={write} /></div>
    <button className="home-page__record-action" type="button" disabled={write.pending || (write.uncertain && !write.checked)} onClick={() => void write.run({
      send: () => completeTask(task.task_id), saved: () => {},
      matches: data => data.today.completed_tasks.some(t => t.task_id === task.task_id),
    })} aria-label={`Complete ${task.title}`}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : 'Complete'}</button>
  </li>
}

type EventEditor = { kind: 'create'; initialJob: PostingCard | null } | { kind: 'adjust'; event: ScheduleEvent }

function EventForm({ editor, refresh, close }: { editor: EventEditor; refresh: HomeRecordsRefresh; close: () => void }) {
  const event = editor.kind === 'adjust' ? editor.event : null
  const initialJob = editor.kind === 'create' ? editor.initialJob : null
  const [title, setTitle] = useState(event?.title ?? (initialJob ? 'Follow up' : ''))
  const [kind, setKind] = useState<ScheduleEvent['kind']>(event?.kind ?? (initialJob ? 'other' : 'interview'))
  const [start, setStart] = useState(event ? localDateTime(event.starts_at) : '')
  const [end, setEnd] = useState(event?.ends_at ? localDateTime(event.ends_at) : '')
  const [cancelled, setCancelled] = useState(event?.cancelled ?? false)
  const [cardKey, setCardKey] = useState(event?.card_key ?? initialJob?.card_key ?? null)
  const [validation, setValidation] = useState<string | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const id = useRef<{ key: string; id: string } | null>(null)
  const write = useRecordWrite(refresh)
  useLayoutEffect(() => {
    if (initialJob && document.activeElement === document.body) titleInput.current?.focus()
  }, [initialJob])
  function submit() {
    if (end && new Date(end) < new Date(start)) { setValidation('End time must not precede start time.'); return }
    setValidation(null)
    const fields = {
      title: title.trim(), kind, starts_at: new Date(start).toISOString(),
      ends_at: end ? new Date(end).toISOString() : null, cancelled,
      ...(cardKey !== (event?.card_key ?? null) ? { card_key: cardKey } : {}),
    }
    const verifyLinkedJob = event === null || 'card_key' in fields
    const body: CreateEventRequest = { ...fields, event_id: event?.event_id ?? creationId(id, fields) }
    void write.run({ send: () => event ? adjustEvent(event.event_id, fields) : createEvent(body), saved: close,
      matches: data => [...data.today.events, ...data.upcoming.events].some(v => v.event.event_id === body.event_id
        && (!verifyLinkedJob || v.event.card_key === cardKey)
        && v.event.title === body.title && v.event.kind === body.kind && new Date(v.event.starts_at).getTime() === new Date(body.starts_at).getTime()
        && (v.event.ends_at === null) === (body.ends_at === null)
        && (v.event.ends_at === null || new Date(v.event.ends_at).getTime() === new Date(body.ends_at!).getTime()) && v.event.cancelled === cancelled),
    })
  }
  return <form className="home-page__record-form" aria-label={event ? 'Adjust event' : 'Add event'} onSubmit={e => { e.preventDefault(); submit() }}>
    <fieldset disabled={write.locked}>
      <label>Event title<input ref={titleInput} value={title} maxLength={200} required
        onChange={e => setTitle(e.target.value)} autoFocus={!initialJob} /></label>
      <label>Event type<select value={kind} onChange={e => setKind(e.target.value as ScheduleEvent['kind'])}><option value="interview">Interview</option><option value="deadline">Deadline</option><option value="other">Other</option></select></label>
      <label>Starts (local time)<input type="datetime-local" value={start} required onChange={e => setStart(e.target.value)} /></label>
      <label>Ends (optional)<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      {event && <label className="home-page__check-label"><input type="checkbox" checked={cancelled} onChange={e => setCancelled(e.target.checked)} />Cancel this event</label>}
    </fieldset>
    <HomeEventJobField cardKey={cardKey} initialJob={initialJob} onChange={setCardKey} disabled={write.locked} />
    {validation && <p role="alert">{validation}</p>}
    <div className="home-page__record-actions"><button className="home-page__record-primary" disabled={write.pending || (write.uncertain && !write.checked)}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : event ? 'Save event' : 'Add event'}</button><button type="button" className="home-page__record-action" onClick={close} disabled={write.locked}>Cancel editing</button></div>
    <WriteFeedback write={write} />
  </form>
}

type ApplicationEditor = { kind: 'choose'; cardKey: string } | { kind: 'fixed'; card: PostingCard }

function ApplicationForm({ jobs = [], editor, today, refresh, close, confirmedRecord, onAlreadyRecorded }: {
  jobs?: PostingCard[]; editor: ApplicationEditor; today: string; refresh: HomeRecordsRefresh; close: () => void
  confirmedRecord?: ApplicationRecord; onAlreadyRecorded?: (card: PostingCard) => void
}) {
  const fixedJob = editor.kind === 'fixed' ? editor.card : null
  const [key, setKey] = useState(editor.kind === 'fixed' ? editor.card.card_key : editor.cardKey)
  const [date, setDate] = useState(fixedJob ? '' : today)
  const dateInput = useRef<HTMLInputElement>(null)
  const id = useRef<{ key: string; id: string } | null>(null)
  const write = useRecordWrite(refresh)
  const selectedJob = fixedJob ?? jobs.find(card => card.card_key === key)
  useLayoutEffect(() => {
    if (fixedJob && document.activeElement === document.body) dateInput.current?.focus()
  }, [fixedJob])
  useLayoutEffect(() => {
    if (fixedJob && confirmedRecord && confirmedRecord.application_id !== id.current?.id && !write.pending) {
      onAlreadyRecorded?.(fixedJob)
    }
  }, [confirmedRecord, fixedJob, onAlreadyRecorded, write.pending])
  function submit() {
    if (!key || !date) return
    if (confirmedRecord && confirmedRecord.application_id !== id.current?.id) return
    const fields = { card_key: key, applied_on: date }
    const body: CreateApplicationRequest = { ...fields, application_id: creationId(id, fields) }
    void write.run({ send: () => createApplication(body), saved: close, matches: data => data.applications.some(a => a.record.application_id === body.application_id) })
  }
  return <form className="home-page__record-form" aria-label="Record application" onSubmit={e => { e.preventDefault(); submit() }}>
    <p>Record an application you have already submitted. Saving a job is not applying.</p>
    <fieldset disabled={write.locked}>
      {!fixedJob && <label>Job<select value={key} required autoFocus aria-describedby={selectedJob ? 'home-selected-job' : undefined} onChange={e => setKey(e.target.value)}><option value="">Choose a saved job</option>{jobs.map(card => <option key={card.card_key} value={card.card_key}>{jobTitle(card)}</option>)}</select></label>}
      <label>Application date<input ref={dateInput} type="date" value={date} required
        aria-describedby={fixedJob ? 'home-selected-job' : undefined} onChange={e => setDate(e.target.value)} /></label>
    </fieldset>
    {selectedJob && <p className="home-page__selected-job" id="home-selected-job" aria-live="polite">Selected job: <strong>{jobTitle(selectedJob)}</strong> · {visiblePostingText(selectedJob.posting.identity.company_name?.value) ?? 'Company not specified'}</p>}
    <div className="home-page__record-actions"><button className="home-page__record-primary" disabled={write.pending || (write.uncertain && !write.checked)}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : 'Record application'}</button><button type="button" className="home-page__record-action" disabled={write.locked} onClick={close}>Cancel</button></div>
    <WriteFeedback write={write} />
  </form>
}

const applicationStatusLabels: Record<ApplicationStatus, string> = {
  applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
}

type LinkedJobRead = { sourceKey: string; cardKey: string; error?: string }
type CardOpener = { trigger: HTMLButtonElement; sourceKey?: string }

function canUseCardOpener({ trigger, sourceKey }: CardOpener) {
  return trigger.isConnected && trigger.closest('details:not([open])') === null &&
    (sourceKey === undefined || trigger.dataset.jobSource === sourceKey)
}

function ApplicationRow({ record, title, refresh, linkedJobAction }: {
  record: ApplicationRecord; title: string; refresh: HomeRecordsRefresh; linkedJobAction: ReactNode
}) {
  const [draft, setDraft] = useState<{ initial: ApplicationStatus; status: ApplicationStatus } | null>(null)
  const [receipt, setReceipt] = useState<{ previous: ApplicationRecord; status: ApplicationStatus } | null>(null)
  const latestRecord = useRef(record)
  const action = useRef<HTMLButtonElement>(null)
  const editor = useRef<HTMLFormElement>(null)
  const returnFocus = useRef(false)
  const titleId = useId()
  const write = useRecordWrite<ApplicationRecord>(refresh)
  const isEditing = draft !== null
  // Retain the confirmed PATCH result until another overview is available.
  const savedStatus = receipt?.previous === record ? receipt.status : record.status

  useEffect(() => { latestRecord.current = record }, [record])
  useEffect(() => {
    if (!isEditing && !write.pending && returnFocus.current) {
      returnFocus.current = false
      if (document.activeElement === document.body) action.current?.focus({ preventScroll: true })
    }
  }, [isEditing, write.pending])

  function handleChangeStatus() {
    write.clearFeedback()
    setDraft({ initial: savedStatus, status: savedStatus })
  }

  function closeEditor(restoreFocus = editor.current?.contains(document.activeElement) ?? false) {
    returnFocus.current = restoreFocus
    setDraft(null)
  }

  function handleCancel() {
    write.clearFeedback()
    closeEditor(true)
  }

  function focusEditor() {
    editor.current?.focus({ preventScroll: true })
  }

  const canSave = draft !== null && !write.pending && (write.uncertain
    ? write.checked
    : draft.status !== draft.initial && draft.status !== savedStatus)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return

    focusEditor()
    const applicationId = record.application_id
    const requestedStatus = draft.status
    void write.run({
      send: async () => {
        const result = await changeApplication(applicationId, requestedStatus)
        if (result.application_id !== applicationId || result.status !== requestedStatus) {
          throw new HomeApiError('Save response did not confirm this application status. Refresh to check saved records before retrying.', true)
        }
        return result
      },
      saved: result => {
        if (result) setReceipt({ previous: latestRecord.current, status: result.status })
        closeEditor()
      },
      matches: data => data.applications.some(({ record: saved }) => saved.application_id === applicationId && saved.status === requestedStatus),
    })
  }

  return <li>
    <div className="home-page__application-row-summary">
      <span className="home-page__application-row-copy">
        <strong id={titleId}>{title}</strong> · {savedStatus} · <time dateTime={record.applied_on}>{dateFact(record.applied_on)}</time>
      </span>
      <div className="home-page__record-actions">
        {linkedJobAction}
        {!isEditing && <button ref={action} type="button" className="home-page__record-action" aria-describedby={titleId}
          onClick={handleChangeStatus} disabled={write.pending}>Change status</button>}
      </div>
    </div>
    {isEditing && <form ref={editor} tabIndex={-1} className="home-page__record-form home-page__application-status-form"
      aria-label="Change application status" aria-describedby={titleId} onSubmit={handleSubmit}>
      <label>Status<select autoFocus value={draft.status} disabled={write.locked}
        onChange={event => setDraft({ initial: draft.initial, status: event.target.value as ApplicationStatus })}>
        {Object.entries(applicationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <div className="home-page__record-actions">
        <button className="home-page__record-primary" disabled={!canSave}>{write.pending ? 'Saving…' : write.uncertain ? 'Retry same request' : 'Save status'}</button>
        <button type="button" className="home-page__record-action" onClick={handleCancel} disabled={write.locked}>Cancel</button>
      </div>
    </form>}
    <WriteFeedback write={write} onCheckStart={focusEditor} />
  </li>
}

export function HomeRecords({ data, today, refresh, homeIntent }: {
  data: HomeOverview; today: string; refresh: HomeRecordsRefresh; homeIntent?: HomeCardIntent
}) {
  const [eventEditor, setEventEditor] = useState<EventEditor | null>(() =>
    homeIntent?.kind === 'follow-up' ? { kind: 'create', initialJob: homeIntent.card } : null)
  const applicationJob = homeIntent?.kind === 'application' ? homeIntent.card : null
  const [alreadyRecorded, setAlreadyRecorded] = useState(() => applicationJob && data.applications.some(({ record }) => record.card_key === applicationJob.card_key)
    ? applicationJob : null)
  const [applicationEditor, setApplicationEditor] = useState<ApplicationEditor | null>(() =>
    applicationJob && !alreadyRecorded ? { kind: 'fixed', card: applicationJob } : null)
  const [jobs, setJobs] = useState<PostingCard[] | null>(null)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const [linkedJobRead, setLinkedJobRead] = useState<LinkedJobRead | null>(null)
  const pendingLinkedJob = useRef<(LinkedJobRead & { controller: AbortController }) | null>(null)
  const active = useRef(false)
  const jobsGuard = useRef(false)
  const applicationHeading = useRef<HTMLHeadingElement>(null)
  const applicationHistory = useRef<HTMLDetailsElement>(null)
  const applicationHistorySummary = useRef<HTMLElement>(null)
  const eventHeading = useRef<HTMLHeadingElement>(null)
  const opener = useRef<CardOpener | null>(null)
  const confirmedApplication = applicationEditor?.kind === 'fixed'
    ? data.applications.find(({ record }) => record.card_key === applicationEditor.card.card_key)?.record
    : undefined
  useEffect(() => {
    active.current = true
    return () => { active.current = false; pendingLinkedJob.current?.controller.abort() }
  }, [])
  useLayoutEffect(() => {
    if (!alreadyRecorded) return
    const history = applicationHistory.current
    if (history) history.open = true
    if (document.activeElement === document.body) applicationHeading.current?.focus()
  }, [alreadyRecorded])
  async function openApplication(key: string) {
    if (jobsGuard.current) return
    setApplicationEditor({ kind: 'choose', cardKey: key })
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
  function showRecordedApplication(card: PostingCard) {
    setAlreadyRecorded(card)
    setApplicationEditor(null)
  }
  function closeEvent() {
    setEventEditor(null)
    requestAnimationFrame(() => eventHeading.current?.focus({ preventScroll: true }))
  }
  function handleApplicationHistorySummary() {
    const request = pendingLinkedJob.current
    if (!applicationHistory.current?.open || !request?.sourceKey.startsWith('application:')) return
    request.controller.abort()
    pendingLinkedJob.current = null
    setLinkedJobRead(null)
  }
  function handleCloseOpenedCard() {
    const previousOpener = opener.current
    opener.current = null
    setOpenedCard(null)
    requestAnimationFrame(() => {
      if (!previousOpener || (document.activeElement !== document.body && document.activeElement !== previousOpener.trigger)) return
      if (canUseCardOpener(previousOpener)) {
        previousOpener.trigger.focus({ preventScroll: true })
      } else if (previousOpener.sourceKey?.startsWith('application:')) {
        (applicationHistorySummary.current ?? applicationHeading.current)?.focus({ preventScroll: true })
      }
    })
  }
  async function handleOpenLinkedJob(sourceKey: string, cardKey: string, trigger: HTMLButtonElement) {
    if (pendingLinkedJob.current?.sourceKey === sourceKey && pendingLinkedJob.current.cardKey === cardKey) return
    pendingLinkedJob.current?.controller.abort()
    const request = { sourceKey, cardKey, controller: new AbortController() }
    pendingLinkedJob.current = request
    setLinkedJobRead({ sourceKey, cardKey })
    const stillLinked = () => canUseCardOpener({ trigger, sourceKey }) && trigger.value === cardKey
    try {
      const card = await getPostingCard(cardKey, request.controller.signal)
      if (request.controller.signal.aborted || !stillLinked()) return
      opener.current = { trigger, sourceKey }
      setOpenedCard(card)
      setLinkedJobRead(null)
    } catch (error) {
      if (request.controller.signal.aborted || !stillLinked()) return
      setLinkedJobRead({ sourceKey, cardKey, error: error instanceof MissingPostingCardError
        ? 'This linked job is no longer available.' : 'Could not open the linked job. Try again.' })
    } finally {
      if (pendingLinkedJob.current === request) {
        pendingLinkedJob.current = null
        if (!stillLinked()) setLinkedJobRead(null)
      }
    }
  }
  function renderLinkedJobAction(sourceKey: string, cardKey: string | null, title: string, missing: boolean) {
    if (!cardKey || missing) return null
    const read = linkedJobRead?.sourceKey === sourceKey && linkedJobRead.cardKey === cardKey ? linkedJobRead : null
    const opening = read !== null && !read.error
    return <>
      <button type="button" className="home-page__record-action" aria-label={`View linked job: ${title}`}
        aria-haspopup="dialog" aria-disabled={opening} value={cardKey} data-job-source={sourceKey}
        onClick={(e) => { if (!opening) void handleOpenLinkedJob(sourceKey, cardKey, e.currentTarget) }}>
        {opening ? 'Opening…' : 'View linked job'}
      </button>
      {read?.error && <span role="alert">{read.error}</span>}
    </>
  }
  const upcoming = [
    ...data.upcoming.events.map(v => ({ key: v.event.event_id, date: v.event.starts_at, title: v.event.title, detail: `${v.event.kind}${v.card_missing ? ' · Job deleted' : ''}`, event: v.event, cardMissing: v.card_missing })),
    ...data.upcoming.tasks.map(t => ({ key: t.task_id, date: `${t.due_on}T00:00:00`, title: t.title, detail: 'Task due', event: null, cardMissing: false })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const nextEvent = data.today.events.find(v => new Date(v.event.ends_at ?? v.event.starts_at).getTime() >= Date.now())
  return <>
    <div className="home-page__schedule-columns">
      <section aria-labelledby="home-today-title">
        <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-today-title">Today</h2><span className="home-page__count">{data.today.tasks.length} tasks</span></div>
        {nextEvent ? <article className="home-page__featured-event">
          <span className="home-page__eyebrow">Next up · {nextEvent.event.kind}</span><strong>{nextEvent.event.title}</strong>
          <span>{dateTime(nextEvent.event.starts_at)}{nextEvent.card_missing ? ' · Job deleted' : ''}</span>
          <button className="home-page__record-action" type="button" disabled={eventEditor !== null} onClick={() => setEventEditor({ kind: 'adjust', event: nextEvent.event })}>Adjust event</button>
          {renderLinkedJobAction(`today:${nextEvent.event.event_id}`, nextEvent.event.card_key, nextEvent.event.title, nextEvent.card_missing)}
        </article> : <p className="home-page__empty">No more events scheduled today. Add one in Upcoming.</p>}
        <TaskForm today={today} refresh={refresh} />
        <ul className="home-page__task-list home-page__stable-list" aria-label="Today's tasks">{data.today.tasks.map(t => <TaskRow key={t.task_id} task={t} refresh={refresh} />)}</ul>
        {data.today.tasks.length === 0 && <p className="home-page__empty">No pending tasks for today. Add your next step above.</p>}
        <details className="home-page__completed"><summary>{data.today.completed_count} completed today</summary><ul>{data.today.completed_tasks.map(t => <li key={t.task_id}>{t.title}</li>)}</ul></details>
      </section>
      <section className="home-page__upcoming" aria-labelledby="home-upcoming-title">
        <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-upcoming-title" ref={eventHeading} tabIndex={-1}>Upcoming</h2><span className="home-page__count">Next 14 days</span><button className="home-page__record-action" type="button" disabled={eventEditor !== null} onClick={() => setEventEditor({ kind: 'create', initialJob: null })}><IconPlus aria-hidden="true" />Add event</button></div>
        {eventEditor && <EventForm key={eventEditor.kind === 'create' ? 'new' : eventEditor.event.event_id}
          editor={eventEditor} refresh={refresh} close={closeEvent} />}
        {upcoming.length === 0 ? <p className="home-page__empty">No recorded deadlines or events in the next 14 days.</p> : <ul className="home-page__upcoming-list" aria-label="Upcoming records">{upcoming.map(item => <li className="home-page__upcoming-row home-page__record-upcoming" key={item.key}>
          <div className="home-page__row-copy"><time dateTime={item.date}>{dateTime(item.date)}</time><strong>{item.title}</strong><span>{item.detail}</span></div>
          {item.event && <div className="home-page__record-actions">
            <button className="home-page__record-action" type="button" disabled={eventEditor !== null}
              onClick={() => { if (item.event) setEventEditor({ kind: 'adjust', event: item.event }) }}>Adjust</button>
            {renderLinkedJobAction(`upcoming:${item.event.event_id}`, item.event.card_key, item.event.title, item.cardMissing)}
          </div>}
        </li>)}</ul>}
      </section>
    </div>
    <section aria-labelledby="home-search-title">
      <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-search-title" ref={applicationHeading} tabIndex={-1}>Your search</h2><button className="home-page__record-action" type="button" disabled={applicationEditor !== null} onClick={() => void openApplication('')}>Record application</button></div>
      <dl className="home-page__metrics"><div className="home-page__metric"><span className="home-page__metric-icon home-page__metric-icon--applications" aria-hidden="true"><IconFileText /></span><dt>Active applications</dt><dd>{data.your_search.active}</dd></div><div className="home-page__metric"><span className="home-page__metric-icon" aria-hidden="true"><IconMail /></span><dt>Awaiting reply</dt><dd>{data.your_search.awaiting_reply}</dd></div><div className="home-page__metric"><span className="home-page__metric-icon" aria-hidden="true"><IconCalendarEvent /></span><dt>Interviews in next 7 days</dt><dd>{data.your_search.interviews}</dd></div></dl>
      {alreadyRecorded && !applicationEditor && <div role="status">
        <p>An application is already recorded for this job.</p><p className="home-page__selected-job">{jobTitle(alreadyRecorded)}</p>
      </div>}
      {applicationEditor !== null && <div className="home-page__application-editor">
        {applicationEditor.kind === 'fixed' ? <ApplicationForm editor={applicationEditor} today={today} refresh={refresh}
            close={closeApplication} confirmedRecord={confirmedApplication} onAlreadyRecorded={showRecordedApplication} />
          : jobsLoading ? <p role="status">Loading saved jobs…</p>
          : jobsError ? <div><p role="alert">{jobsError}</p><button className="home-page__record-action" type="button" onClick={() => void openApplication(applicationEditor.cardKey)}>Retry loading jobs</button><button className="home-page__record-action" type="button" onClick={closeApplication}>Cancel</button></div>
          : jobs?.length ? <ApplicationForm jobs={jobs} editor={applicationEditor} today={today} refresh={refresh} close={closeApplication} />
          : <p className="home-page__empty">Save a job in Import posting first, then return here to record an application. <button className="home-page__record-action" type="button" onClick={closeApplication}>Close</button></p>}
      </div>}
      {data.applications.length > 0 && <details className="home-page__application-history" ref={applicationHistory}>
        <summary ref={applicationHistorySummary} onClick={handleApplicationHistorySummary}>Recorded applications ({data.applications.length})</summary><ul>{data.applications.map(({ record, card_missing, card_title }) => {
        const confirmedTitle = visiblePostingText(card_title)
        const handedOffCard = applicationJob?.card_key === record.card_key ? applicationJob : undefined
        const card = confirmedTitle ? undefined : handedOffCard ??
          data.recent_jobs.find(j => j.card.card_key === record.card_key)?.card ?? jobs?.find(j => j.card_key === record.card_key)
        const title = card_missing ? 'Job deleted' : confirmedTitle ?? (card ? jobTitle(card) : 'Saved job')
        return <ApplicationRow key={record.application_id} record={record} title={title} refresh={refresh}
          linkedJobAction={renderLinkedJobAction(`application:${record.application_id}`, record.card_key, title, card_missing)} />
      })}</ul></details>}
    </section>
    <section className="home-page__recent-jobs" aria-labelledby="home-recent-jobs-title"><div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-recent-jobs-title">Recent jobs</h2><span className="home-page__count">Latest saved jobs</span></div>
      {data.recent_jobs.length === 0 ? <p className="home-page__empty">No saved jobs yet. Use Import posting to review and save your first job.</p> : <ul className="home-page__recent-list" aria-label="Recent saved jobs">{data.recent_jobs.map(({ card, application }) => <li className="home-page__recent-row home-page__record-job" key={card.card_key}><span className="home-page__company-mark" aria-hidden="true"><IconBuilding /></span><div className="home-page__row-copy"><button type="button" className="home-page__job-title" onClick={(event) => {
        pendingLinkedJob.current?.controller.abort()
        pendingLinkedJob.current = null
        setLinkedJobRead(null)
        opener.current = { trigger: event.currentTarget }
        setOpenedCard(card)
      }}>{jobTitle(card)}</button><span>{card.posting.identity.company_name?.value || 'Company not specified'}</span><span>{application ? `Application: ${application.status}` : 'Saved · No application recorded'}</span></div>{!application && <button className="home-page__record-action" type="button" disabled={applicationEditor !== null} onClick={() => void openApplication(card.card_key)}>Record application</button>}</li>)}</ul>}
    </section>
    {openedCard && <PostingCardDetails card={openedCard} isReadOnly onUpdate={async () => { throw new Error('Edit this job in Card library.') }} onClose={handleCloseOpenedCard} />}
  </>
}
