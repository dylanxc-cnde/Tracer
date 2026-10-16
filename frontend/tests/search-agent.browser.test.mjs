import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CARD, frameTargets, scrollOffsets, visibilityProblem } from './profile-matching.browser.test.mjs'

// Global local search in the real App DOM, imported by settings-providers.browser.test.mjs (the
// only file Playwright discovers). Expected behavior comes from the S1 brief (cases SR-UI-OPEN,
// SR-UI-STATES, SR-UI-NOINIT-LAYOUT) and goal acceptance 5, not from the implementation. A small
// closed mock plays the SERVER for GET /search and GET /search/records/...; it holds fixed
// synthetic DEMO results written as literals. Every other request fails closed. A mocked browser
// proves no real search, persistence or backend, and a geometry check or screenshot is not
// visual approval.

const API = 'http://127.0.0.1:8000'
const SETTINGS = { user: { display_name: 'Demo Student' }, ai: { providers: [], tasks: [] } }
const VIEWPORTS = [{ width: 1440, height: 1000 }, { width: 900, height: 1000 }]

const LONG_TITLE = 'Werkstudent (m/w/d) Datenanalyse, Reporting und Marktkommunikation für Netzentgeltabrechnung und Energiewirtschaft (DEMO)'
const LONG_COMPANY = 'Süddeutsche Energieversorgungs- und Netzinfrastrukturgesellschaft mit beschränkter Haftung (DEMO)'
const LONG_SNIPPET = 'Gesprächsnotiz: Rückfragen zur Tarifbindung, zum Einarbeitungsplan und zur Abstimmung mit der Netzleitstelle vorbereiten (DEMO)'

const uuid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CARD_ID = uuid(1)
const TASK_ID = uuid(2)
const EVENT_ID = uuid(3)
const APPLICATION_ID = uuid(4)
const NOTE_CARD_ID = uuid(5)

const card = (id, title) => ({
  ...CARD, card_key: id, import_key: uuid(900 + Number(id.slice(-4))),
  posting: { ...CARD.posting, identity: { ...CARD.posting.identity, position_title: { value: title, origin: 'source' } } },
})
const CARDS = { [CARD_ID]: card(CARD_ID, LONG_TITLE), [NOTE_CARD_ID]: card(NOTE_CARD_ID, 'Praktikum Softwareentwicklung (DEMO)') }

