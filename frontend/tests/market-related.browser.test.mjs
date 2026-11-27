import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const LIST = '/posting/card'
const REFERENCE = 'Werkstudentin für barrierefreie Stadt- und Regionalverkehrsplanung im Rheinland (DEMO)'
const NEAR = 'Praktikum für Auswertung von Fahrgastdaten und kommunale Verkehrsentwicklung (DEMO)'
const OLDER = 'Werkstudent für statistische Berichte im Umweltverbund (DEMO)'
const NO_MATCH = 'Werkstudentin für Unternehmenskommunikation und Veranstaltungsplanung (DEMO)'
const NO_DOMAINS = 'Praktikum mit noch unbekanntem Aufgabenbereich (DEMO)'

function savedCard(id, title, domains, options = {}) {
  const key = suffix => `a0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
  const importKey = key(id + 20)
  const posting = postingFixture(importKey, title, { kind: 'text', source_url: null, text: title }).details
  posting.identity.company_name = { value: 'Verkehrsforschungsgesellschaft für nachhaltige Mobilität (DEMO)', origin: 'source' }
  posting.role_content.domains = domains.map(value => ({ value, origin: 'source' }))
  posting.classification.role_families = { value: ['working_student'], origin: 'source' }
  return {
    card_key: key(id), import_key: importKey, created_at: `2026-11-${String(27 - id).padStart(2, '0')}T12:00:00Z`,
    schema_version: 1, posting, posting_alias: null, user_notes: null, tags: [], ...options,
  }
}

const cards = {
  reference: savedCard(1, REFERENCE, ['  Datenanalyse ', 'Öffentliche  Mobilität', 'DATENANALYSE']),
  near: savedCard(2, NEAR, ['datenanalyse', 'O\u0308ffentliche Mobilität']),
  unrelated: savedCard(3, NO_MATCH, ['Marketing']),
  older: savedCard(4, OLDER, ['DATENANALYSE'], { posting_alias: 'Mein älterer Vergleich (DEMO)' }),
  unknown: savedCard(5, NO_DOMAINS, []),
}

async function openMarket({ page, context, baseURL }, handlers = {}) {
  const calls = []
  const unexpected = []
  const routes = {
    [LIST]: route => route.fulfill({ json: Object.values(cards) }),
    ...handlers,
  }
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET' && Object.hasOwn(routes, url.pathname)) {
      calls.push(url.pathname)
      await routes[url.pathname](route)
      return
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
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') socket.connectToServer()
    else {
      unexpected.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Import posting', exact: true })).toBeVisible()
  expect(calls).toEqual([])
  const market = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market', exact: true })
  await market.press('Enter')
  await expect(market).toHaveAttribute('aria-current', 'page')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Market', exact: true })).toBeVisible()
  return { main, reference: main.getByRole('combobox', { name: 'Reference saved job', exact: true }), calls, unexpected }
}

const nearPath = `${LIST}/${cards.near.card_key}`
const olderPath = `${LIST}/${cards.older.card_key}`

for (const width of [1440, 900]) {
  test(`Market compares recorded role domains and opens fresh saved details at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const freshTitle = `${NEAR} – aktualisiert`
    const fresh = savedCard(2, freshTitle, ['Datenanalyse'])
    const { main, reference, calls, unexpected } = await openMarket({ page, context, baseURL }, {
      [nearPath]: route => route.fulfill({ json: fresh }),
    })
    const results = main.getByRole('list', { name: 'Related saved jobs', exact: true })
    await expect(reference).toBeVisible()
    await expect(main.getByText('Choose a reference saved job to see related saved jobs.', { exact: true })).toBeVisible()
    await expect(results).toHaveCount(0)
    await reference.selectOption(cards.reference.card_key)
    await expect(main.getByText(REFERENCE, { exact: true })).toBeVisible()
    const rows = results.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText(NEAR)
    await expect(rows.nth(0)).toContainText('Öffentliche Mobilität')
    expect((await rows.nth(0).innerText()).match(/Datenanalyse/gi)).toHaveLength(1)
    await expect(rows.nth(1)).toContainText('Mein älterer Vergleich (DEMO)')
    await expect(results).not.toContainText(REFERENCE)
    await expect(results).not.toContainText(NO_MATCH)
    await expect(results).not.toContainText(NO_DOMAINS)
    expect(calls).toEqual([LIST])
    expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('related-saved-jobs.png') })

    const open = rows.nth(0).getByRole('button', { name: `View saved job: ${NEAR}`, exact: true })
    await open.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: freshTitle, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
    expect(calls).toEqual([LIST, nearPath])
    expect(unexpected).toEqual([])
  })
}

test('Market retries library loading and distinguishes missing domains, no overlaps and a deleted result', async ({ page, context, baseURL }) => {
  let loads = 0
  const { main, reference, calls, unexpected } = await openMarket({ page, context, baseURL }, {
    [LIST]: route => ++loads === 1
      ? route.fulfill({ status: 503, json: { detail: 'Synthetic storage failure' } })
      : route.fulfill({ json: Object.values(cards) }),
    [nearPath]: route => route.fulfill({ status: 404, json: { detail: 'Posting card not found' } }),
  })
  await expect(main.getByRole('alert')).toBeVisible()
  await main.getByRole('button', { name: 'Retry loading saved jobs', exact: true }).press('Enter')
  await expect(reference).toBeVisible()
  await reference.selectOption(cards.unknown.card_key)
  await expect(main.getByText(/no recorded role domains/i)).toBeVisible()
  await reference.selectOption(cards.unrelated.card_key)
  await expect(main.getByText(/no other saved jobs share/i)).toBeVisible()
  await reference.selectOption(cards.reference.card_key)
  await main.getByRole('button', { name: `View saved job: ${NEAR}`, exact: true }).press('Enter')
  await expect(main.getByRole('alert')).toContainText('This saved job is no longer available.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(calls).toEqual([LIST, LIST, nearPath])
  expect(unexpected).toEqual([])
})

test('Market has an empty state when the workspace has no saved jobs', async ({ page, context, baseURL }) => {
  const { main, calls, unexpected } = await openMarket({ page, context, baseURL }, {
    [LIST]: route => route.fulfill({ json: [] }),
  })
  await expect(main.getByText('No saved jobs yet.', { exact: true })).toBeVisible()
  await expect(main.getByRole('list', { name: 'Related saved jobs', exact: true })).toHaveCount(0)
  expect(calls).toEqual([LIST])
  expect(unexpected).toEqual([])
})

test('Market drops a pending job read when another related job is opened', async ({ page, context, baseURL }) => {
  const held = Promise.withResolvers()
  let firstStarted = false
  const { main, reference, calls, unexpected } = await openMarket({ page, context, baseURL }, {
    [nearPath]: async route => {
      firstStarted = true
      await held.promise
      await route.fulfill({ json: cards.near })
    },
    [olderPath]: route => route.fulfill({ json: cards.older }),
  })
  await reference.selectOption(cards.reference.card_key)
  try {
    await main.getByRole('button', { name: `View saved job: ${NEAR}`, exact: true }).press('Enter')
    await expect.poll(() => firstStarted).toBe(true)
    await main.getByRole('button', { name: 'View saved job: Mein älterer Vergleich (DEMO)', exact: true }).press('Enter')
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Mein älterer Vergleich (DEMO)', exact: true })).toBeVisible()
  } finally {
    held.resolve()
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.getByRole('dialog').getByRole('heading', { name: NEAR, exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Mein älterer Vergleich (DEMO)', exact: true })).toBeVisible()
  expect(calls).toEqual([LIST, nearPath, olderPath])
  expect(unexpected).toEqual([])
})
