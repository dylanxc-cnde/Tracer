import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const CARDS = '/posting/card'
const WATCHLIST = '/posting/watchlist'
const KEY = 'a0000000-0000-4000-8000-000000000061'
const IMPORT_KEY = 'a0000000-0000-4000-8000-000000000062'
const TARGET = `${WATCHLIST}/${KEY}`
const CARD = `${CARDS}/${KEY}`
const SOURCE_RECEIPT = `${CARD}/source-receipt`
const SOURCE_CHECKS = `${CARD}/source-checks`
const TITLE = 'Werkstudent für datenbasierte Fahrgastinformation und barrierefreie Verkehrsplanung im Rheinland (DEMO)'
const WATCHED_AT = '2026-11-27T12:34:56Z'
const membership = { card_key: KEY, watched_at: WATCHED_AT }
const { details } = postingFixture(IMPORT_KEY, TITLE, { kind: 'text', text: TITLE, source_url: null })
const card = { card_key: KEY, import_key: IMPORT_KEY, created_at: WATCHED_AT, schema_version: 1,
  posting: details, posting_alias: null, user_notes: null, tags: [] }

async function openWatchlist(
  { page, context, baseURL },
  onWatchRequest,
  { savedCards = [card], onCardRead, onSourceReceipt, onSourceChecks } = {},
) {
  const calls = []
  const unexpected = []
  const cardReads = { [CARD]: onCardRead, [SOURCE_RECEIPT]: onSourceReceipt, [SOURCE_CHECKS]: onSourceChecks }
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    if (url.origin === API && method === 'GET' && url.pathname === CARDS) {
      calls.push(`GET ${CARDS}`)
      await route.fulfill({ json: savedCards })
      return
    }
    const onRead = cardReads[url.pathname]
    if (url.origin === API && method === 'GET' && onRead) {
      calls.push(`GET ${url.pathname}`)
      await onRead(route)
      return
    }
    if (url.origin === API && (url.pathname === WATCHLIST || url.pathname === TARGET)) {
      calls.push(`${method} ${url.pathname}`)
      await onWatchRequest(route, request)
      return
    }
    if (url.origin === baseURL && method === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
      return
    }
    unexpected.push(`${method} ${request.url()}`)
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
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await nav.getByRole('button', { name: 'Market', exact: true }).press('Enter')
  const main = page.getByRole('main')
  await expect(main.getByRole('combobox', { name: 'Reference saved job', exact: true })).toBeVisible()
  const summary = main.getByText('Watchlist', { exact: true })
  await expect(summary).toBeVisible()
  expect(calls).toEqual([`GET ${CARDS}`])
  await summary.press('Enter')
  return { section: summary.locator('..'), summary, calls, unexpected }
}

const earlierCheck = {
  check_id: 'a0000000-0000-4000-8000-000000000091',
  result: 'listed',
  recorded_at: '2026-11-26T08:20:00.000123Z',
}
const newerCheck = {
  check_id: 'a0000000-0000-4000-8000-000000000092',
  result: 'not_listed',
  recorded_at: '2026-11-26T08:20:00.000456Z',
}

function previouslyWatched(route) {
  return route.fulfill({ json: [{
    ...membership,
    last_source_check: { result: earlierCheck.result, recorded_at: earlierCheck.recorded_at },
  }] })
}

async function openSourceChecks(page, opener) {
  await opener.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: TITLE, exact: true })).toBeVisible()
  await dialog.getByText('Import source', { exact: true }).press('Enter')
  await expect(dialog.getByText('Import receipt is unavailable.', { exact: true })).toBeVisible()
  await dialog.getByText('Source checks', { exact: true }).press('Enter')
  return dialog
}

const watchedCardOptions = {
  onCardRead: (route) => route.fulfill({ json: card }),
  onSourceReceipt: (route) => route.fulfill({ json: null }),
}