// Fixed server answers keyed by the literal query text.
const R = {
  job: { type: 'job', source: 'Card library', title: LONG_TITLE, snippet: LONG_COMPANY, target: { kind: 'card', id: CARD_ID }, card_missing: false },
  task: { type: 'task', source: 'Home', title: 'Tarifbindung klären (DEMO)', snippet: '2030-06-10 · Pending', target: { kind: 'task', id: TASK_ID }, card_missing: false },
  event: { type: 'event', source: 'Home', title: 'Gespräch Netzleitstelle (DEMO)', snippet: 'interview · 2030-06-12T09:00:00Z', target: { kind: 'event', id: EVENT_ID }, card_missing: false },
  application: { type: 'application', source: 'Home', title: 'Deleted job', snippet: 'Applied 2030-06-09 · applied', target: { kind: 'application', id: APPLICATION_ID }, card_missing: true },
  note: { type: 'note', source: 'Card library', title: 'Praktikum Softwareentwicklung (DEMO)', snippet: LONG_SNIPPET, target: { kind: 'card', id: NOTE_CARD_ID }, card_missing: false },
}
const ANSWERS = {
  tarif: { results: [R.job, R.task, R.event, R.application, R.note], has_more: false },
  lang: { results: [{ ...R.job, snippet: LONG_COMPANY }], has_more: true },
  neu: { results: [R.task], has_more: false },
  alt: { results: [R.event], has_more: false },
  nichts: { results: [], has_more: false },
}
const HOME_RECORDS = {
  [`task/${TASK_ID}`]: { type: 'task', id: TASK_ID, title: R.task.title, source: 'Home', card_key: null, card_missing: false,
    fields: [{ label: 'Due date', value: '2030-06-10' }, { label: 'Status', value: 'Pending' }] },
  [`event/${EVENT_ID}`]: { type: 'event', id: EVENT_ID, title: R.event.title, source: 'Home', card_key: null, card_missing: false,
    fields: [{ label: 'Kind', value: 'interview' }, { label: 'Starts at', value: '2030-06-12T09:00:00+00:00' }] },
  // The application's job was deleted: the record is retained and says so (card_key kept, job gone).
  [`application/${APPLICATION_ID}`]: { type: 'application', id: APPLICATION_ID, title: 'Deleted job', source: 'Home', card_key: uuid(77), card_missing: true,
    fields: [{ label: 'Applied on', value: '2030-06-09' }, { label: 'Status', value: 'applied' }] },
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

// `routes` replaces the default handler for one "GET /path?q" key. It receives `ok`, the default
// answer, so a scenario can fail, delay or reorder a response around the real component.
async function installSearch({ context, baseURL, routes = {} }) {
  const state = { searches: [], reads: [], unexpected: [], other: [] }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET') {
      if (url.pathname === '/search') {
        const q = url.searchParams.get('q')
        state.searches.push(q)
        const ok = () => route.fulfill({ json: ANSWERS[q] ?? { results: [], has_more: false } })
        await (routes[`GET /search ${q}`] ?? ((r, req, done) => done()))(route, request, ok)
        return
      }
      const record = url.pathname.match(/^\/search\/records\/(task|event|application)\/(.+)$/)
      if (record) {
        state.reads.push(url.pathname)
        const found = HOME_RECORDS[`${record[1]}/${record[2]}`]
        await route.fulfill(found ? { json: found } : { status: 404, json: { detail: 'search.not_found' } })
        return
      }
      const cardRead = url.pathname.match(/^\/posting\/card\/(.+)$/)
      if (cardRead && CARDS[cardRead[1]]) {
        state.reads.push(url.pathname)
        await route.fulfill({ json: CARDS[cardRead[1]] })
        return
      }
      if (url.pathname === '/settings') { await route.fulfill({ json: SETTINGS }); return }
      if (url.pathname === '/profile' || url.pathname === '/goal') { await route.fulfill({ json: null }); return }
      if (url.pathname === '/posting/card') { await route.fulfill({ json: Object.values(CARDS) }); return }
      if (url.pathname === '/home/overview') {
        await route.fulfill({ json: {
          today: { tasks: [], completed_tasks: [], completed_count: 0, events: [] }, upcoming: { events: [], tasks: [] },
          your_search: { active: 0, awaiting_reply: 0, interviews: 0 }, applications: [], recent_jobs: [], recent_activity: [],
          ai_usage: { status: 'not_recorded', tokens: null, estimated_cost_usd: null, providers: [] },
        } })
        return
      }
      if (url.pathname === '/home/activity') { await route.fulfill({ json: { events: [], recording_started_at: null } }); return }
    }
    if (url.origin === baseURL && request.method() === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
      return
    }
    state.unexpected.push(`${request.method()} ${request.url()}`)
    await route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') socket.connectToServer()
    else { state.unexpected.push(`WebSocket ${socket.url()}`); socket.close() }
  })
  return state
}

const search = (page) => page.getByRole('combobox', { name: 'Search your workspace' })
const panel = (page) => page.getByRole('region', { name: 'Local workspace search' })
const options = (page) => page.getByRole('listbox', { name: 'Search results' }).getByRole('option')
const mainNavigation = (page) => page.getByRole('navigation', { name: 'Main navigation' })

async function openApp(page, viewport) {
  if (viewport) await page.setViewportSize(viewport)
  await page.goto('/')
  await expect(mainNavigation(page)).toBeVisible()
}

