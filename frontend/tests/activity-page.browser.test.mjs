import { expect, test as base } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const ACTIVITY_PATH = '/home/activity'
const NOW = new Date('2026-12-31T23:20:00.000Z')
const RANGE = { from: '2026-12-02T23:00:00.000Z', to: '2027-01-01T23:00:00.000Z' }
const SPRING_NOW = new Date('2026-03-29T22:15:00.000Z')
const SPRING_RANGE = { from: '2026-02-28T23:00:00.000Z', to: '2026-03-30T22:00:00.000Z' }
const CARD_KEY = 'a0000000-0000-4000-8000-000000000061'
const MISSING_CARD_KEY = 'a0000000-0000-4000-8000-000000000062'
const JOB_TITLE = 'Werkstudent (m/w/d) für barrierefreie Fahrgastinformation und regionale Nahverkehrsplanung (DEMO)'
const CARD_PATH = `/posting/card/${CARD_KEY}`
const MISSING_CARD_PATH = `/posting/card/${MISSING_CARD_KEY}`

const fixture = postingFixture('a0000000-0000-4000-8000-000000000063', JOB_TITLE, { kind: 'text', text: JOB_TITLE, source_url: null })
const CARD = {
  card_key: CARD_KEY, import_key: fixture.importKey, schema_version: 1, created_at: '2026-12-31T23:05:00.000Z',
  posting: fixture.details, posting_alias: null, user_notes: null, tags: [],
}

function operation(id, kind, occurredAt, cardKey = null) {
  return { event_id: `a0000000-0000-4000-8000-${String(id).padStart(12, '0')}`, kind,
    occurred_at: occurredAt, subject_key: `synthetic-operation:${id}`, card_key: cardKey }
}

const OPERATIONS = [
  operation(1, 'task_completed', RANGE.from),
  operation(2, 'card_saved', '2026-12-31T23:05:00.000Z', CARD_KEY),
  operation(3, 'event_adjusted', '2026-12-31T22:50:00.000Z', MISSING_CARD_KEY),
  operation(4, 'application_status_changed', '2026-12-31T23:15:00.000Z', CARD_KEY),
]

async function openWorkspace({ page, context, baseURL }, { failFirstActivity = false, events = OPERATIONS, now = NOW } = {}) {
  const activityReads = []
  const cardReads = []
  const unexpected = []
  await page.clock.setFixedTime(now)
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET') {
      if (url.pathname === ACTIVITY_PATH) {
        activityReads.push(Object.fromEntries(url.searchParams))
        if (failFirstActivity && activityReads.length === 1) {
          await route.fulfill({ status: 503, json: { detail: 'Synthetic activity unavailable' } })
          return
        }
        await route.fulfill({ json: { events, recording_started_at: events.length ? RANGE.from : null } })
        return
      }
      if (url.pathname === '/posting/card') {
        await route.fulfill({ json: [] })
        return
      }
      if (url.pathname === CARD_PATH) {
        cardReads.push(url.pathname)
        await route.fulfill({ json: CARD })
        return
      }
      if (url.pathname === MISSING_CARD_PATH) {
        cardReads.push(url.pathname)
        await route.fulfill({ status: 404, json: { detail: 'Synthetic deleted Card' } })
        return
      }
    }
    if (url.origin === baseURL && request.method() === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
      return
    }
    unexpected.push(`${request.method()} ${request.url()}`)
    await route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
      return
    }
    unexpected.push(`WebSocket ${socket.url()}`)
    socket.close()
  })
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  return { navigation, activityReads, cardReads, unexpected }
}

const test = base.extend({ timezoneId: 'Europe/Berlin', locale: 'en-GB' })

test('Activity groups recent local operations and opens linked jobs only when requested', async ({ page, context, baseURL }) => {
  const { navigation, activityReads, cardReads, unexpected } = await openWorkspace({ page, context, baseURL })
  await expect(page.getByRole('heading', { name: 'Import posting' })).toBeVisible()
  await navigation.getByRole('button', { name: 'Card library', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No saved jobs yet', exact: true })).toBeVisible()
  expect(activityReads).toEqual([])
  expect(cardReads).toEqual([])

  await navigation.getByRole('button', { name: 'Activity', exact: true }).click()
  const main = page.getByRole('main')
  const rows = main.getByRole('listitem')
  await expect(rows).toHaveCount(4)
  await expect(rows).toContainText(['Application status changed', 'Job saved', 'Event adjusted', 'Task completed'])
  await expect(rows.locator('time')).toHaveText(['00:15', '00:05', '23:50', '00:00'])
  const days = ['Friday, 1 January 2027', 'Thursday, 31 December 2026', 'Thursday, 3 December 2026']
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(days)
  await expect(main.getByRole('region', { name: days[0], exact: true }).getByRole('listitem'))
    .toContainText(['Application status changed', 'Job saved'])
  await expect(main.getByRole('region', { name: days[1], exact: true }).getByRole('listitem')).toContainText(['Event adjusted'])
  await expect(main.getByRole('region', { name: days[2], exact: true }).getByRole('listitem')).toContainText(['Task completed'])
  expect(activityReads).toEqual([RANGE])
  expect(cardReads).toEqual([])

  const liveRow = rows.filter({ hasText: 'Application status changed' })
  const openJob = liveRow.getByRole('button', { name: 'Open job', exact: true })
  await openJob.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: JOB_TITLE, exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Edit card' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Review match' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(openJob).toBeFocused()

  const missingRow = rows.filter({ hasText: 'Event adjusted' })
  const openMissing = missingRow.getByRole('button', { name: 'Open job', exact: true })
  await openMissing.click()
  await expect(missingRow.getByRole('alert')).toHaveText('This saved job is no longer available. Its activity remains here.')
  await expect(openMissing).toBeEnabled()
  await expect(missingRow).toBeVisible()
  await expect(rows).toHaveCount(4)
  await expect(dialog).toHaveCount(0)
  expect(cardReads).toEqual([CARD_PATH, MISSING_CARD_PATH])
  expect(activityReads).toEqual([RANGE])
  expect(unexpected).toEqual([])
})

test('Activity retries a failed read explicitly and then reports an empty period', async ({ page, context, baseURL }) => {
  const { navigation, activityReads, cardReads, unexpected } = await openWorkspace(
    { page, context, baseURL }, { failFirstActivity: true, events: [], now: SPRING_NOW },
  )
  await navigation.getByRole('button', { name: 'Activity', exact: true }).click()
  const main = page.getByRole('main')
  const empty = main.getByText('No activity recorded in the last 30 days.', { exact: true })
  const retry = main.getByRole('button', { name: 'Retry activity', exact: true })
  await expect(main.getByRole('alert')).toHaveText('Activity could not be loaded. Please retry.')
  await expect(empty).toBeHidden()
  expect(activityReads).toEqual([SPRING_RANGE])
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(empty).toBeVisible()
  await expect(main.getByRole('alert')).toHaveCount(0)
  await expect(retry).toHaveCount(0)
  expect(activityReads).toEqual([SPRING_RANGE, SPRING_RANGE])
  expect(cardReads).toEqual([])
  expect(unexpected).toEqual([])
})