for (const width of [1440, 900]) {
  test(`Market keeps the newest observed source check on the watched Card at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    let checks = [newerCheck, earlierCheck]
    const { section, summary, calls, unexpected } = await openWatchlist({ page, context, baseURL }, previouslyWatched, {
      ...watchedCardOptions,
      onSourceChecks: (route) => route.fulfill({ json: checks }),
    })
    const row = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
    const opener = row.getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
    await expect(row.getByText('Still listed', { exact: true })).toBeVisible()

    const dialog = await openSourceChecks(page, opener)
    const history = dialog.getByRole('list', { name: 'Recorded source checks', exact: true })
    await expect(history.getByRole('listitem').first()).toContainText('No longer listed')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await expect(row.getByText('No longer listed', { exact: true })).toBeVisible()
    await expect(row.locator(`time[datetime="${newerCheck.recorded_at}"]`)).toBeVisible()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${CARD}`, `GET ${SOURCE_RECEIPT}`, `GET ${SOURCE_CHECKS}`])
    await page.screenshot({ path: testInfo.outputPath('observed-watch-source-check.png'), animations: 'disabled' })

    checks = [earlierCheck]
    await openSourceChecks(page, opener)
    await expect(history.getByRole('listitem').first()).toContainText('Still listed')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(row.getByText('No longer listed', { exact: true })).toBeVisible()

    await summary.press('Enter')
    await expect(row).toBeHidden()
    await summary.press('Enter')
    await expect.poll(() => calls.filter(call => call === `GET ${WATCHLIST}`).length).toBe(2)
    await expect(section.getByText('Loading watchlist…', { exact: true })).toBeHidden()
    await expect(row.getByText('No longer listed', { exact: true })).toBeVisible()
    expect(calls).toEqual([
      `GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${CARD}`, `GET ${SOURCE_RECEIPT}`, `GET ${SOURCE_CHECKS}`,
      `GET ${CARD}`, `GET ${SOURCE_RECEIPT}`, `GET ${SOURCE_CHECKS}`, `GET ${WATCHLIST}`,
    ])
    expect(unexpected).toEqual([])
  })
}

test('Market ignores a source check response after the watched Card closes', async ({ page, context, baseURL }) => {
  const held = Promise.withResolvers()
  const started = Promise.withResolvers()
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, previouslyWatched, {
    ...watchedCardOptions,
    onSourceChecks: async (route) => {
      started.resolve()
      await held.promise
      await route.fulfill({ json: [newerCheck, earlierCheck] })
    },
  })
  const row = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
  const opener = row.getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
  try {
    const dialog = await openSourceChecks(page, opener)
    await started.promise
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  } finally {
    held.resolve()
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(opener).toBeFocused()
  await expect(row.getByText('Still listed', { exact: true })).toBeVisible()
  await expect(row.getByText('No longer listed', { exact: true })).toHaveCount(0)
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${CARD}`, `GET ${SOURCE_RECEIPT}`, `GET ${SOURCE_CHECKS}`])
  expect(unexpected).toEqual([])
})

for (const width of [1440, 900]) {
  test(`Market watches and stops watching a saved job explicitly at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    let watched = false
    const bodies = []
    const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: watched ? [membership] : [] })
        return
      }
      bodies.push(request.postData())
      if (request.method() === 'PUT') {
        watched = true
        await route.fulfill({ json: membership })
      } else {
        watched = false
        await route.fulfill({ status: 204 })
      }
    })
    const empty = section.getByText('No watched jobs yet.', { exact: true })
    await expect(empty).toBeVisible()
    const choice = section.getByRole('combobox', { name: 'Saved job to watch', exact: true })
    const watch = section.getByRole('button', { name: 'Watch job', exact: true })
    await expect(watch).toBeDisabled()
    await choice.selectOption(KEY)
    await expect(watch).toBeEnabled()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
    await watch.press('Enter')
    const row = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
    await expect(row).toContainText(TITLE)
    const stop = row.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })
    await expect(stop).toBeEnabled()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`])
    await section.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('watched-saved-job.png') })

    await stop.press('Enter')
    await expect(empty).toBeVisible()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`, `DELETE ${TARGET}`])
    expect(bodies).toEqual([null, null])
    expect(unexpected).toEqual([])
  })
}

for (const reachedServer of [true, false]) {
  test(`Market checks the watchlist before retrying a ${reachedServer ? 'recorded' : 'unrecorded'} watch`, async ({ page, context, baseURL }) => {
    let watched = false
    let writes = 0
    const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: watched ? [membership] : [] })
        return
      }
      writes += 1
      if (writes === 1) {
        watched = reachedServer
        await route.abort('failed')
      } else {
        watched = true
        await route.fulfill({ json: membership })
      }
    })
    const choice = section.getByRole('combobox', { name: 'Saved job to watch', exact: true })
    const watch = section.getByRole('button', { name: 'Watch job', exact: true })
    await choice.selectOption(KEY)
    await expect(watch).toBeEnabled()
    await watch.press('Enter')
    const verify = section.getByRole('button', { name: 'Check watchlist', exact: true })
    await expect(verify).toBeEnabled()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`])
    await verify.press('Enter')
    if (!reachedServer) {
      const retry = section.getByRole('button', { name: 'Retry same change', exact: true })
      await expect(retry).toBeEnabled()
      expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`, `GET ${WATCHLIST}`])
      await retry.press('Enter')
    }
    await expect(section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')).toContainText(TITLE)
    const expected = [`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`, `GET ${WATCHLIST}`]
    if (!reachedServer) expected.push(`PUT ${TARGET}`)
    expect(calls).toEqual(expected)
    expect(unexpected).toEqual([])
  })
}