// Why one shared overflow probe: the panel is absolutely positioned over the page, so the only
// real failures are text leaving the window or being clipped, never the page behind it.
function panelProblems(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.global-search__panel')
    if (!root) return ['search panel is not rendered']
    const problems = []
    const box = root.getBoundingClientRect()
    if (box.left < -1 || box.right > window.innerWidth + 1) problems.push(`panel leaves the window ${Math.round(box.left)}..${Math.round(box.right)}`)
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`panel scrolls horizontally ${root.scrollWidth}>${root.clientWidth}`)
    for (const node of root.querySelectorAll('*')) {
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.right > box.right + 1 || rect.left < box.left - 1) problems.push(`outside panel: ${node.tagName.toLowerCase()} "${(node.textContent ?? '').trim().slice(0, 40)}"`)
    }
    return problems
  })
}

// ------------------------------------------------------------------- SR-UI-NOINIT-LAYOUT

test('SR-UI-NOINIT-LAYOUT the app and page switches send no search request and long German results wrap at both window sizes', async ({ page, context, baseURL }) => {
  const state = await installSearch({ context, baseURL })
  await openApp(page, VIEWPORTS[0])
  await expect(search(page)).toBeVisible()
  await expect(search(page)).toHaveValue('')

  // Entering every page, and focusing or clicking the empty box, is not a search.
  for (const name of ['Home', 'Card library', 'Activity', 'Import history', 'Settings', 'Import posting']) {
    await mainNavigation(page).getByRole('button', { name, exact: true }).click()
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
  }
  await search(page).focus()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByText(/Search saved jobs, companies, notes, tasks, events and applications/)).toBeVisible()
  await expect(options(page)).toHaveCount(0)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  expect(state.searches, 'no search request before the user types a query').toEqual([])

  // A blank query is still not a search.
  await search(page).fill('   ')
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  expect(state.searches).toEqual([])

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await search(page).fill('tarif')
    await expect(options(page)).toHaveCount(5)
    // Each result row shows its type and source, so mixed results are never anonymous.
    await expect(options(page).nth(0)).toContainText('job · Card library')
    await expect(options(page).nth(1)).toContainText('task · Home')
    await expect(options(page).nth(2)).toContainText('event · Home')
    await expect(options(page).nth(3)).toContainText('application · Home')
    await expect(options(page).nth(4)).toContainText('note · Card library')
    expect(await panelProblems(page), `${viewport.width}px: results stay inside the panel`).toEqual([])
    const horizontal = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(horizontal, `${viewport.width}px: the page must not scroll horizontally`).toBeLessThanOrEqual(1)
    for (const [name, locator] of [
      ['search box', search(page)],
      ['long job title', options(page).nth(0).locator('strong')],
      ['long note snippet', options(page).nth(4)],
    ]) {
      await locator.scrollIntoViewIfNeeded()
      expect(await visibilityProblem(locator), `${viewport.width}px ${name}`).toBeNull()
    }
    // The long title wraps over several lines instead of being truncated.
    const lineCount = await options(page).nth(0).locator('strong').evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
    expect(lineCount, `${viewport.width}px: the long German title wraps`).toBeGreaterThan(1)
  }
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------------- SR-UI-OPEN

