import { writeFile } from 'node:fs/promises'
import { expect, test as base } from '@playwright/test'
import { CARD, frameTargets, scrollOffsets, visibilityProblem } from './profile-matching.browser.test.mjs'

// Home shared-records behavior in the real App DOM, imported by
// settings-providers.browser.test.mjs (the only file Playwright discovers).
// Expected behavior comes from docs/home.md and decision D06397dc9, not from the
// placeholder screen. A small in-memory fake plays the SERVER: it keeps records and
// derives the projection the documented way, so these tests check what the real
// components send, refresh and display. Every other request fails closed. All content is
// synthetic DEMO data; a mocked browser run proves no real persistence or real backend.

const API = 'http://127.0.0.1:8000'
const SETTINGS = { user: { display_name: 'Demo Student' }, ai: { providers: [], tasks: [] } }
const VIEWPORTS = [{ width: 1440, height: 1000 }, { width: 900, height: 1000 }]
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const LONG_TITLE = 'Werkstudent (m/w/d) Datenanalyse, Reporting und Marktkommunikation für Netzentgeltabrechnung und Energiewirtschaft (DEMO)'
const LONG_COMPANY = 'Süddeutsche Energieversorgungs- und Netzinfrastrukturgesellschaft mit beschränkter Haftung (DEMO)'
const LONG_TASK = 'Bewerbungsunterlagen für die Werkstudentenstelle Netzentgeltabrechnung überarbeiten und Anschreiben abstimmen (DEMO)'
const LONG_EVENT = 'Vorstellungsgespräch Fachbereich Marktkommunikation und Regulierungsmanagement mit Geschäftsführung (DEMO)'
const SMALL_TITLE = 'Praktikum Softwareentwicklung (DEMO)'

// ------------------------------------------------------------------ local dates

const homeNow = new Date('2026-11-27T12:00:00.000Z')
const test = base.extend({
  timezoneId: 'UTC',
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(homeNow)
    await provide(page)
  },
})
const pad = (n) => String(n).padStart(2, '0')
const dayAt = (offset, hour = 12, minute = 0) => new Date(Date.UTC(
  homeNow.getUTCFullYear(), homeNow.getUTCMonth(), homeNow.getUTCDate() + offset, hour, minute,
))
const dateOf = (offset) => dayAt(offset).toISOString().slice(0, 10)
const localInput = (offset, hour, minute = 0) => `${dateOf(offset)}T${pad(hour)}:${pad(minute)}`
const iso = (offset, hour = 12, minute = 0) => dayAt(offset, hour, minute).toISOString()
const uuid = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function cardOf(n, title, company) {
  return {
    ...CARD, card_key: uuid(100 + n), import_key: uuid(200 + n), created_at: iso(-n, 9),
    posting: { ...CARD.posting, identity: { ...CARD.posting.identity,
      position_title: { value: title, origin: 'source' }, company_name: { value: company, origin: 'source' } } },
  }
}
const task = (n, title, extra = {}) => ({ task_id: uuid(n), title, due_on: null, created_at: iso(-3, 9), completed_at: null, ...extra })
const event = (n, title, kind, startsAt, extra = {}) => ({
  event_id: uuid(300 + n), title, kind, starts_at: startsAt, ends_at: null, card_key: null, cancelled: false, created_at: iso(-3, 9), ...extra,
})
const activity = (n, kind, at, subject, cardKey = null) => ({ event_id: uuid(400 + n), kind, occurred_at: at, subject_key: subject, card_key: cardKey })

// ------------------------------------------------------------ the fake server

// Rules follow docs/home.md "Overview and count definitions": today = undated/overdue/due-today
// open tasks, completed = completed inside the supplied day window, events are half-open
// windows, creation of a task is not an activity, completion/adjustment each count once.
function makeState(seed = {}) {
  const state = { calls: [], writes: [], unexpected: [], adjustments: 0 }
  const now = () => homeNow.toISOString()
  state.load = ({ tasks = [], events = [], applications = [], activities = [], cards = [], providers = [] } = {}) => {
    Object.assign(state, {
      tasks: structuredClone(tasks), events: structuredClone(events), applications: structuredClone(applications),
      activities: structuredClone(activities), cards: structuredClone(cards), providers: structuredClone(providers),
    })
  }
  state.load(seed)
  const record = (kind, subject, cardKey = null) => {
    if (state.activities.some((a) => a.subject_key === subject)) return
    state.activities.push({ event_id: uuid(500 + state.activities.length), kind, occurred_at: now(), subject_key: subject, card_key: cardKey })
  }
  const missing = (key) => key !== null && !state.cards.some((c) => c.card_key === key)

  state.createTask = (body) => {
    const same = state.tasks.find((t) => t.task_id === body.task_id)
    if (same) return same.title === body.title && same.due_on === (body.due_on ?? null) ? { status: 200, json: same } : { status: 409, json: { detail: 'home.id_conflict' } }
    const created = { task_id: body.task_id, title: body.title, due_on: body.due_on ?? null, created_at: now(), completed_at: null }
    state.tasks.push(created)
    return { status: 201, json: created }
  }
  state.completeTask = (id) => {
    const found = state.tasks.find((t) => t.task_id === id)
    if (!found) return { status: 404, json: { detail: 'home.not_found' } }
    if (!found.completed_at) { found.completed_at = now(); record('task_completed', `task:${id}`) }
    return { status: 200, json: found }
  }
  state.createEvent = (body) => {
    const created = { event_id: body.event_id, title: body.title, kind: body.kind, starts_at: body.starts_at, ends_at: body.ends_at ?? null,
      card_key: body.card_key ?? null, cancelled: body.cancelled ?? false, created_at: now() }
    state.events.push(created)
    record('event_recorded', `event:${body.event_id}`, created.card_key)
    return { status: 201, json: created }
  }
  state.patchEvent = (id, body) => {
    const found = state.events.find((e) => e.event_id === id)
    if (!found) return { status: 404, json: { detail: 'home.not_found' } }
    Object.assign(found, body)
    record('event_adjusted', `event:${id}:adjustment:${++state.adjustments}`, found.card_key)
    return { status: 200, json: found }
  }
  state.createApplication = (body) => {
    if (missing(body.card_key)) return { status: 404, json: { detail: 'home.card_not_found' } }
    if (state.applications.some((a) => a.card_key === body.card_key)) return { status: 409, json: { detail: 'home.application_exists' } }
    const created = { application_id: body.application_id, card_key: body.card_key, applied_on: body.applied_on, status: body.status ?? 'applied', created_at: now(), updated_at: now() }
    state.applications.push(created)
    record('application_recorded', `application:${body.application_id}`, body.card_key)
    return { status: 201, json: created }
  }
  state.patchApplication = (id, { status }) => {
    const found = state.applications.find((application) => application.application_id === id)
    if (!found) return { status: 404, json: { detail: 'home.not_found' } }
    if (found.status !== status) {
      Object.assign(found, { status, updated_at: now() })
      record('application_status_changed', `application_status_changed:${id}:${state.activities.length}`, found.card_key)
    }
    return { status: 200, json: found }
  }

  state.overview = (params) => {
    const today = params.get('today')
    const inside = (value, from, to) => Date.parse(value) >= Date.parse(params.get(from)) && Date.parse(value) < Date.parse(params.get(to))
    const view = (e) => ({ event: e, card_missing: missing(e.card_key) })
    const open = state.tasks.filter((t) => !t.completed_at)
    const live = state.events.filter((e) => !e.cancelled)
    const done = state.tasks.filter((t) => t.completed_at && inside(t.completed_at, 'day_start', 'day_end'))
    return {
      today: { tasks: open.filter((t) => !t.due_on || t.due_on <= today), completed_count: done.length, completed_tasks: done, events: live.filter((e) => inside(e.starts_at, 'day_start', 'day_end')).map(view) },
      upcoming: { events: live.filter((e) => inside(e.starts_at, 'day_start', 'upcoming_end')).map(view), tasks: open.filter((t) => t.due_on && t.due_on > today && t.due_on < dateOf(14)) },
      your_search: {
        active: state.applications.filter((a) => ['applied', 'interviewing'].includes(a.status)).length,
        awaiting_reply: state.applications.filter((a) => a.status === 'applied').length,
        interviews: live.filter((e) => e.kind === 'interview' && inside(e.starts_at, 'day_start', 'interviews_end')).length,
      },
      applications: [...state.applications].reverse().map((record_) => {
        const card = state.cards.find(({ card_key }) => card_key === record_.card_key)
        const title = card ? card.posting_alias || card.posting.identity.position_title?.value || 'Untitled job' : null
        return { record: record_, card_missing: !card, card_title: title }
      }),
      recent_jobs: [...state.cards].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)
        .map((card) => ({ card, application: state.applications.find((a) => a.card_key === card.card_key) ?? null })),
      recent_activity: [...state.activities].reverse().slice(0, 10).map((e) => ({ event: e, card_missing: missing(e.card_key) })),
      ai_usage: { status: 'not_recorded', tokens: null, estimated_cost_usd: null, providers: state.providers },
    }
  }
  state.activityData = () => ({
    events: state.activities,
    recording_started_at: state.activities.length ? state.activities.map((a) => a.occurred_at).sort()[0] : null,
  })
  return state
}

const respond = (route, result) => route.fulfill({ status: result.status, json: result.json })
const idOf = (request) => new URL(request.url()).pathname.split('/')[3]
const count = (state, key) => state.calls.filter((call) => call === key).length
const bodiesOf = (state, key) => state.writes.filter((write) => write.key === key).map((write) => write.body)

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

// `routes` replaces a default handler for one "METHOD /path" key; it receives `ok`, the
// default behavior, so a scenario can fail, delay or lose a response around a real write.
async function installHome({ context, baseURL, state, routes = {} }) {
  const defaults = {
    'GET /settings': (route) => route.fulfill({ json: SETTINGS }),
    'GET /profile': (route) => route.fulfill({ json: null }),
    'GET /goal': (route) => route.fulfill({ json: null }),
    'GET /posting/card': (route) => route.fulfill({ json: state.cards }),
    'GET /home/overview': (route, request) => route.fulfill({ json: state.overview(new URL(request.url()).searchParams) }),
    'GET /home/activity': (route) => route.fulfill({ json: state.activityData() }),
    'POST /home/tasks': (route, request) => respond(route, state.createTask(request.postDataJSON())),
    'POST /home/tasks/:id/complete': (route, request) => respond(route, state.completeTask(idOf(request))),
    'POST /home/events': (route, request) => respond(route, state.createEvent(request.postDataJSON())),
    'PATCH /home/events/:id': (route, request) => respond(route, state.patchEvent(idOf(request), request.postDataJSON())),
    'POST /home/applications': (route, request) => respond(route, state.createApplication(request.postDataJSON())),
    'PATCH /home/applications/:id': (route, request) => respond(route, state.patchApplication(idOf(request), request.postDataJSON())),
  }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API) {
      const key = `${request.method()} ${url.pathname.replace(/^(\/home\/(?:tasks|events|applications))\/[^/]+/, '$1/:id')}`
      state.calls.push(key)
      if (request.method() !== 'GET') state.writes.push({ key, path: url.pathname, body: request.postDataJSON() })
      const handler = routes[key] ?? defaults[key]
      if (!handler) { state.unexpected.push(`${request.method()} ${url.pathname}`); await route.abort('blockedbyclient'); return }
      await handler(route, request, () => defaults[key](route, request))
    } else if (url.origin === baseURL && request.method() === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
    } else {
      state.unexpected.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') socket.connectToServer()
    else { state.unexpected.push(`WebSocket ${socket.url()}`); socket.close() }
  })
}