test('Market keeps the watched row until a missing stop-watching receipt is checked', async ({ page, context, baseURL }) => {
  let watched = true
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({ json: watched ? [membership] : [] })
      return
    }
    expect(request.method()).toBe('DELETE')
    watched = false
    await route.abort('failed')
  })
  const stop = section.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })
  await expect(stop).toBeEnabled()
  await stop.press('Enter')
  const verify = section.getByRole('button', { name: 'Check watchlist', exact: true })
  await expect(verify).toBeEnabled()
  await expect(section.getByRole('list', { name: 'Watched jobs', exact: true })).toContainText(TITLE)
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${TARGET}`])
  await verify.press('Enter')
  await expect(section.getByText('No watched jobs yet.', { exact: true })).toBeVisible()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${TARGET}`, `GET ${WATCHLIST}`])
  expect(unexpected).toEqual([])
})

test('Market retries an unavailable watchlist without making a change', async ({ page, context, baseURL }) => {
  let reads = 0
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, route => ++reads === 1
    ? route.fulfill({ status: 503, json: { detail: 'Synthetic watchlist failure' } })
    : route.fulfill({ json: [] }),
  )
  await expect(section.getByRole('alert')).toHaveText('Could not load watchlist.')
  await expect(section.getByText('No watched jobs yet.', { exact: true })).toBeHidden()
  await section.getByRole('button', { name: 'Retry loading watchlist', exact: true }).press('Enter')
  await expect(section.getByText('No watched jobs yet.', { exact: true })).toBeVisible()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${WATCHLIST}`])
  expect(unexpected).toEqual([])
})

test('Market keeps focus ownership when the same job is opened from another section', async ({ page, context, baseURL }) => {
  const held = Promise.withResolvers()
  const posting = { ...card.posting, role_content: { ...card.posting.role_content, domains: [{ value: 'Datenanalyse', origin: 'source' }] } }
  const watched = { ...card, posting }
  const reference = { ...watched, card_key: 'a0000000-0000-4000-8000-000000000063', posting_alias: 'Meine Referenz (DEMO)' }
  let reads = 0
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, route => route.fulfill({ json: [membership] }), {
    savedCards: [watched, reference],
    onCardRead: async route => {
      reads += 1
      if (reads === 1) await held.promise
      await route.fulfill({ json: watched })
    },
  })
  const watchOpener = section.getByRole('list', { name: 'Watched jobs', exact: true })
    .getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
  await expect(watchOpener).toBeVisible()
  const main = page.getByRole('main')
  await main.getByRole('combobox', { name: 'Reference saved job', exact: true }).selectOption(reference.card_key)
  const relatedOpener = main.getByRole('list', { name: 'Related saved jobs', exact: true })
    .getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
  const dialog = page.getByRole('dialog')
  try {
    await relatedOpener.press('Enter')
    await expect.poll(() => reads).toBe(1)
    await watchOpener.press('Enter')
    await expect(dialog.getByRole('heading', { name: TITLE, exact: true })).toBeVisible()
  } finally {
    held.resolve()
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(watchOpener).toBeFocused()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${CARDS}/${KEY}`, `GET ${CARDS}/${KEY}`])
  expect(unexpected).toEqual([])
})

for (const width of [1440, 900]) {
  test(`Market identifies the last recorded source check at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const unchecked = { ...card, card_key: 'a0000000-0000-4000-8000-000000000064', posting_alias: 'Offene Ausschreibung zur Schieneninfrastruktur (DEMO)' }
    const legacy = { ...card, card_key: 'a0000000-0000-4000-8000-000000000065', posting_alias: 'Archiviertes Praktikum in der Mobilitätsplanung (DEMO)' }
    const recordedAt = '2026-11-26T08:20:00Z'
    const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, route => route.fulfill({ json: [
      { ...membership, last_source_check: { result: 'not_listed', recorded_at: recordedAt } },
      { ...membership, card_key: unchecked.card_key, last_source_check: null },
      { ...membership, card_key: legacy.card_key },
    ] }), { savedCards: [card, unchecked, legacy] })
    const rows = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
    await expect(rows).toHaveCount(3)
    const checked = rows.filter({ hasText: TITLE })
    await expect(checked).toContainText('Last source check')
    await expect(checked).toContainText('No longer listed')
    await expect(checked.locator(`time[datetime="${recordedAt}"]`)).toBeVisible()
    await expect(rows.filter({ hasText: unchecked.posting_alias })).toContainText('No source check recorded.')
    const old = rows.filter({ hasText: legacy.posting_alias })
    await expect(old).not.toContainText('Last source check')
    await expect(old).not.toContainText('No source check recorded.')
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
    expect(unexpected).toEqual([])
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await checked.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('last-recorded-source-check.png') })
  })
}