test('SR-UI-OPEN typed results open by keyboard, a deleted-job application says so, Escape closes and focus returns', async ({ page, context, baseURL }) => {
  const state = await installSearch({ context, baseURL })
  await openApp(page, VIEWPORTS[0])

  await search(page).click()
  await search(page).fill('tarif')
  await expect(options(page)).toHaveCount(5)
  await expect(panel(page).getByRole('status').filter({ hasText: '5 results' })).toBeVisible()
  // The deleted-job application is labelled in the list, not hidden or silently dropped.
  await expect(options(page).nth(3)).toContainText('Linked job deleted · record retained')
  await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true')

  // Arrow keys move the selection (and wrap); Enter opens the highlighted record.
  await search(page).press('ArrowDown')
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await search(page).press('ArrowUp')
  await search(page).press('ArrowUp')
  await expect(options(page).nth(4)).toHaveAttribute('aria-selected', 'true')
  await search(page).press('ArrowDown')
  await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true')
  await search(page).press('ArrowDown')
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await search(page).press('Enter')

  const taskDialog = page.getByRole('dialog', { name: 'Search record' })
  await expect(taskDialog.getByRole('heading', { name: R.task.title })).toBeVisible()
  await expect(taskDialog).toContainText('Due date')
  await expect(taskDialog).toContainText('2030-06-10')
  await expect(taskDialog).toContainText('Pending')
  await expect(panel(page)).toHaveCount(0)
  // The dev server runs React StrictMode, which mounts effects twice; the same URL read once is enough.
  expect([...new Set(state.reads)]).toEqual([`/search/records/task/${TASK_ID}`])

  // Escape closes the record and returns focus to the search box without a new search.
  const searchesBefore = state.searches.length
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Search record' })).toHaveCount(0)
  await expect(search(page)).toBeFocused()
  await expect(panel(page)).toHaveCount(0)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)))
  expect(state.searches.length, 'closing a record does not start another search').toBe(searchesBefore)

  // A job result opens the existing read-only Card details: no edit control is offered.
  // The query is kept after closing a record while the panel stays closed; clicking reopens it.
  await search(page).click()
  await expect(options(page)).toHaveCount(5)
  await options(page).nth(0).click()
  const details = page.locator('dialog.posting-card-details')
  await expect(details).toBeVisible()
  await expect(details.getByRole('heading', { level: 2 }).first()).toContainText('Werkstudent')
  await expect(details.getByRole('button', { name: 'Edit card' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Review match' })).toHaveCount(0)
  expect(state.reads).toContain(`/posting/card/${CARD_ID}`)
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  await expect(search(page)).toBeFocused()
  // Focus is back in the box with the panel closed, so this click is a real reopen.

  // A retained application whose job was deleted opens without recreating the job.
  state.reads.length = 0
  await search(page).click()
  await expect(options(page)).toHaveCount(5)
  await options(page).nth(3).click()
  const gone = page.getByRole('dialog', { name: 'Search record' })
  await expect(gone.getByRole('heading', { name: 'Deleted job' })).toBeVisible()
  await expect(gone).toContainText('Linked job deleted. This saved record is retained; it does not recreate the job.')
  await expect(gone.getByRole('alert')).toHaveCount(0)
  // The deleted job cannot be opened: there is no linked-job action, only the way back to Home.
  await expect(gone.getByRole('button', { name: 'Open linked job' })).toHaveCount(0)
  await expect(gone.getByRole('button', { name: 'Go to Home' })).toBeVisible()
  // The dev server runs React StrictMode, which mounts effects twice; the same URL read once is enough.
  expect([...new Set(state.reads)]).toEqual([`/search/records/application/${APPLICATION_ID}`])
  await gone.getByRole('button', { name: 'Close record', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Search record' })).toHaveCount(0)
  await expect(search(page)).toBeFocused()

  // Escape in the empty box closes the panel; a click outside also dismisses it.
  await search(page).fill('')
  await search(page).press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await search(page).click()
  await expect(panel(page)).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' }).click({ position: { x: 5, y: 5 } })
  await expect(panel(page)).toHaveCount(0)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------------ SR-UI-STATES

test('SR-UI-STATES loading, no results, failure with Retry and a stale slow response each appear on their own', async ({ page, context, baseURL }) => {
  const slow = deferred()
  const failures = { remaining: 1 }
  const state = await installSearch({ context, baseURL, routes: {
    // The first "alt" answer is held until the newer "neu" result is already on screen.
    'GET /search alt': async (route, request, ok) => { await slow.promise; await ok() },
    'GET /search tarif': async (route, request, ok) => {
      if (failures.remaining-- > 0) await route.fulfill({ status: 503, json: { detail: 'search.storage_unavailable' } })
      else await ok()
    },
    'GET /search lang': async (route, request, ok) => { await new Promise((resolve) => setTimeout(resolve, 1200)); await ok() },
  } })
  await openApp(page, VIEWPORTS[0])

  // Loading is its own state, then the results replace it; has_more asks for a narrower query.
  await search(page).click()
  await search(page).fill('lang')
  await expect(panel(page).getByText('Searching local records…')).toBeVisible()
  await expect(options(page)).toHaveCount(0)
  await expect(panel(page).getByText(/No local records match/)).toHaveCount(0)
  await expect(options(page)).toHaveCount(1)
  await expect(panel(page).getByText('Searching local records…')).toHaveCount(0)
  await expect(panel(page).getByText(/More matches available; narrow your search/)).toBeVisible()

  // No results is a calm statement of the query, never an error.
  await search(page).fill('nichts')
  await expect(panel(page).getByText('No local records match “nichts”.')).toBeVisible()
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
  await expect(options(page)).toHaveCount(0)

  // A failed read is an error with a Retry, not "no results"; Retry re-asks and recovers.
  await search(page).fill('tarif')
  await expect(panel(page).getByRole('alert')).toContainText('Local search could not be loaded. Please try again.')
  await expect(panel(page).getByText(/No local records match/)).toHaveCount(0)
  await expect(options(page)).toHaveCount(0)
  const asked = state.searches.filter((q) => q === 'tarif').length
  await panel(page).getByRole('button', { name: 'Retry search', exact: true }).click()
  await expect(options(page)).toHaveCount(5)
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
  expect(state.searches.filter((q) => q === 'tarif').length, 'Retry is one explicit new read').toBe(asked + 1)

  // A slow response to an OLDER query must not overwrite the newer query's results.
  await search(page).fill('alt')
  await expect(panel(page).getByText('Searching local records…')).toBeVisible()
  await expect.poll(() => state.searches.includes('alt')).toBe(true)
  await search(page).fill('neu')
  await expect(options(page)).toHaveCount(1)
  await expect(options(page).first()).toContainText(R.task.title)
  slow.resolve()
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
  await expect(options(page)).toHaveCount(1)
  await expect(options(page).first()).toContainText(R.task.title)
  await expect(panel(page).getByText(R.event.title)).toHaveCount(0)
  await expect(search(page)).toHaveValue('neu')
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('SR-UI-STATES a record that cannot be read shows an error with Retry and never an empty record', async ({ page, context, baseURL }) => {
  // The dev server runs React StrictMode, which mounts the viewer effect twice and sends the first
  // read twice, so the failure is switched by state rather than by "the first request".
  let failing = true
  let record = 0
  const state = await installSearch({ context, baseURL })
  await context.route(`${API}/search/records/task/${TASK_ID}`, async (route) => {
    record += 1
    if (failing) await route.fulfill({ status: 503, json: { detail: 'search.storage_unavailable' } })
    else await route.fallback()
  })
  await openApp(page, VIEWPORTS[0])
  await search(page).click()
  await search(page).fill('tarif')
  await expect(options(page)).toHaveCount(5)
  await options(page).nth(1).click()

  const dialog = page.getByRole('dialog', { name: 'Search record' })
  await expect(dialog.getByRole('alert')).toContainText('This local record could not be opened. Please try again.')
  await expect(dialog.getByRole('heading')).toHaveCount(0)
  const readsBeforeRetry = record
  failing = false
  await dialog.getByRole('button', { name: 'Retry opening record', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: R.task.title })).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  expect(record, 'Retry is one explicit new read').toBe(readsBeforeRetry + 1)
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------- visual evidence

// Named states per viewport. First-screen frames are the untouched arrival view; the others open
// the real panel/dialog. A passing geometry check is not visual approval: the host archives the
// images and a person judges them.
async function captureSearchEvidence({ page, context, baseURL }, testInfo, viewport) {
  testInfo.setTimeout(90_000)
  const label = `${viewport.width}x${viewport.height}`
  const geometry = {
    source: 'Synthetic public DEMO fixtures under closed mocks; no real backend, database, keyring or supplier',
    viewport, states: {},
  }
  const state = await installSearch({ context, baseURL, routes: {
    'GET /search alt': (route) => route.fulfill({ status: 503, json: { detail: 'search.storage_unavailable' } }),
  } })

  async function capture(stateName, targets, { firstScreen = false } = {}) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    geometry.states[stateName] = { documentOverflow: overflow, shown: targets.map(([name]) => name), firstScreen }
    expect(overflow, `${stateName}: the page must not scroll horizontally`).toBeLessThanOrEqual(1)
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
    const file = testInfo.outputPath(`search-${label}-${stateName}.png`)
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' })
    await testInfo.attach(`search-${label}-${stateName}`, { path: file, contentType: 'image/png' })
  }

  // 1. Arrival: the persistent search box in the top bar, before any interaction.
  await openApp(page, viewport)
  await capture('first-screen-idle', [['Search box', search(page)]], { firstScreen: true })

  // 2. Long German results with all five record types, inside the panel.
  await search(page).click()
  await search(page).fill('tarif')
  await expect(options(page)).toHaveCount(5)
  expect(await panelProblems(page), 'results state: nothing leaves the panel').toEqual([])
  // Five wrapped long-German rows can exceed the panel's own bounded scroll area, so this frame
  // scrolls the real panel to the first long row and requires the named rows visible together
  // there; the untouched arrival frame above stays strictly unscrolled.
  await capture('results-long-german', [['Long job title', options(page).nth(0)], ['Task', options(page).nth(1)], ['Event', options(page).nth(2)]])
  await capture('results-deleted-job-and-note', [['Deleted-job application', options(page).nth(3)], ['Long note', options(page).nth(4)]])

  // 3. No results and 4. a failed read, each in the same panel.
  await search(page).fill('nichts')
  await expect(panel(page).getByText('No local records match “nichts”.')).toBeVisible()
  await capture('no-results', [['Search box', search(page)], ['No-results message', panel(page).getByText(/No local records match/)]], { firstScreen: true })
  await search(page).fill('alt')
  await expect(panel(page).getByRole('alert')).toBeVisible()
  await capture('failed-with-retry', [['Search box', search(page)], ['Error', panel(page).getByRole('alert')], ['Retry', panel(page).getByRole('button', { name: 'Retry search' })]], { firstScreen: true })

  // 5. An opened Home record and 6. an opened job (read-only Card).
  await search(page).fill('tarif')
  await expect(options(page)).toHaveCount(5)
  await options(page).nth(2).click()
  const record = page.getByRole('dialog', { name: 'Search record' })
  await expect(record.getByRole('heading', { name: R.event.title })).toBeVisible()
  await capture('home-record-open', [['Record dialog', record], ['Close record', record.getByRole('button', { name: 'Close record' })]], { firstScreen: true })
  await page.keyboard.press('Escape')
  await expect(search(page)).toBeFocused()
  // Closing a record keeps the query but leaves the panel closed; clicking the box reopens it.
  await search(page).click()
  await expect(options(page)).toHaveCount(5)
  await options(page).nth(0).click()
  const details = page.locator('dialog.posting-card-details')
  await expect(details).toBeVisible()
  await capture('job-open-read-only', [['Card dialog', details], ['Card title', details.getByRole('heading', { level: 2 }).first()]], { firstScreen: true })

  const geometryFile = testInfo.outputPath(`search-${label}-geometry.json`)
  await writeFile(geometryFile, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach(`search-${label}-geometry.json`, { path: geometryFile, contentType: 'application/json' })
  expect(state.unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
}

test('SR-UI-NOINIT-LAYOUT search evidence at 1440x1000 captures idle, long German results, no results, failure and opened records', async ({ page, context, baseURL }, testInfo) => {
  await captureSearchEvidence({ page, context, baseURL }, testInfo, VIEWPORTS[0])
})

test('SR-UI-NOINIT-LAYOUT search evidence at 900x1000 captures idle, long German results, no results, failure and opened records', async ({ page, context, baseURL }, testInfo) => {
  await captureSearchEvidence({ page, context, baseURL }, testInfo, VIEWPORTS[1])
})