// ---------------------------------------------------------------- page helpers

const settle = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)))
const mainNavigation = (page) => page.getByRole('navigation', { name: 'Main navigation' })
const region = (page, name) => page.getByRole('region', { name, exact: true })
const heading = (page, name) => page.getByRole('heading', { name, level: 2, exact: true })
const overviewScroller = (page) => page.locator('.home-page__overview')
const taskForm = (page) => page.getByRole('form', { name: 'Add task' })
const taskList = (page) => page.getByRole('list', { name: "Today's tasks" })
const metric = (page, label) => page.locator('.home-page__metric').filter({ hasText: label }).locator('dd')
const completedSummary = (page) => page.locator('details.home-page__completed summary')
const heatCell = (page, date, text) => page.locator(`rect[aria-label="${date}: ${text}"]`)

async function openHome(page, viewport) {
  if (viewport) await page.setViewportSize(viewport)
  // The App opens on Import posting; Home is reached through the main navigation.
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo Student')
}

// Anything in the personal overview that leaves its column, apart from the calendar's own
// intentionally scrollable strip. Why not a generic text-clipping engine: Home has no
// overflow:hidden text, so a box leaving the column is the real failure to catch.
function horizontalProblems(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.home-page__overview')
    const box = root.getBoundingClientRect()
    const problems = []
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`overview scrolls horizontally ${root.scrollWidth}>${root.clientWidth}`)
    for (const node of root.querySelectorAll('*')) {
      if (node.closest('.home-page__activity-scroll')) continue
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.right > box.right + 1 || rect.left < box.left - 1) {
        problems.push(`outside column: ${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)} "${(node.textContent ?? '').trim().slice(0, 40)}"`)
      }
    }
    return problems
  })
}

// Several records of every kind, long German text, one deleted Card reference. Expected counts
// in the tests derive from this table, not from the rendered page.
function seededRecords({ providers = [] } = {}) {
  const cardA = cardOf(1, LONG_TITLE, LONG_COMPANY)
  const cardB = cardOf(2, SMALL_TITLE, 'Kleine Firma GmbH (DEMO)')
  const gone = uuid(999)
  return {
    cards: [cardA, cardB],
    tasks: [
      task(1, LONG_TASK, { due_on: dateOf(-1) }), task(2, 'Lebenslauf aktualisieren (DEMO)'), task(3, 'Referenzen sammeln (DEMO)'),
      task(4, 'Portfolio-Link prüfen (DEMO)', { due_on: dateOf(5) }),
      task(5, 'Erledigte Aufgabe (DEMO)', { completed_at: homeNow.toISOString() }),
    ],
    events: [
      event(1, LONG_EVENT, 'interview', iso(0, 23, 55)),
      event(2, 'Bewerbungsfrist Stadtwerke (DEMO)', 'deadline', iso(2, 10)),
      event(3, 'Abgesagter Termin (DEMO)', 'other', iso(1, 10), { cancelled: true }),
    ],
    applications: [
      { application_id: uuid(601), card_key: cardA.card_key, applied_on: dateOf(-1), status: 'applied', created_at: iso(-1, 9), updated_at: iso(-1, 9) },
      { application_id: uuid(602), card_key: gone, applied_on: dateOf(-1), status: 'interviewing', created_at: iso(-1, 10), updated_at: iso(-1, 10) },
    ],
    activities: [
      activity(1, 'card_saved', iso(-3, 9), 'card:1', cardA.card_key), activity(2, 'card_saved', iso(-2, 9), 'card:2', cardB.card_key),
      activity(3, 'application_recorded', iso(-1, 9), 'application:601', cardA.card_key),
      activity(4, 'application_recorded', iso(-1, 10), 'application:602', gone),
      activity(5, 'task_completed', homeNow.toISOString(), 'task:5'),
    ],
    providers,
  }
}

// ------------------------------------------------------------------- load states

