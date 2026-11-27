import { expect, test } from '@playwright/test'

const API = 'http://127.0.0.1:8000'
const TASK_ID = 'a0000000-0000-4000-8000-000000000001'
const EVENT_ID = 'a0000000-0000-4000-8000-000000000002'
const TASK_TITLE = 'Bewerbungsunterlagen für die Werkstudentenstelle Netzentgeltabrechnung überarbeiten'
const EVENT_TITLE = 'Bewerbungsgespräch mit der Süddeutschen Energieversorgungs- und Netzinfrastrukturgesellschaft'
const RESULTS = [
  { type: 'task', source: 'Home', title: TASK_TITLE, snippet: 'Anschreiben abstimmen', target: { kind: 'task', id: TASK_ID }, card_missing: false },
  { type: 'event', source: 'Home', title: EVENT_TITLE, snippet: 'Rückfragen zur Tarifbindung vorbereiten', target: { kind: 'event', id: EVENT_ID }, card_missing: false },
]
const EVENT_PATH = `/search/records/event/${EVENT_ID}`

async function openSearch({ page, context, baseURL }, { failFirstSearch = false } = {}) {
  const searches = []
  const recordReads = []
  const unexpected = []

  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET') {
      if (url.pathname === '/search') {
        searches.push(url.searchParams.get('q'))
        if (failFirstSearch && searches.length === 1) {
          await route.fulfill({ status: 503, json: { detail: 'synthetic failure' } })
          return
        }
        await route.fulfill({ json: { results: RESULTS, has_more: false } })
        return
      }
      if (url.pathname === EVENT_PATH) {
        recordReads.push(url.pathname)
        await route.fulfill({ json: {
          id: EVENT_ID, type: 'event', title: EVENT_TITLE, source: 'Home', card_missing: false,
          card_key: null, fields: [{ label: 'Kind', value: 'Interview' }],
        } })
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
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
      return
    }
    unexpected.push(`WebSocket ${socket.url()}`)
    socket.close()
  })

  await page.goto('/')
  const input = page.getByRole('combobox', { name: 'Search your workspace' })
  await input.focus()
  await expect(input).toBeFocused()
  return { input, searches, recordReads, unexpected }
}

test('Workspace search clears a dismissed query from the keyboard without restarting it', async ({ page, context, baseURL }) => {
  await page.clock.install()
  const { input, searches, recordReads, unexpected } = await openSearch({ page, context, baseURL })
  await page.keyboard.type('tarif')
  await expect(page.getByRole('option')).toHaveCount(2)

  await page.keyboard.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(input).toBeFocused()
  await expect(input).toHaveValue('')
  await expect(page.getByText('Search saved jobs, companies, notes, tasks, events and applications.')).toBeVisible()
  await page.clock.runFor(300)
  await expect(page.getByText('Searching local records…')).toHaveCount(0)
  expect(searches).toEqual(['tarif'])
  expect(recordReads).toEqual([])
  expect(unexpected).toEqual([])
})

test('Workspace search keeps keyboard navigation available after retry', async ({ page, context, baseURL }) => {
  const { input, searches, recordReads, unexpected } = await openSearch({ page, context, baseURL }, { failFirstSearch: true })
  const panel = page.getByRole('region', { name: 'Local workspace search' })
  await page.keyboard.type('gespräch')
  await expect(panel.getByRole('alert')).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Retry search' })).toBeFocused()
  await page.keyboard.press('Enter')

  const options = panel.getByRole('option')
  await expect(options).toHaveCount(2)
  await expect(input).toBeFocused()
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Search record' })
  await expect(dialog.getByRole('heading', { name: EVENT_TITLE })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  expect(searches).toEqual(['gespräch', 'gespräch'])
  // StrictMode can replay the detail viewer's effect in development.
  expect([...new Set(recordReads)]).toEqual([EVENT_PATH])
  expect(unexpected).toEqual([])
})

test('Workspace search reverses a close without leaving the hidden panel interactive', async ({ page, context, baseURL }) => {
  const { input, searches, unexpected } = await openSearch({ page, context, baseURL })
  const panel = page.locator('.global-search__panel')
  const region = page.getByRole('region', { name: 'Local workspace search' })
  await expect(region).toBeVisible()
  await expect(panel).toHaveCSS('opacity', '1')
  expect(await panel.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeGreaterThan(0)

  await page.keyboard.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await expect(panel).toHaveAttribute('inert', '')
  await expect(region).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(region).toBeVisible()
  await expect(input).toBeFocused()
  await expect(panel).toHaveCSS('opacity', '1')

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCSS('visibility', 'hidden')
  expect(searches).toEqual([])
  expect(unexpected).toEqual([])
})

test('Workspace search opens and closes immediately with reduced motion', async ({ page, context, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { input, searches, unexpected } = await openSearch({ page, context, baseURL })
  const panel = page.locator('.global-search__panel')
  await expect(panel).toHaveCSS('transition-property', 'none')
  await expect(panel).toHaveCSS('opacity', '1')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCSS('visibility', 'hidden')
  await expect(input).toBeFocused()
  expect(searches).toEqual([])
  expect(unexpected).toEqual([])
})