test('HF-LOAD-ERR failed overview and activity reads show errors with Retry, never an empty state, then recover', async ({ page, context, baseURL }) => {
  const state = makeState()
  let failing = true
  const outage = (route) => route.fulfill({ status: 500, json: { detail: 'DEMO outage' } })
  await installHome({ context, baseURL, state, routes: {
    'GET /home/overview': (route, request, ok) => (failing ? outage(route) : ok()),
    'GET /home/activity': (route, request, ok) => (failing ? outage(route) : ok()),
  } })
  await openHome(page, VIEWPORTS[0])

  const errors = page.locator('.home-page__load-error')
  await expect(errors).toHaveCount(2)
  await expect(errors.first()).toContainText('Local storage is unavailable')
  await expect(page.getByRole('button', { name: 'Retry Home', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry activity', exact: true })).toBeVisible()
  // A failed read is not "no records": no empty-state copy, no zero-valued cells, no entry form.
  for (const text of [/No pending tasks for today/, /No recorded operations yet/, /No provider budget configured/, /No activity has been recorded yet/, /No saved jobs yet/]) {
    await expect(page.getByText(text)).toHaveCount(0)
  }
  await expect(taskForm(page)).toHaveCount(0)
  await expect(page.locator('.home-page__summary')).toHaveCount(0)
  await expect(page.locator('rect[aria-label$="recorded workspace operations"]')).toHaveCount(0)

  failing = false
  await page.getByRole('button', { name: 'Retry Home', exact: true }).click()
  await expect(taskForm(page)).toBeVisible()
  await expect(page.getByText(/No pending tasks for today/)).toBeVisible()
  await expect(errors).toHaveCount(0)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('HF-EMPTY a new user sees short explanations and entry points, unrecorded heatmap days and neutral zeros', async ({ page, context, baseURL }) => {
  const state = makeState()
  await installHome({ context, baseURL, state })
  await openHome(page, VIEWPORTS[0])

  const summary = page.locator('.home-page__summary')
  await expect(summary).toBeVisible()
  await expect(summary).not.toHaveText(/\d/)
  await expect(taskForm(page).getByRole('button', { name: 'Add task', exact: true })).toBeVisible()
  await expect(region(page, 'Today').getByText(/No pending tasks for today/)).toBeVisible()
  await expect(completedSummary(page)).toHaveText('0 completed today')
  await expect(region(page, 'Upcoming').getByRole('button', { name: 'Add event' })).toBeVisible()
  await expect(region(page, 'Upcoming').getByText(/No recorded deadlines or events/)).toBeVisible()
  await expect(region(page, 'Your search').getByRole('button', { name: 'Record application', exact: true })).toBeVisible()
  for (const label of ['Active applications', 'Awaiting reply', 'Interviews in next 7 days']) await expect(metric(page, label)).toHaveText('0')
  await expect(region(page, 'Recent jobs').getByText(/No saved jobs yet.*Import posting/)).toBeVisible()
  await expect(region(page, 'Recent activity').getByText(/No recorded operations yet/)).toBeVisible()
  await expect(page.locator('section.home-page__usage').getByText('No provider budget configured.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  // With no recorded operation there is no recording start: every elapsed day is "not recorded".
  await expect(page.getByText(/No activity has been recorded yet/)).toBeVisible()
  await expect(heatCell(page, dateOf(0), 'Not recorded')).toHaveCount(1)
  await expect(heatCell(page, `${homeNow.getUTCFullYear()}-01-01`, 'Not recorded')).toHaveCount(1)
  await expect(page.locator('rect[aria-label$=": 0 recorded workspace operations"]')).toHaveCount(0)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('HF-SEEDED many records with long German text render from server facts without overflow or covering', async ({ page, context, baseURL }) => {
  const state = makeState(seededRecords())
  await installHome({ context, baseURL, state })
  await openHome(page, VIEWPORTS[0])
  await expect(region(page, 'Today')).toBeVisible()

  // 3 open tasks today (overdue + 2 undated), 1 event today, 2 active applications.
  await expect(page.locator('.home-page__summary')).toHaveText(/\b3\b.*tasks?.*\b1\b.*events?.*\b2\b.*applications?/i)
  await expect(taskList(page).getByRole('listitem')).toContainText([LONG_TASK, 'Lebenslauf aktualisieren (DEMO)', 'Referenzen sammeln (DEMO)'])
  await expect(page.locator('.home-page__featured-event')).toContainText(LONG_EVENT)
  await expect(completedSummary(page)).toHaveText('1 completed today')
  await completedSummary(page).click()
  await expect(page.locator('details.home-page__completed li')).toHaveText('Erledigte Aufgabe (DEMO)')

  // Upcoming: today's event, the deadline in two days and the task due in five; cancelled event absent.
  await expect(page.getByRole('list', { name: 'Upcoming records' }).getByRole('listitem'))
    .toContainText([LONG_EVENT, 'Bewerbungsfrist Stadtwerke (DEMO)', 'Portfolio-Link prüfen (DEMO)'])
  await expect(page.getByText('Abgesagter Termin (DEMO)')).toHaveCount(0)

  await expect(metric(page, 'Active applications')).toHaveText('2')
  await expect(metric(page, 'Awaiting reply')).toHaveText('1')
  await expect(metric(page, 'Interviews in next 7 days')).toHaveText('1')

  const jobs = page.getByRole('list', { name: 'Recent saved jobs' }).getByRole('listitem')
  await expect(jobs).toHaveCount(2)
  await expect(jobs.nth(0)).toContainText(LONG_TITLE)
  await expect(jobs.nth(0)).toContainText('Application: applied')
  await expect(jobs.nth(0).getByRole('button', { name: 'Record application' })).toHaveCount(0)
  await expect(jobs.nth(1)).toContainText('Saved · No application recorded')
  await expect(jobs.nth(1).getByRole('button', { name: 'Record application' })).toBeVisible()
  await page.locator('details.home-page__application-history summary').click()
  await expect(page.locator('details.home-page__application-history summary')).toHaveText('Recorded applications (2)')
  await expect(page.locator('details.home-page__application-history li')).toContainText(['Job deleted · interviewing', `${LONG_TITLE} · applied`])

  await expect(region(page, 'Recent activity').getByRole('listitem'))
    .toContainText(['Task completed', 'Application recorded · Job deleted', 'Application recorded', 'Job saved', 'Job saved'])
  await expect(heatCell(page, dateOf(0), '1 recorded workspace operations')).toHaveCount(1)
  await expect(heatCell(page, `${homeNow.getUTCFullYear()}-01-01`, 'Not recorded')).toHaveCount(1)

  // Long text wraps inside the column and stays uncovered at both required window sizes.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await expect(region(page, 'Today')).toBeVisible()
    expect(await horizontalProblems(page), `${viewport.width}px: nothing may leave the column`).toEqual([])
    for (const [name, locator] of [
      ['long task row', taskList(page).getByRole('listitem').first()],
      ['long event card', page.locator('.home-page__featured-event')],
      ['long job row', jobs.first()],
    ]) {
      await locator.scrollIntoViewIfNeeded()
      expect(await visibilityProblem(locator), `${viewport.width}px ${name}`).toBeNull()
    }
  }
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------------ tasks

async function enterUncertainTask(page) {
  await openHome(page)
  const form = taskForm(page)
  const title = form.getByLabel('Task title')
  await title.fill(LONG_TASK)
  await form.getByRole('button', { name: 'Add task', exact: true }).press('Enter')
  await expect(form.getByRole('alert')).toContainText('Save outcome unknown')
  return {
    form, title,
    check: form.getByRole('button', { name: 'Refresh to check', exact: true }),
    retry: form.getByRole('button', { name: 'Retry same request', exact: true }),
  }
}

for (const action of ['Refresh to check', 'Refresh Home']) {
  test(`HF-RECOVERY a failed ${action} invalidates earlier retry permission`, async ({ page, context, baseURL }) => {
    const state = makeState()
    const readStarted = deferred()
    const release = deferred()
    let reads = 0
    await installHome({ context, baseURL, state, routes: {
      'POST /home/tasks': route => route.abort('failed'),
      'GET /home/overview': async (route, request, ok) => {
        if (!state.writes.length || ++reads === 1) return ok()
        readStarted.resolve()
        await release.promise
        return route.fulfill({ status: 503, json: { detail: 'home.storage_unavailable' } })
      },
    } })
    const { form, title, check, retry } = await enterUncertainTask(page)
    await check.press('Enter')
    await expect(retry).toBeEnabled()
    await expect(form.getByRole('alert')).toContainText('does not confirm')
    await page.getByRole('button', { name: action, exact: true }).press('Enter')
    await readStarted.promise
    try {
      await expect(form.getByText('does not confirm')).toHaveCount(0)
      if (action === 'Refresh Home') await expect(retry).toBeDisabled()
    } finally {
      release.resolve()
    }
    await expect(page.getByRole('button', { name: 'Retry Home', exact: true })).toBeEnabled()
    await expect(retry).toBeDisabled()
    await expect(check).toBeEnabled()
    await expect(title).toHaveValue(LONG_TASK)
    expect(reads).toBe(2)
    expect(state.writes).toHaveLength(1)
    expect(state.unexpected).toEqual([])
  })
}

test('HF-RECOVERY a superseded matching overview cannot clear the draft after midnight', async ({ page, context, baseURL }) => {
  const state = makeState()
  const oldReadStarted = deferred()
  const release = deferred()
  let failNewDay = true
  await installHome({ context, baseURL, state, routes: {
    'POST /home/tasks': (route, request) => {
      state.createTask(request.postDataJSON())
      return route.abort('failed')
    },
    'GET /home/overview': async (route, request, ok) => {
      if (!state.writes.length) return ok()
      const readDay = new URL(request.url()).searchParams.get('today')
      if (readDay === dateOf(0)) {
        oldReadStarted.resolve()
        await release.promise
      } else if (failNewDay) {
        return route.fulfill({ status: 503, json: { detail: 'home.storage_unavailable' } })
      }
      return ok()
    },
  } })
  const { form, title, check, retry } = await enterUncertainTask(page)
  await check.press('Enter')
  await oldReadStarted.promise
  try {
    await page.clock.setFixedTime(dayAt(1))
    await expect(page.getByRole('button', { name: 'Retry Home', exact: true })).toBeEnabled()
  } finally {
    release.resolve()
  }
  await expect(check).toBeEnabled()
  await expect(retry).toBeDisabled()
  await expect(title).toHaveValue(LONG_TASK)
  await expect(form.getByRole('status')).toHaveCount(0)
  await expect(form.getByRole('alert')).toContainText('A newer overview replaced this check')

  failNewDay = false
  await check.press('Enter')
  await expect(form.getByRole('status')).toHaveText('Saved record found after refresh.')
  await expect(title).toHaveValue('')
  expect(state.writes).toHaveLength(1)
  expect(state.unexpected).toEqual([])
})

test('HF-RECOVERY a newer overview revokes a readback waiting on Activity', async ({ page, context, baseURL }) => {
  const state = makeState()
  const activityStarted = deferred()
  const release = deferred()
  let overviewReads = 0
  let activityReads = 0
  await installHome({ context, baseURL, state, routes: {
    'POST /home/tasks': (route, request, ok) => state.writes.length === 1 ? route.abort('failed') : ok(),
    'GET /home/overview': (route, request, ok) => {
      if (state.writes.length && ++overviewReads === 2) {
        return route.fulfill({ status: 503, json: { detail: 'home.storage_unavailable' } })
      }
      return ok()
    },
    'GET /home/activity': async (route, request, ok) => {
      if (state.writes.length && ++activityReads === 1) {
        activityStarted.resolve()
        await release.promise
      }
      return ok()
    },
  } })
  const { form, title, check, retry } = await enterUncertainTask(page)
  await check.press('Enter')
  await activityStarted.promise
  try {
    await page.getByRole('button', { name: 'Refresh Home', exact: true }).press('Enter')
    await expect(page.getByRole('button', { name: 'Retry Home', exact: true })).toBeEnabled()
  } finally {
    release.resolve()
  }
  await expect(check).toBeEnabled()
  await expect(retry).toBeDisabled()
  await expect(title).toHaveValue(LONG_TASK)
  await expect(form.getByRole('alert')).toContainText('A newer overview replaced this check')
  expect(state.writes).toHaveLength(1)

  await check.press('Enter')
  await expect(retry).toBeEnabled()
  expect(state.writes).toHaveLength(1)
  await retry.press('Enter')
  await expect(taskList(page)).toContainText(LONG_TASK)
  const posted = bodiesOf(state, 'POST /home/tasks')
  expect(posted).toHaveLength(2)
  expect(posted[1]).toEqual(posted[0])
  expect(state.unexpected).toEqual([])
})

test('HF-TASK-ADD rejected, lost and duplicate task saves keep the draft, never auto-resend and leave the page still', async ({ page, context, baseURL }) => {
  const state = makeState({
    tasks: [task(1, 'Aufgabe eins (DEMO)'), task(2, 'Aufgabe zwei (DEMO)'), task(3, 'Aufgabe drei (DEMO)'), task(4, 'Aufgabe vier (DEMO)')],
    activities: [activity(1, 'card_saved', iso(-2, 9), 'card:1'), activity(2, 'task_completed', iso(-1, 9), 'task:9')],
  })
  const release = deferred()
  const SECOND = 'Zusätzliche Aufgabe (DEMO)'
  let attempts = 0
  await installHome({ context, baseURL, state, routes: {
    'POST /home/tasks': async (route, request, ok) => {
      const body = request.postDataJSON()
      if (body.title === SECOND) { await release.promise; return ok() }
      attempts += 1
      if (attempts === 1) return route.fulfill({ status: 422, json: { detail: 'DEMO rejection' } })
      if (attempts === 2) return route.abort('failed')
      return ok()
    },
  } })
  await openHome(page, { width: 900, height: 600 })
  const form = taskForm(page)
  const titleInput = form.getByLabel('Task title')
  const addButton = form.getByRole('button', { name: 'Add task', exact: true })
  const posts = () => bodiesOf(state, 'POST /home/tasks')
  await expect(taskList(page).getByRole('listitem')).toHaveCount(4)
  const activityRows = region(page, 'Recent activity').getByRole('listitem')
  await expect(activityRows).toHaveCount(2)

  // 1. A definitely rejected save keeps the draft next to the form and is not repeated.
  await titleInput.fill(LONG_TASK)
  await addButton.click()
  await expect(form.getByRole('alert')).toContainText('draft is still here')
  await expect(titleInput).toHaveValue(LONG_TASK)
  await expect(titleInput).toBeEnabled()
  await settle(page)
  expect(posts()).toHaveLength(1)
  expect(posts()[0]).toEqual({ task_id: expect.stringMatching(UUID_PATTERN), title: LONG_TASK, due_on: null })

  // 2. The identical retry reuses the record ID; its response is lost, so the outcome is unknown.
  await addButton.click()
  await expect(form.getByRole('alert')).toContainText('Save outcome unknown')
  await expect(titleInput).toBeDisabled()
  // While the outcome is unknown the submit control is relabelled and stays disabled until the user has checked.
  const retryButton = form.getByRole('button', { name: 'Retry same request', exact: true })
  await expect(retryButton).toBeDisabled()
  await settle(page)
  expect(posts(), 'a lost response is never resent automatically').toHaveLength(2)
  expect(posts()[1]).toEqual(posts()[0])
  const readsBeforeCheck = count(state, 'GET /home/overview')

  // 3. Checking is a read; the server has no such task, so only an explicit same-request retry may write.
  await form.getByRole('button', { name: 'Refresh to check', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('does not confirm')
  expect(count(state, 'GET /home/overview')).toBeGreaterThan(readsBeforeCheck)
  expect(posts()).toHaveLength(2)
  await form.getByRole('button', { name: 'Retry same request', exact: true }).click()
  await expect(taskList(page).getByRole('listitem')).toHaveCount(5)
  expect(posts()).toHaveLength(3)
  expect(posts()[2]).toEqual(posts()[0])
  await expect(taskList(page)).toContainText(LONG_TASK)
  await expect(titleInput).toHaveValue('')
  await expect(titleInput).toBeFocused()
  await expect(page.locator('.home-page__summary')).toHaveText(/\b5\b.*tasks/i)
  // Creating a task is not an activity kind: Recent activity does not grow.
  await expect(activityRows).toHaveCount(2)

  // 4. A double click while the save is in flight sends one request; adding keeps the page still.
  await titleInput.fill(SECOND)
  // At 900px the overview is not its own scroll pane (the shell content scrolls), so measure the
  // form's real nearest scrolling ancestor rather than assuming `.home-page__overview`.
  const scrollTopOfForm = () => form.evaluate((node) => {
    for (let el = node.parentElement; el; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el.scrollTop
    }
    return 0
  })
  await form.evaluate((node) => {
    for (let el = node.parentElement; el; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollTop = Math.min(80, el.scrollHeight - el.clientHeight); return }
    }
  })
  await addButton.scrollIntoViewIfNeeded()
  const stable = async () => ({ top: (await form.boundingBox()).y, scroll: await scrollTopOfForm() })
  const before = await stable()
  expect(before.scroll, 'the page must be scrolled for the stability check to mean anything').toBeGreaterThan(0)
  await addButton.dblclick()
  // The submit control is relabelled while saving, so the name-based locator no longer matches; use its stable class.
  await expect(form.locator('button.home-page__record-primary')).toHaveText('Saving…')
  await expect(titleInput).toBeDisabled()
  await settle(page)
  expect(posts().filter((body) => body.title === SECOND)).toHaveLength(1)
  release.resolve()
  await expect(taskList(page)).toContainText(SECOND)
  await expect(titleInput).toBeFocused()
  const after = await stable()
  expect(Math.abs(after.top - before.top), 'the form must not jump after Add').toBeLessThanOrEqual(1)
  expect(Math.abs(after.scroll - before.scroll), 'the scroll position must not jump after Add').toBeLessThanOrEqual(1)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('HF-TASK-DONE completing a task updates every area once, even after a lost response or a double click', async ({ page, context, baseURL }) => {
  const A = 'Aufgabe A (DEMO)'
  const B = 'Aufgabe B (DEMO)'
  const state = makeState({ tasks: [task(1, A), task(2, B)], activities: [activity(1, 'card_saved', iso(-1, 9), 'card:1')] })
  const release = deferred()
  await installHome({ context, baseURL, state, routes: {
    'POST /home/tasks/:id/complete': async (route, request, ok) => {
      if (idOf(request) === uuid(1)) { state.completeTask(uuid(1)); return route.abort('failed') } // applied, response lost
      await release.promise
      return ok()
    },
  } })
  await openHome(page, VIEWPORTS[0])
  const completeCalls = () => count(state, 'POST /home/tasks/:id/complete')
  await expect(completedSummary(page)).toHaveText('0 completed today')
  await expect(heatCell(page, dateOf(0), '0 recorded workspace operations')).toHaveCount(1)
  await expect(page.locator('.home-page__summary')).toHaveText(/\b2\b.*tasks/i)

  // The first response is lost although the server applied it: no resend, the refresh adopts it.
  const rowA = taskList(page).getByRole('listitem').filter({ hasText: A })
  await rowA.getByRole('button', { name: `Complete ${A}`, exact: true }).click()
  await expect(rowA.getByRole('alert')).toContainText('Save outcome unknown')
  await settle(page)
  expect(completeCalls()).toBe(1)
  await rowA.getByRole('button', { name: 'Refresh to check', exact: true }).click()
  await expect(taskList(page).getByRole('listitem')).toHaveCount(1)
  expect(completeCalls(), 'checking must not write again').toBe(1)
  await expect(completedSummary(page)).toHaveText('1 completed today')
  await expect(heatCell(page, dateOf(0), '1 recorded workspace operations')).toHaveCount(1)
  await expect(page.locator('.home-page__summary')).toHaveText(/\b1\b.*task/i)

  // A double click on the other row sends exactly one completion.
  const buttonB = taskList(page).getByRole('button', { name: `Complete ${B}`, exact: true })
  await buttonB.dblclick()
  await expect(buttonB).toHaveText('Saving…')
  await settle(page)
  expect(completeCalls()).toBe(2)
  release.resolve()
  await expect(completedSummary(page)).toHaveText('2 completed today')
  await expect(taskList(page).getByRole('listitem')).toHaveCount(0)
  await expect(page.getByText(/No pending tasks for today/)).toBeVisible()
  await expect(heatCell(page, dateOf(0), '2 recorded workspace operations')).toHaveCount(1)
  await expect(region(page, 'Recent activity').getByRole('listitem')).toContainText(['Task completed', 'Task completed', 'Job saved'])
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------ applications

test('HF-APP-REC an application is recorded only by an explicit submit and every related area follows', async ({ page, context, baseURL }) => {
  const cardA = cardOf(1, LONG_TITLE, LONG_COMPANY)
  const cardB = cardOf(2, SMALL_TITLE, 'Kleine Firma GmbH (DEMO)')
  const state = makeState({ cards: [cardA, cardB] })
  await installHome({ context, baseURL, state })
  await openHome(page, VIEWPORTS[0])
  const posts = () => bodiesOf(state, 'POST /home/applications')
  const jobs = page.getByRole('list', { name: 'Recent saved jobs' }).getByRole('listitem')
  const search = region(page, 'Your search')

  // Saving a job is not applying: two saved Cards, no application, no POST.
  await expect(jobs).toHaveCount(2)
  await expect(jobs.nth(0)).toContainText('Saved · No application recorded')
  await expect(jobs.nth(1)).toContainText('Saved · No application recorded')
  await expect(metric(page, 'Active applications')).toHaveText('0')
  await expect(page.locator('details.home-page__application-history')).toHaveCount(0)
  expect(posts()).toHaveLength(0)

  // Cancel closes the form without a write and returns focus to the section heading.
  await jobs.nth(1).getByRole('button', { name: 'Record application' }).click()
  const form = page.getByRole('form', { name: 'Record application' })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Job')).toHaveValue(cardB.card_key)
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(heading(page, 'Your search')).toBeFocused()
  expect(posts()).toHaveLength(0)

  // Opening from the section action leaves the select empty. Submitting it empty sends nothing.
  await search.getByRole('button', { name: 'Record application', exact: true }).click()
  await expect(form.getByLabel('Job')).toHaveValue('')
  await form.getByRole('button', { name: 'Record application', exact: true }).click()
  await settle(page)
  expect(posts(), 'an empty job selection is blocked in the browser and never posted').toHaveLength(0)
  await expect(form).toBeVisible()

  // The explicit submit sends exactly the chosen job and date.
  await form.getByLabel('Job').selectOption(cardA.card_key)
  await expect(form.getByText(/Selected job:/)).toContainText(LONG_COMPANY)
  await form.getByLabel('Application date').fill(dateOf(0))
  await form.getByRole('button', { name: 'Record application', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(posts()).toEqual([{ application_id: expect.stringMatching(UUID_PATTERN), card_key: cardA.card_key, applied_on: dateOf(0) }])

  // Every consumer of the same fact updates, and focus lands on the Your search heading.
  await expect(heading(page, 'Your search')).toBeFocused()
  await expect(metric(page, 'Active applications')).toHaveText('1')
  await expect(metric(page, 'Awaiting reply')).toHaveText('1')
  await expect(jobs.nth(0)).toContainText('Application: applied')
  await expect(jobs.nth(0).getByRole('button', { name: 'Record application' })).toHaveCount(0)
  await expect(jobs.nth(1).getByRole('button', { name: 'Record application' })).toBeVisible()
  await page.locator('details.home-page__application-history summary').click()
  await expect(page.locator('details.home-page__application-history summary')).toHaveText('Recorded applications (1)')
  await expect(page.locator('details.home-page__application-history li')).toContainText(`${LONG_TITLE} · applied`)
  await expect(region(page, 'Recent activity').getByRole('listitem')).toHaveText([/Application recorded/])
  await expect(page.locator('.home-page__summary')).toHaveText(/\b1\b active application\b/)

  // Deleting the Card elsewhere does not cascade: the application and its activity remain,
  // and a refreshed Home names the missing job instead of dropping or inventing it.
  state.cards = state.cards.filter((card) => card.card_key !== cardA.card_key)
  await page.getByRole('button', { name: 'Refresh Home', exact: true }).click()
  await expect(page.locator('details.home-page__application-history li')).toContainText('Job deleted · applied')
  await expect(region(page, 'Recent activity').getByRole('listitem')).toContainText('Application recorded · Job deleted')
  await expect(metric(page, 'Active applications')).toHaveText('1')
  await expect(jobs).toHaveCount(1)
  expect(posts(), 'refreshing never writes').toHaveLength(1)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('R004-03 old Home overviews still render recorded applications without extra reads', async ({ page, context, baseURL }) => {
  const state = makeState(seededRecords())
  await installHome({ context, baseURL, state, routes: {
    'GET /home/overview': (route, request) => {
      const overview = state.overview(new URL(request.url()).searchParams)
      return route.fulfill({ json: {
        ...overview,
        applications: overview.applications.map(({ record, card_missing }) => ({ record, card_missing })),
      } })
    },
  } })
  await openHome(page, VIEWPORTS[0])
  const history = page.locator('details.home-page__application-history')
  await history.locator('summary').press('Enter')
  await expect(history.getByRole('listitem').filter({ hasText: LONG_TITLE })).toContainText('· applied')
  await expect(history.getByRole('listitem').filter({ hasText: 'Job deleted' })).toContainText('· interviewing')
  expect(state.calls.filter(call => call.startsWith('GET /posting/card'))).toEqual([])
  expect(state.writes).toEqual([])
  expect(state.unexpected).toEqual([])
})

for (const viewport of VIEWPORTS) {
  test(`R004-03 older applications have distinct job names at ${viewport.width}×${viewport.height}`, async ({ page, context, baseURL }, testInfo) => {
    const oldAlias = 'Übersicht zur Werkstudentenstelle für datengestützte Fahrgastinformation und barrierefreie Verkehrsplanung (DEMO)'
    const oldTitle = 'Praktikum (m/w/d) für Planung kommunaler Energieversorgungsnetze und nachhaltige Infrastruktur in Berlin (DEMO)'
    const olderWithAlias = { ...cardOf(6, LONG_TITLE, LONG_COMPANY), posting_alias: oldAlias }
    const olderWithTitle = cardOf(7, oldTitle, LONG_COMPANY)
    const savedApplications = [
      { application_id: uuid(601), card_key: olderWithAlias.card_key, status: 'applied' },
      { application_id: uuid(602), card_key: olderWithTitle.card_key, status: 'interviewing' },
      { application_id: uuid(603), card_key: uuid(999), status: 'withdrawn' },
    ].map(record => ({ ...record, applied_on: dateOf(-1), created_at: iso(-1, 9), updated_at: iso(-1, 9) }))
    const recentCards = Array.from({ length: 5 }, (_, index) => cardOf(index + 1, `Neuere gespeicherte Stelle ${index + 1} (DEMO)`, LONG_COMPANY))
    const state = makeState({ cards: [...recentCards, olderWithAlias, olderWithTitle], applications: savedApplications })
    await installHome({ context, baseURL, state })
    await openHome(page, viewport)
    const history = page.locator('details.home-page__application-history')
    const recent = page.getByRole('list', { name: 'Recent saved jobs' })
    await expect(recent.getByRole('listitem')).toHaveCount(5)
    await expect(recent).not.toContainText(oldAlias)
    await expect(recent).not.toContainText(oldTitle)
    await history.locator('summary').press('Enter')
    await expect(history.getByRole('listitem')).toHaveCount(3)
    await expect(history.getByRole('listitem').filter({ hasText: 'Job deleted · withdrawn' })).toHaveCount(1)

    for (const [title, status] of [[oldAlias, 'applied'], [oldTitle, 'interviewing']]) {
      const row = history.getByRole('listitem').filter({ hasText: title })
      const change = row.getByRole('button', { name: 'Change status', exact: true })
      const form = row.getByRole('form', { name: 'Change application status', exact: true })
      await expect(row).toContainText(`${title} · ${status}`)
      await expect(change).toHaveAccessibleDescription(title)
      await change.press('Enter')
      await expect(form.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(status)
      await form.getByRole('button', { name: 'Cancel', exact: true }).press('Enter')
      await expect(change).toBeFocused()
    }

    expect(state.calls.filter(call => call.startsWith('GET /posting/card'))).toEqual([])
    expect(state.writes).toEqual([])
    expect(state.unexpected).toEqual([])
    expect(await horizontalProblems(page)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('older-applications.png') })
  })

  test(`NS-05 application status saves explicitly and reconciles a lost response at ${viewport.width}×${viewport.height}`, async ({ page, context, baseURL }, testInfo) => {
    const state = makeState(seededRecords())
    const applicationId = state.applications[0].application_id
    const key = 'PATCH /home/applications/:id'
    const path = `/home/applications/${applicationId}`
    const write = (status) => ({ key, path, body: { status } })
    const browserErrors = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const expectedFailure = message.location().url === `${API}${path}`
        && /status of 503|net::ERR_FAILED/.test(message.text())
      if (!expectedFailure) browserErrors.push(message.text())
    })
    let attempts = 0
    await installHome({ context, baseURL, state, routes: {
      [key]: (route, request, ok) => {
        attempts += 1
        if (attempts === 1) return route.fulfill({ status: 503, json: { detail: 'home.storage_unavailable' } })
        if (attempts === 2) {
          state.patchApplication(idOf(request), request.postDataJSON())
          return route.abort('failed')
        }
        return ok()
      },
    } })
    await openHome(page, viewport)
    const history = region(page, 'Your search').locator('details.home-page__application-history')
    const row = history.getByRole('listitem').filter({ hasText: LONG_TITLE })
    const change = row.getByRole('button', { name: 'Change status', exact: true })
    const form = row.getByRole('form', { name: 'Change application status', exact: true })
    const status = form.getByRole('combobox', { name: 'Status', exact: true })
    const save = form.getByRole('button', { name: 'Save status', exact: true })
    const alert = row.getByRole('alert')
    const recentJob = page.getByRole('list', { name: 'Recent saved jobs' }).getByRole('listitem').filter({ hasText: LONG_TITLE })
    const statusActivity = region(page, 'Recent activity').getByRole('listitem').filter({ hasText: 'Application status changed' })

    await history.locator('summary').press('Enter')
    await change.press('Enter')
    await expect(status).toBeFocused()
    await expect(status).toHaveValue('applied')
    await expect(save).toBeDisabled()
    await status.selectOption('rejected')
    await form.getByRole('button', { name: 'Cancel', exact: true }).press('Enter')
    await expect(form).toHaveCount(0)
    await expect(change).toBeFocused()
    expect(state.writes).toEqual([])

    await change.press('Enter')
    await status.selectOption('interviewing')
    await expect(save).toBeEnabled()
    await expect(recentJob).toContainText('Application: applied')
    await expect(metric(page, 'Active applications')).toHaveText('2')
    await expect(metric(page, 'Awaiting reply')).toHaveText('1')
    expect(state.writes).toEqual([])

    await save.press('Enter')
    await expect(alert).toContainText('draft is still here')
    await expect(status).toHaveValue('interviewing')
    await expect(status).toBeEnabled()
    await expect(recentJob).toContainText('Application: applied')
    expect(state.writes).toEqual([write('interviewing')])
    await frameTargets([['Status draft', status], ['Save rejection', alert]])
    expect(await horizontalProblems(page)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('application-status-rejected.png') })

    await save.press('Enter')
    await expect(alert).toContainText('Save outcome unknown')
    await expect(status).toHaveValue('interviewing')
    await expect(status).toBeDisabled()
    await expect(form.getByRole('button', { name: 'Retry same request', exact: true })).toBeDisabled()
    expect(state.writes).toEqual([write('interviewing'), write('interviewing')])
    await expect(recentJob).toContainText('Application: applied')
    const overviewReads = count(state, 'GET /home/overview')
    const activityReads = count(state, 'GET /home/activity')
    const check = row.getByRole('button', { name: 'Refresh to check', exact: true })
    await frameTargets([['Pending outcome', alert], ['Readback action', check]])
    await page.screenshot({ path: testInfo.outputPath('application-status-unknown.png') })
    await check.press('Enter')

    await expect(form).toHaveCount(0)
    await expect(change).toBeFocused()
    await expect(recentJob).toContainText('Application: interviewing')
    await expect(metric(page, 'Active applications')).toHaveText('2')
    await expect(metric(page, 'Awaiting reply')).toHaveText('0')
    await expect(metric(page, 'Interviews in next 7 days')).toHaveText('1')
    await expect(statusActivity).toHaveCount(1)
    expect(count(state, 'GET /home/overview')).toBe(overviewReads + 1)
    expect(count(state, 'GET /home/activity')).toBe(activityReads + 1)
    expect(state.writes).toEqual([write('interviewing'), write('interviewing')])

    await change.press('Enter')
    await expect(status).toHaveValue('interviewing')
    await status.selectOption('offer')
    await save.press('Enter')
    await expect(form).toHaveCount(0)
    await expect(change).toBeFocused()
    await expect(recentJob).toContainText('Application: offer')
    await expect(metric(page, 'Active applications')).toHaveText('1')
    await expect(metric(page, 'Awaiting reply')).toHaveText('0')
    await expect(metric(page, 'Interviews in next 7 days')).toHaveText('1')
    await expect(statusActivity).toHaveCount(2)
    expect(state.writes).toEqual([write('interviewing'), write('interviewing'), write('offer')])
    expect(state.unexpected).toEqual([])
    expect(browserErrors).toEqual([])
    await frameTargets([['Changed application', change], ['Recent job updated', recentJob]])
    expect(await horizontalProblems(page)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('application-status-saved.png') })
  })
}

// ---------------------------------------------------------------------- events

test('A delayed Home follow-up draft preserves workspace-search focus', async ({ page, context, baseURL }) => {
  const card = cardOf(1, LONG_TITLE, LONG_COMPANY)
  const state = makeState({ cards: [card] })
  const releaseOverview = deferred()
  const overviewStarted = deferred()
  await installHome({ context, baseURL, state, routes: {
    'GET /posting/watchlist': route => route.fulfill({ json: [{
      card_key: card.card_key, watch_id: uuid(700), watched_at: iso(-1),
      card_identity: { posting_alias: null, position_title: LONG_TITLE, company_name: LONG_COMPANY },
    }] }),
    [`GET /posting/card/${card.card_key}`]: route => route.fulfill({ json: card }),
    'GET /home/overview': async (route, request, ok) => {
      overviewStarted.resolve()
      await releaseOverview.promise
      return ok()
    },
  } })
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Market', exact: true }).press('Enter')
  await page.getByText('Watchlist', { exact: true }).press('Enter')
  const watched = page.getByRole('list', { name: 'Watched jobs', exact: true })
  await watched.getByRole('button', { name: `View saved job: ${LONG_TITLE} at ${LONG_COMPANY}`, exact: true }).press('Enter')
  const dialog = page.getByRole('dialog')
  const search = page.getByRole('combobox', { name: 'Search your workspace', exact: true })
  const draft = region(page, 'Upcoming').getByRole('form', { name: 'Add event', exact: true })
  try {
    await dialog.getByRole('button', { name: 'Plan follow-up', exact: true }).press('Enter')
    await expect(dialog).toHaveCount(0)
    await overviewStarted.promise
    await expect(draft).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await expect(search).toBeFocused()
  } finally {
    releaseOverview.resolve()
  }
  await expect(draft.getByLabel('Event title')).toHaveValue('Follow up')
  await expect(search).toBeFocused()
  expect(state.writes).toEqual([])
  expect(state.unexpected).toEqual([])
})

for (const viewport of VIEWPORTS) {
  test(`Market plans a follow-up in an unsaved linked Home event at ${viewport.width}×${viewport.height}`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize(viewport)
    if (viewport.width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const reference = cardOf(1, SMALL_TITLE, 'Synthetische Stadtwerke (DEMO)')
    const linked = cardOf(2, LONG_TITLE, LONG_COMPANY)
    for (const card of [reference, linked]) {
      card.posting.role_content = { ...card.posting.role_content, domains: [{ value: 'Datenanalyse', origin: 'source' }] }
    }
    const currentTitle = `${LONG_TITLE} – aktualisiert`
    const current = cardOf(2, currentTitle, LONG_COMPANY)
    current.posting.role_content = linked.posting.role_content
    const listRead = 'GET /posting/card'
    const detailRead = `${listRead}/${linked.card_key}`
    const overviewRead = 'GET /home/overview'
    const state = makeState({ cards: [reference, linked] })
    const postingReads = () => state.calls.filter(call => call === listRead || call.startsWith(`${listRead}/`))
    const diagnostics = []
    page.on('pageerror', error => diagnostics.push({ type: 'pageerror', text: error.message }))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) {
        diagnostics.push({ type: message.type(), url: message.location().url, text: message.text() })
      }
    })
    let failOverview = viewport.width === 900
    let failedOverviewReads = 0
    await installHome({ context, baseURL, state, routes: {
      [detailRead]: route => route.fulfill({ json: current }),
      [overviewRead]: (route, request, ok) => {
        if (!failOverview) return ok()
        failedOverviewReads += 1
        return route.fulfill({ status: 503, json: { detail: 'Synthetic Home overview failure' } })
      },
    } })
    await page.goto('/')

    const navigation = mainNavigation(page)
    const upcoming = region(page, 'Upcoming')
    const form = upcoming.getByRole('form', { name: 'Add event', exact: true })
    const title = form.getByLabel('Event title')
    async function planFollowUp({ retryOverview = false } = {}) {
      const previousReads = postingReads()
      await navigation.getByRole('button', { name: 'Market', exact: true }).press('Enter')
      await page.getByRole('combobox', { name: 'Reference saved job', exact: true }).selectOption(reference.card_key)
      const related = page.getByRole('list', { name: 'Related saved jobs', exact: true })
      await related.getByRole('button', { name: `View saved job: ${LONG_TITLE}`, exact: true }).press('Enter')
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: currentTitle, exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: 'Plan follow-up', exact: true }).press('Enter')
      await expect(dialog).toHaveCount(0)
      if (retryOverview) {
        const retry = page.getByRole('button', { name: 'Retry Home', exact: true })
        await expect(retry).toBeVisible()
        await expect(form).toHaveCount(0)
        expect(state.writes).toEqual([])
        const readsBeforeRetry = count(state, overviewRead)
        expect(readsBeforeRetry).toBeGreaterThan(0)
        expect(readsBeforeRetry).toBe(failedOverviewReads)
        failOverview = false
        await retry.press('Enter')
        await expect.poll(() => count(state, overviewRead)).toBe(readsBeforeRetry + 1)
      }
      await expect(title).toBeFocused()
      await expect(title).toHaveValue('Follow up')
      await expect(form.getByLabel('Event type')).toHaveValue('other')
      await expect(form.getByLabel('Starts (local time)')).toHaveValue('')
      await expect(form.getByLabel('Ends (optional)')).toHaveValue('')
      await expect(form.getByRole('button', { name: 'Change linked job', exact: true })).toBeVisible()
      await expect(form.getByText(`${currentTitle} · ${LONG_COMPANY}`, { exact: true })).toBeVisible()
      expect(postingReads()).toEqual([...previousReads, listRead, detailRead])
      expect(state.writes).toEqual([])
    }

    await planFollowUp({ retryOverview: viewport.width === 900 })
    if (viewport.width === 900) {
      await form.getByRole('button', { name: 'Cancel editing', exact: true }).press('Enter')
      await expect(form).toHaveCount(0)
      await expect(heading(page, 'Upcoming')).toBeFocused()
      expect(state.writes).toEqual([])
      await planFollowUp()
      const readsBeforeLeaving = postingReads()
      await navigation.getByRole('button', { name: 'Import posting', exact: true }).press('Enter')
      await navigation.getByRole('button', { name: 'Home', exact: true }).press('Enter')
      await expect(upcoming.getByRole('button', { name: 'Add event', exact: true })).toBeVisible()
      await expect(form).toHaveCount(0)
      expect(postingReads()).toEqual(readsBeforeLeaving)
      expect(state.writes).toEqual([])
      await planFollowUp()
    }
    await form.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('follow-up-event-draft.png'), animations: 'disabled' })

    const readsBeforeSave = postingReads()
    await form.getByLabel('Starts (local time)').fill(localInput(2, 11, 30))
    await form.getByRole('button', { name: 'Add event', exact: true }).press('Enter')
    await expect(form).toHaveCount(0)
    await expect(upcoming.getByRole('button', { name: 'View linked job: Follow up', exact: true })).toBeVisible()
    expect(state.writes).toEqual([{ key: 'POST /home/events', path: '/home/events', body: {
      event_id: expect.stringMatching(UUID_PATTERN), title: 'Follow up', kind: 'other',
      starts_at: iso(2, 11, 30), ends_at: null, cancelled: false, card_key: linked.card_key,
    } }])
    expect(postingReads()).toEqual(readsBeforeSave)
    expect(state.calls.filter(call => call.includes('/home/applications'))).toEqual([])
    expect(state.unexpected).toEqual([])
    if (viewport.width === 900) {
      expect(diagnostics.length).toBeLessThanOrEqual(failedOverviewReads)
      for (const diagnostic of diagnostics) {
        expect(diagnostic).toEqual({ type: 'error', url: expect.stringContaining(`${API}/home/overview?`), text: expect.stringContaining('503') })
      }
    } else expect(diagnostics).toEqual([])
  })
}

for (const viewport of VIEWPORTS) {
  test(`Home explicitly links a saved job to an event and opens its current Card at ${viewport.width}×${viewport.height}`, async ({ page, context, baseURL }, testInfo) => {
    if (viewport.width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const unrelated = cardOf(1, SMALL_TITLE, 'Synthetische Stadtwerke (DEMO)')
    const linked = cardOf(2, LONG_TITLE, LONG_COMPANY)
    const freshTitle = `${LONG_TITLE} – aktualisiert`
    const current = cardOf(2, freshTitle, LONG_COMPANY)
    const listRead = 'GET /posting/card'
    const detailRead = `${listRead}/${linked.card_key}`
    const unlinkedTitle = 'Bewerbungsfrist für ein anderes Praktikum (DEMO)'
    const state = makeState({ cards: [unrelated, linked], events: [event(1, unlinkedTitle, 'deadline', iso(3, 10))] })
    const postingReads = () => state.calls.filter(call => call === listRead || call.startsWith(`${listRead}/`))
    const browserErrors = []
    page.on('pageerror', error => browserErrors.push(error.message))
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) browserErrors.push(message.text()) })
    await installHome({ context, baseURL, state, routes: { [detailRead]: route => route.fulfill({ json: current }) } })
    await openHome(page, viewport)

    const upcoming = region(page, 'Upcoming')
    await upcoming.getByRole('button', { name: 'Add event', exact: true }).press('Enter')
    const form = page.getByRole('form', { name: 'Add event', exact: true })
    await form.getByLabel('Event title').fill(LONG_EVENT)
    await form.getByLabel('Starts (local time)').fill(localInput(2, 11, 30))
    expect(postingReads()).toEqual([])
    expect(state.writes).toEqual([])

    await form.getByRole('button', { name: 'Link saved job', exact: true }).press('Enter')
    const picker = form.getByRole('combobox', { name: 'Saved job', exact: true })
    await expect(picker).toBeFocused()
    await expect(picker).toHaveValue('')
    await expect(picker.locator(`option[value="${linked.card_key}"]`)).toContainText(LONG_TITLE)
    await expect(picker.locator(`option[value="${linked.card_key}"]`)).toContainText(LONG_COMPANY)
    await picker.selectOption(linked.card_key)
    await expect(picker).toHaveValue(linked.card_key)
    await expect(picker).toHaveAccessibleDescription(`Selected job: ${LONG_TITLE} · ${LONG_COMPANY}`)
    expect(postingReads()).toEqual([listRead])
    expect(state.writes).toEqual([])
    await picker.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('choose-linked-job.png'), animations: 'disabled' })
    await form.getByRole('button', { name: 'Add event', exact: true }).press('Enter')
    await expect(form).toHaveCount(0)
    const savedEvent = {
      event_id: expect.stringMatching(UUID_PATTERN), title: LONG_EVENT, kind: 'interview',
      starts_at: iso(2, 11, 30), ends_at: null, cancelled: false, card_key: linked.card_key,
    }
    expect(state.writes).toEqual([{ key: 'POST /home/events', path: '/home/events', body: savedEvent }])

    const upcomingRows = upcoming.getByRole('list', { name: 'Upcoming records', exact: true }).getByRole('listitem')
    const opener = upcomingRows.filter({ hasText: LONG_EVENT }).getByRole('button', { name: `View linked job: ${LONG_EVENT}`, exact: true })
    await expect(opener).toBeVisible()
    const reads = count(state, 'GET /home/overview')
    await openHome(page)
    await expect(opener).toBeVisible()
    expect(count(state, 'GET /home/overview')).toBeGreaterThan(reads)
    await expect(upcomingRows.filter({ hasText: unlinkedTitle }).getByRole('button', { name: /View linked job/ })).toHaveCount(0)
    expect(postingReads()).toEqual([listRead])

    await opener.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: freshTitle, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toHaveCount(0)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('current-event-job.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(postingReads()).toEqual([listRead, detailRead])
    expect(state.writes).toEqual([{ key: 'POST /home/events', path: '/home/events', body: savedEvent }])
    if (viewport.width === 900) {
      const eventPath = `/home/events/${state.writes[0].body.event_id}`
      await upcomingRows.filter({ hasText: LONG_EVENT }).getByRole('button', { name: 'Adjust', exact: true }).press('Enter')
      const adjust = page.getByRole('form', { name: 'Adjust event', exact: true })
      await adjust.getByRole('button', { name: 'Change linked job', exact: true }).press('Enter')
      const linkedPicker = adjust.getByRole('combobox', { name: 'Saved job', exact: true })
      await expect(linkedPicker).toHaveValue(linked.card_key)
      await linkedPicker.selectOption('')
      await adjust.getByRole('button', { name: 'Save event', exact: true }).press('Enter')
      await expect(adjust).toHaveCount(0)
      await expect(opener).toHaveCount(0)
      await expect(upcomingRows.filter({ hasText: LONG_EVENT })).toBeVisible()
      expect(state.writes).toHaveLength(2)
      expect(state.writes[1]).toEqual({ key: 'PATCH /home/events/:id', path: eventPath, body: {
        title: LONG_EVENT, kind: 'interview', starts_at: iso(2, 11, 30), ends_at: null, cancelled: false, card_key: null,
      } })
      expect(postingReads()).toEqual([listRead, detailRead, listRead])
    }
    expect(state.calls.filter(call => call.includes('/home/applications'))).toEqual([])
    expect(state.unexpected).toEqual([])
    expect(browserErrors).toEqual([])
  })
}

test('Home retries unreadable saved jobs while keeping the event draft', async ({ page, context, baseURL }) => {
  const card = cardOf(1, LONG_TITLE, LONG_COMPANY)
  const state = makeState({ cards: [card] })
  let reads = 0
  await installHome({ context, baseURL, state, routes: {
    'GET /posting/card': route => route.fulfill({ json: ++reads === 1 ? { cards: [card] } : [card] }),
  } })
  await openHome(page)
  await region(page, 'Upcoming').getByRole('button', { name: 'Add event', exact: true }).press('Enter')
  const form = page.getByRole('form', { name: 'Add event', exact: true })
  await form.getByLabel('Event title').fill(LONG_EVENT)
  await form.getByLabel('Starts (local time)').fill(localInput(2, 11, 30))
  await form.getByRole('button', { name: 'Link saved job', exact: true }).press('Enter')
  await expect(form.getByRole('alert')).toHaveText('Saved jobs could not be loaded.')
  const retry = form.getByRole('button', { name: 'Retry loading saved jobs', exact: true })
  await expect(retry).toBeFocused()
  await retry.press('Enter')
  await expect(form.getByRole('combobox', { name: 'Saved job', exact: true })).toBeFocused()
  await expect(form.getByLabel('Event title')).toHaveValue(LONG_EVENT)
  await expect(form.getByLabel('Starts (local time)')).toHaveValue(localInput(2, 11, 30))
  expect(reads).toBe(2)
  expect(state.writes).toEqual([])
  expect(state.unexpected).toEqual([])
})

test('Home confirms an event title save when another client changed its untouched link', async ({ page, context, baseURL }) => {
  const original = cardOf(1, SMALL_TITLE, LONG_COMPANY)
  const replacement = cardOf(2, LONG_TITLE, LONG_COMPANY)
  const saved = event(1, LONG_EVENT, 'interview', iso(2, 11), { card_key: original.card_key })
  const title = 'Aktualisierter Termin zur Vorbereitung (DEMO)'
  const state = makeState({ cards: [original, replacement], events: [saved] })
  await installHome({ context, baseURL, state, routes: {
    'PATCH /home/events/:id': async (route, request) => {
      state.events[0].card_key = replacement.card_key
      state.patchEvent(saved.event_id, request.postDataJSON())
      await route.abort('failed')
    },
  } })
  await openHome(page)
  const upcoming = region(page, 'Upcoming')
  await upcoming.getByRole('button', { name: 'Adjust', exact: true }).press('Enter')
  const form = page.getByRole('form', { name: 'Adjust event', exact: true })
  await form.getByLabel('Event title').fill(title)
  await form.getByRole('button', { name: 'Save event', exact: true }).press('Enter')
  await form.getByRole('button', { name: 'Refresh to check', exact: true }).press('Enter')
  await expect(form).toHaveCount(0)
  await expect(upcoming.getByRole('button', { name: `View linked job: ${title}`, exact: true })).toHaveAttribute('value', replacement.card_key)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).not.toHaveProperty('card_key')
  expect(state.unexpected).toEqual([])
})

test('HF-EVENT-ADJ adjusting an event validates first, then moves Today, Upcoming, the interview count and activity together', async ({ page, context, baseURL }) => {
  const FAR = 'Spätere Frist (DEMO)'
  // The adjusted event is NOT seeded: it is first created through Upcoming > Add event, so the
  // creation entry point and its POST /home/events branch are exercised, not only the PATCH.
  const state = makeState({
    events: [event(2, FAR, 'deadline', iso(2, 10)), event(3, 'Zweites Gespräch (DEMO)', 'interview', iso(3, 14))],
    activities: [activity(1, 'card_saved', iso(-1, 9), 'card:1')],
  })
  await installHome({ context, baseURL, state })
  await openHome(page, VIEWPORTS[0])
  const posts = () => bodiesOf(state, 'POST /home/events')
  const patches = () => bodiesOf(state, 'PATCH /home/events/:id')
  const upcoming = page.getByRole('list', { name: 'Upcoming records' }).getByRole('listitem')

  // Before creating: one interview inside 7 days (+3), no event today, no recorded operation today.
  await expect(metric(page, 'Interviews in next 7 days')).toHaveText('1')
  await expect(page.locator('.home-page__featured-event')).toHaveCount(0)
  await expect(upcoming).toContainText([FAR, 'Zweites Gespräch (DEMO)'])
  await expect(heatCell(page, dateOf(0), '0 recorded workspace operations')).toHaveCount(1)

  // Add event: nothing is sent until the explicit submit, then exactly one POST with a new UUID
  // and the typed local time converted to UTC; no end time stays null.
  await region(page, 'Upcoming').getByRole('button', { name: 'Add event' }).click()
  const addForm = page.getByRole('form', { name: 'Add event' })
  await expect(addForm).toBeVisible()
  await settle(page)
  expect(posts()).toHaveLength(0)
  await addForm.getByLabel('Event title').fill(LONG_EVENT)
  await addForm.getByLabel('Event type').selectOption('interview')
  await addForm.getByLabel('Starts (local time)').fill(localInput(0, 23, 55))
  await addForm.getByRole('button', { name: 'Add event', exact: true }).click()
  await expect(addForm).toHaveCount(0)
  expect(posts()).toEqual([{ event_id: expect.stringMatching(UUID_PATTERN), title: LONG_EVENT, kind: 'interview', starts_at: iso(0, 23, 55), ends_at: null, cancelled: false }])
  expect(patches(), 'creating must not use the adjust endpoint').toHaveLength(0)

  // Every consumer of the new fact follows: Today, Upcoming, the interview count, activity and heatmap.
  await expect(heading(page, 'Upcoming')).toBeFocused()
  await expect(metric(page, 'Interviews in next 7 days')).toHaveText('2')
  await expect(page.locator('.home-page__featured-event')).toContainText(LONG_EVENT)
  await expect(upcoming).toContainText([LONG_EVENT, FAR, 'Zweites Gespräch (DEMO)'])
  await expect(region(page, 'Recent activity').getByRole('listitem').first()).toContainText('Event recorded')
  await expect(heatCell(page, dateOf(0), '1 recorded workspace operations')).toHaveCount(1)

  await page.locator('.home-page__featured-event').getByRole('button', { name: 'Adjust event' }).click()
  const form = page.getByRole('form', { name: 'Adjust event' })
  await expect(form.getByLabel('Event title')).toHaveValue(LONG_EVENT)

  // An end before the start is rejected locally with an alert and no request.
  await form.getByLabel('Starts (local time)').fill(localInput(9, 10))
  await form.getByLabel('Ends (optional)').fill(localInput(9, 9))
  await form.getByRole('button', { name: 'Save event', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('End time must not precede start time')
  await settle(page)
  expect(patches()).toHaveLength(0)

  // A valid move to +9 days sends the exact ISO fields and nothing else.
  await form.getByLabel('Ends (optional)').fill('')
  await form.getByRole('button', { name: 'Save event', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(patches()).toEqual([{ title: LONG_EVENT, kind: 'interview', starts_at: iso(9, 10), ends_at: null, cancelled: false }])

  // Interview count drops (outside 7 days), nothing is left to show as "Next up", Upcoming re-orders.
  await expect(metric(page, 'Interviews in next 7 days')).toHaveText('1')
  await expect(page.locator('.home-page__featured-event')).toHaveCount(0)
  await expect(page.getByText(/No more events scheduled today/)).toBeVisible()
  await expect(upcoming).toContainText([FAR, 'Zweites Gespräch (DEMO)', LONG_EVENT])
  await expect(region(page, 'Recent activity').getByRole('listitem').first()).toContainText('Event adjusted')
  await expect(heatCell(page, dateOf(0), '2 recorded workspace operations')).toHaveCount(1)
  expect(posts(), 'adjusting must not create a second event').toHaveLength(1)
  await expect(heading(page, 'Upcoming')).toBeFocused()
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// -------------------------------------------------------------------- in flight

test('HF-INFLIGHT leaving Home while a task save is in flight neither updates the dead view nor revokes the request', async ({ page, context, baseURL }) => {
  const state = makeState()
  const release = deferred()
  const LEAVING = 'Aufgabe beim Seitenwechsel (DEMO)'
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await installHome({ context, baseURL, state, routes: {
    'POST /home/tasks': async (route, request, ok) => { await release.promise; return ok() },
  } })
  await openHome(page, VIEWPORTS[0])

  await taskForm(page).getByLabel('Task title').fill(LEAVING)
  await taskForm(page).getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(taskForm(page).getByRole('button', { name: 'Saving…' })).toBeVisible()
  expect(bodiesOf(state, 'POST /home/tasks')).toHaveLength(1)

  await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  // Settings has its own h1; Home is gone when its greeting and task form are unmounted.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: /Demo Student/ })).toHaveCount(0)
  await expect(taskForm(page)).toHaveCount(0)
  const overviewReads = count(state, 'GET /home/overview')
  const activityReads = count(state, 'GET /home/activity')
  release.resolve()
  await expect.poll(() => state.tasks.map((t) => t.title)).toEqual([LEAVING])
  await settle(page)

  // The late response must not trigger a refresh for the unmounted page, and must not throw.
  expect(count(state, 'GET /home/overview'), 'no overview read after leaving Home').toBe(overviewReads)
  expect(count(state, 'GET /home/activity'), 'no activity read after leaving Home').toBe(activityReads)
  expect(bodiesOf(state, 'POST /home/tasks'), 'navigating away neither resends nor cancels the write').toHaveLength(1)
  expect(pageErrors).toEqual([])

  // Coming back reads the server fact; the old draft is gone with the unmounted form.
  await mainNavigation(page).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(taskList(page).getByRole('listitem')).toHaveCount(1)
  await expect(taskList(page)).toContainText(LEAVING)
  await expect(taskForm(page).getByLabel('Task title')).toHaveValue('')
  expect(bodiesOf(state, 'POST /home/tasks')).toHaveLength(1)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ---------------------------------------------------------------------- AI usage

test('HF-USAGE budget preferences distinguish not set, zero and a value while usage and cost stay not obtained', async ({ page, context, baseURL }) => {
  const providers = [
    { provider_key: uuid(701), display_name: 'Anbieter ohne Budget (DEMO)', provider: 'openai', monthly_budget_usd: null, budget_status: 'not_set' },
    { provider_key: uuid(702), display_name: 'Anbieter Null (DEMO)', provider: 'openai', monthly_budget_usd: 0, budget_status: 'zero' },
    { provider_key: uuid(703), display_name: 'Anbieter Zwölf (DEMO)', provider: 'openai', monthly_budget_usd: 12.5, budget_status: 'set' },
  ]
  const state = makeState({ providers })
  await installHome({ context, baseURL, state })
  await openHome(page, VIEWPORTS[0])
  const usage = page.locator('section.home-page__usage')
  await expect(usage).toBeVisible()

  const budget = (name) => usage.locator('.home-page__provider-budgets > div').filter({ hasText: name }).locator('dd')
  await expect(budget('Anbieter ohne Budget')).toHaveText('Not set')
  await expect(budget('Anbieter Null')).toHaveText('$0.00')
  await expect(budget('Anbieter Zwölf')).toHaveText('$12.50')

  // No usage record exists: cost and tokens are unknown, never rendered as zero.
  await expect(usage.locator('.home-page__usage-metrics > div').filter({ hasText: 'Estimated cost this month' }).locator('dd')).toHaveText('Not obtained')
  await expect(usage.locator('.home-page__usage-metrics > div').filter({ hasText: 'Tokens this month' }).locator('dd')).toHaveText('Not obtained')
  await expect(usage.locator('.home-page__usage-metrics')).not.toContainText('$0')
  await expect(usage.getByText('No provider budget configured.')).toHaveCount(0)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ---------------------------------------------------------------------- keyboard

test('HF-KEYBOARD a task can be added and completed and an application recorded from the keyboard alone', async ({ page, context, baseURL }) => {
  const card = cardOf(1, SMALL_TITLE, 'Kleine Firma GmbH (DEMO)')
  const state = makeState({ cards: [card] })
  await installHome({ context, baseURL, state })
  await openHome(page, VIEWPORTS[0])
  const KEY_TASK = 'Per Tastatur erledigen (DEMO)'

  // Add: type in the focused field and press Enter. Focus stays in the field for the next entry.
  await taskForm(page).getByLabel('Task title').focus()
  await page.keyboard.type(KEY_TASK)
  await page.keyboard.press('Enter')
  await expect(taskList(page)).toContainText(KEY_TASK)
  await expect(taskForm(page).getByLabel('Task title')).toBeFocused()
  expect(bodiesOf(state, 'POST /home/tasks')).toHaveLength(1)

  // Complete: the row action is reachable by focus and activated with Enter.
  const completeButton = taskList(page).getByRole('button', { name: `Complete ${KEY_TASK}`, exact: true })
  await completeButton.focus()
  await expect(completeButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(completedSummary(page)).toHaveText('1 completed today')
  await expect(taskList(page).getByRole('listitem')).toHaveCount(0)
  expect(count(state, 'POST /home/tasks/:id/complete')).toBe(1)

  // Record an application: open with Enter, focus lands on the Job select, choose with ArrowDown,
  // Tab to the date and the submit button, submit with Enter, and focus returns to the heading.
  const opener = region(page, 'Your search').getByRole('button', { name: 'Record application', exact: true })
  await opener.focus()
  await page.keyboard.press('Enter')
  const form = page.getByRole('form', { name: 'Record application' })
  await expect(form.getByLabel('Job')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(form.getByLabel('Job')).toHaveValue(card.card_key)
  await page.keyboard.press('Tab')
  await expect(form.getByLabel('Application date')).toBeFocused()
  // A native date input exposes several keyboard stops (day, month, year segments) before the next
  // control, so Tab until the submit button is reached; the bound keeps a lost focus path from looping.
  const submit = form.getByRole('button', { name: 'Record application', exact: true })
  for (let presses = 0; presses < 6; presses += 1) {
    await page.keyboard.press('Tab')
    if (await submit.evaluate((node) => node === document.activeElement)) break
  }
  await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(form).toHaveCount(0)
  await expect(heading(page, 'Your search')).toBeFocused()
  expect(bodiesOf(state, 'POST /home/applications')).toEqual([{ application_id: expect.stringMatching(UUID_PATTERN), card_key: card.card_key, applied_on: dateOf(0) }])
  await expect(metric(page, 'Active applications')).toHaveText('1')
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------ visual evidence

// Named states per viewport; the unchanged "before" Home pictures are archived from the earlier
// checkpoint and are not recaptured here. A passing geometry check is not visual approval: the
// host archives the images and a person judges them.
async function captureHomeEvidence({ page, context, baseURL }, testInfo, viewport) {
  testInfo.setTimeout(90_000)
  const label = `${viewport.width}x${viewport.height}`
  const geometry = {
    source: 'Synthetic public DEMO fixtures under closed mocks; no real backend, database, keyring or supplier',
    viewport, states: {},
  }
  const providers = [
    { provider_key: uuid(701), display_name: 'Anbieter ohne Budget (DEMO)', provider: 'openai', monthly_budget_usd: null, budget_status: 'not_set' },
    { provider_key: uuid(703), display_name: 'Anbieter Zwölf (DEMO)', provider: 'openai', monthly_budget_usd: 12.5, budget_status: 'set' },
  ]
  const state = makeState(seededRecords({ providers }))
  let outage = false
  let rejectTasks = false
  const fail = (route) => route.fulfill({ status: 500, json: { detail: 'DEMO outage' } })
  await installHome({ context, baseURL, state, routes: {
    'GET /home/overview': (route, request, ok) => (outage ? fail(route) : ok()),
    'GET /home/activity': (route, request, ok) => (outage ? fail(route) : ok()),
    'POST /home/tasks': (route, request, ok) => (rejectTasks ? route.fulfill({ status: 422, json: { detail: 'DEMO rejection' } }) : ok()),
  } })

  // `targets` are [name, locator] pairs naming what the picture must show. A first-screen frame is
  // the untouched arrival view: every scroll offset must be zero and every target already inside
  // the window. Other frames scroll the real content container to the first target.
  async function capture(stateName, targets, { firstScreen = false } = {}) {
    const problems = await horizontalProblems(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    geometry.states[stateName] = { documentOverflow: overflow, layoutProblems: problems, shown: targets.map(([name]) => name), firstScreen }
    expect(overflow, `${stateName}: the page must not scroll horizontally`).toBeLessThanOrEqual(1)
    expect(problems, `${stateName}: nothing may leave the overview column`).toEqual([])
    if (firstScreen) {
      const scrolled = await scrollOffsets(page)
      geometry.states[stateName].scrollOffsets = scrolled
      expect(scrolled, `${stateName}: the first screen must be captured unscrolled`).toEqual([])
      const hidden = []
      for (const [name, locator] of targets) {
        const problem = await visibilityProblem(locator)
        if (problem) hidden.push(`${name}: ${problem}`)
      }
      expect(hidden, `${stateName}: every named target must be visible without scrolling`).toEqual([])
    } else await frameTargets(targets)
    geometry.states[stateName].boxes = Object.fromEntries(await Promise.all(targets.map(async ([name, locator]) => [name, await locator.boundingBox()])))
    // Run artifacts on disk, not committed baselines, and never a visual approval.
    const file = testInfo.outputPath(`home-${label}-${stateName}.png`)
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' })
    await testInfo.attach(`home-${label}-${stateName}`, { path: file, contentType: 'image/png' })
  }

  // 1. Seeded first screen, straight from the real entry: greeting, summary, Today and its form.
  await openHome(page, viewport)
  await expect(region(page, 'Today')).toBeVisible()
  await capture('first-screen-seeded', [
    ['Greeting heading', page.getByRole('heading', { level: 1 })],
    ['Summary', page.locator('.home-page__summary')],
    ['Today heading', heading(page, 'Today')],
    ['Add task form', taskForm(page)],
  ], { firstScreen: true })

  // 2. Lower half: heatmap and recent activity, scrolled inside the real overview container.
  await capture('lower-activity', [
    ['Workspace activity heading', heading(page, 'Workspace activity')],
    ['Recent activity heading', heading(page, 'Recent activity')],
    ['First recent activity row', region(page, 'Recent activity').getByRole('listitem').first()],
  ])

  // 3. Lower half: AI usage with the budget preferences.
  await capture('lower-usage', [
    ['AI usage heading', page.getByRole('heading', { name: 'AI usage', level: 2, exact: true })],
    ['Estimated cost', page.locator('.home-page__usage-metrics > div').first()],
    ['Provider budgets', page.locator('.home-page__provider-budgets')],
  ])

  // 4. Record-application form opened from the section action.
  await overviewScroller(page).evaluate((el) => { el.scrollTop = 0 })
  await region(page, 'Your search').getByRole('button', { name: 'Record application', exact: true }).click()
  const form = page.getByRole('form', { name: 'Record application' })
  await expect(form.getByLabel('Job')).toBeVisible()
  await form.getByLabel('Job').selectOption({ index: 1 })
  await capture('application-form', [
    ['Your search heading', heading(page, 'Your search')],
    ['Job select', form.getByLabel('Job')],
    ['Application date', form.getByLabel('Application date')],
    ['Submit', form.getByRole('button', { name: 'Record application', exact: true })],
  ])
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(form).toHaveCount(0)

  // 5. A rejected task save keeps the long draft next to the form with a plain explanation.
  rejectTasks = true
  await overviewScroller(page).evaluate((el) => { el.scrollTop = 0 })
  await taskForm(page).getByLabel('Task title').fill(LONG_TASK)
  await taskForm(page).getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(taskForm(page).getByRole('alert')).toContainText('draft is still here')
  await capture('task-save-failure', [
    ['Today heading', heading(page, 'Today')],
    ['Task title draft', taskForm(page).getByLabel('Task title')],
    ['Save failure message', taskForm(page).getByRole('alert')],
  ])
  rejectTasks = false

  // 6. Load error: both reads fail, so errors and Retry replace the content (not an empty state).
  outage = true
  await page.getByRole('button', { name: 'Refresh Home', exact: true }).click()
  await expect(page.locator('.home-page__load-error').first()).toBeVisible()
  await overviewScroller(page).evaluate((el) => { el.scrollTop = 0 })
  await capture('load-error', [
    ['Home error message', page.locator('.home-page__load-error').first().getByRole('alert')],
    ['Retry Home', page.getByRole('button', { name: 'Retry Home', exact: true })],
  ])

  // 7. A new user's empty Home, entered from the real entry after the server has no records.
  outage = false
  state.load({})
  await page.reload()
  await mainNavigation(page).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo Student')
  await expect(page.getByText(/No pending tasks for today/)).toBeVisible()
  await capture('empty', [
    ['Summary', page.locator('.home-page__summary')],
    ['Today empty text', region(page, 'Today').getByText(/No pending tasks for today/)],
    ['Your search heading', heading(page, 'Your search')],
  ], { firstScreen: true })

  const geometryFile = testInfo.outputPath(`home-${label}-geometry.json`)
  await writeFile(geometryFile, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach(`home-${label}-geometry.json`, { path: geometryFile, contentType: 'application/json' })
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
}

test('HF-VISUAL home evidence at 1440x1000 captures seeded, lower, form, save-failure, load-error and empty states', async ({ page, context, baseURL }, testInfo) => {
  await captureHomeEvidence({ page, context, baseURL }, testInfo, VIEWPORTS[0])
})

test('HF-VISUAL home evidence at 900x1000 captures seeded, lower, form, save-failure, load-error and empty states', async ({ page, context, baseURL }, testInfo) => {
  await captureHomeEvidence({ page, context, baseURL }, testInfo, VIEWPORTS[1])
})
