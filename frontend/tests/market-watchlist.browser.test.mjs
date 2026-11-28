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
const WATCH_ID = 'a0000000-0000-4000-8000-000000000071'
const NEW_WATCH_ID = 'a0000000-0000-4000-8000-000000000072'
const membership = { card_key: KEY, watch_id: WATCH_ID, watched_at: WATCHED_AT }
const replacement = { ...membership, watch_id: NEW_WATCH_ID }
const stopTarget = watchId => `${TARGET}?expected_watch_id=${watchId}`
const { details } = postingFixture(IMPORT_KEY, TITLE, { kind: 'text', text: TITLE, source_url: null })
const card = { card_key: KEY, import_key: IMPORT_KEY, created_at: WATCHED_AT, schema_version: 1,
  posting: details, posting_alias: null, user_notes: null, tags: [] }

async function openWatchlist(
  { page, context, baseURL },
  onWatchRequest,
  {
    savedCards = [card], onCardRead, onSourceReceipt, onSourceChecks, watchTargets = [TARGET],
  } = {},
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
    if (url.origin === API && (url.pathname === WATCHLIST || watchTargets.includes(url.pathname))) {
      calls.push(`${method} ${url.pathname}${url.search}`)
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
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`, `DELETE ${stopTarget(WATCH_ID)}`])
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
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`])
  await verify.press('Enter')
  await expect(section.getByText('No watched jobs yet.', { exact: true })).toBeVisible()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`, `GET ${WATCHLIST}`])
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
      { ...membership, card_key: unchecked.card_key, watch_id: 'a0000000-0000-4000-8000-000000000073', last_source_check: null },
      { ...membership, card_key: legacy.card_key, watch_id: 'a0000000-0000-4000-8000-000000000074' },
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

function safeToStop(request, current) {
  const expected = new URL(request.url()).searchParams.get('expected_watch_id')
  return current === null || expected === null || expected === current.watch_id
}

for (const width of [1440, 900]) {
  test(`Market preserves a newer watch when an earlier removal reaches it at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const held = Promise.withResolvers()
    let current = membership
    let removals = 0
    const { section, summary, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: current ? [current] : [] })
        return
      }
      expect(request.method()).toBe('DELETE')
      expect(request.postData()).toBeNull()
      removals += 1
      if (removals === 1) await held.promise
      if (!safeToStop(request, current)) {
        await route.fulfill({ status: 412, json: { detail: 'posting.watchlist_changed' } })
        return
      }
      current = null
      await route.fulfill({ status: 204 })
    })
    const stop = section.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })
    try {
      await stop.press('Enter')
      await expect.poll(() => removals).toBe(1)
      await expect(stop).toBeDisabled()
      current = replacement
    } finally {
      held.resolve()
    }

    const readback = section.getByRole('button', { name: 'Check watchlist', exact: true })
    await expect(section.getByRole('alert')).toHaveText('This saved job was watched again. Check the watchlist to refresh it.')
    await expect(readback).toBeEnabled()
    await expect(section.getByRole('button', { name: 'Retry same change', exact: true })).toHaveCount(0)
    await expect(stop).toBeDisabled()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`])
    await readback.press('Enter')
    await expect(section.getByText('The newer watch is still active.', { exact: true })).toBeVisible()
    await expect(summary).toBeFocused()
    await expect(stop).toBeEnabled()
    expect(current).toEqual(replacement)
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`, `GET ${WATCHLIST}`])
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('newer-watch-preserved.png'), animations: 'disabled' })

    await stop.press('Enter')
    await expect(section.getByText('No watched jobs yet.', { exact: true })).toBeVisible()
    expect(calls).toEqual([
      `GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(NEW_WATCH_ID)}`,
    ])
    expect(unexpected).toEqual([])
  })
}

for (const replacedBeforeRead of [true, false]) {
  test(`Market preserves the original watch identity ${replacedBeforeRead ? 'when checking an unknown removal' : 'when retrying an unknown removal'}`, async ({ page, context, baseURL }) => {
    let current = membership
    let attempts = 0
    const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: current ? [current] : [] })
        return
      }
      expect(request.method()).toBe('DELETE')
      attempts += 1
      if (attempts === 1) {
        await route.abort('failed')
        return
      }
      if (!safeToStop(request, current)) {
        await route.fulfill({ status: 412, json: { detail: 'posting.watchlist_changed' } })
        return
      }
      current = null
      await route.fulfill({ status: 204 })
    })
    await section.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true }).press('Enter')
    const readback = section.getByRole('button', { name: 'Check watchlist', exact: true })
    const retry = section.getByRole('button', { name: 'Retry same change', exact: true })
    await expect(readback).toBeEnabled()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`])
    if (replacedBeforeRead) current = replacement
    await readback.press('Enter')
    const expected = [`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`, `GET ${WATCHLIST}`]

    if (!replacedBeforeRead) {
      await expect(retry).toBeEnabled()
      expect(calls).toEqual(expected)
      current = replacement
      await retry.press('Enter')
      await expect(readback).toBeEnabled()
      await expect(section.getByRole('alert')).toHaveText('This saved job was watched again. Check the watchlist to refresh it.')
      expected.push(`DELETE ${stopTarget(WATCH_ID)}`)
      expect(calls).toEqual(expected)
      await readback.press('Enter')
      expected.push(`GET ${WATCHLIST}`)
    }

    await expect(section.getByText('The newer watch is still active.', { exact: true })).toBeVisible()
    await expect(retry).toHaveCount(0)
    await expect(section.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })).toBeEnabled()
    expect(current).toEqual(replacement)
    expect(calls).toEqual(expected)
    expect(unexpected).toEqual([])
  })
}

test('Market requires a valid membership identifier before offering Stop watching', async ({ page, context, baseURL }) => {
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, route =>
    route.fulfill({ json: [{ ...membership, watch_id: 'invalid' }] }))
  await expect(section.getByRole('alert')).toHaveText('Could not load watchlist.')
  await expect(section.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })).toHaveCount(0)
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
  expect(unexpected).toEqual([])
})

const REMOTE_TITLE = 'Werkstudentin für barrierefreie Fahrgastinformation und regionale Nahverkehrsentwicklung im Rheinland (DEMO)'
const FIRST_COMPANY = 'Kommunalverbund für nachhaltige Mobilitätsforschung (DEMO)'
const SECOND_COMPANY = 'Forschungsnetz für regionale Verkehrsplanung und öffentlichen Nahverkehr (DEMO)'
const FIRST_CARD = 'a0000000-0000-4000-8000-000000000081'
const SECOND_CARD = 'a0000000-0000-4000-8000-000000000082'
const FIRST_MEMBERSHIP = 'a0000000-0000-4000-8000-000000000083'
const SECOND_MEMBERSHIP = 'a0000000-0000-4000-8000-000000000084'

for (const width of [1440, 900]) {
  test(`Market identifies newly watched Cards before a scoped keyboard removal at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const staleAlias = 'Vorläufiger Titel aus dem ersten Bibliothekslesen (DEMO)'
    const revisedTitle = 'Aktualisiertes Praktikum in der kommunalen und regionalen Verkehrsplanung (DEMO)'
    const revisedCompany = 'Gesellschaft für wissenschaftliche Fahrgastinformatik (DEMO)'
    const cachedCard = { ...card, posting_alias: staleAlias }
    const relatedFirst = {
      ...membership, card_key: FIRST_CARD, watch_id: FIRST_MEMBERSHIP,
      card_identity: {
        posting_alias: REMOTE_TITLE, position_title: 'Ursprüngliche Ausschreibung für Stadtplanung (DEMO)', company_name: FIRST_COMPANY,
      },
    }
    const relatedSecond = {
      ...membership, card_key: SECOND_CARD, watch_id: SECOND_MEMBERSHIP,
      card_identity: { posting_alias: ' \u200b\t ', position_title: REMOTE_TITLE, company_name: SECOND_COMPANY },
    }
    const revised = {
      ...membership,
      card_identity: { posting_alias: null, position_title: revisedTitle, company_name: revisedCompany },
    }
    const target = `${WATCHLIST}/${SECOND_CARD}`
    const guardedTarget = `${target}?expected_watch_id=${SECOND_MEMBERSHIP}`
    const { section, summary, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: [relatedFirst, relatedSecond, revised] })
        return
      }
      expect(request.method()).toBe('DELETE')
      expect(new URL(request.url()).search).toBe(`?expected_watch_id=${SECOND_MEMBERSHIP}`)
      expect(request.postData()).toBeNull()
      await route.fulfill({ status: 204 })
    }, { savedCards: [cachedCard], watchTargets: [target] })

    const list = section.getByRole('list', { name: 'Watched jobs', exact: true })
    const rows = list.getByRole('listitem')
    const first = rows.filter({ has: page.getByText(FIRST_COMPANY, { exact: true }) })
    const second = rows.filter({ has: page.getByText(SECOND_COMPANY, { exact: true }) })
    await expect(rows).toHaveCount(3)
    await expect(first.getByRole('heading', { name: REMOTE_TITLE, exact: true })).toBeVisible()
    await expect(second.getByRole('heading', { name: REMOTE_TITLE, exact: true })).toBeVisible()
    await expect(first.getByRole('button', { name: `Stop watching: ${REMOTE_TITLE} at ${FIRST_COMPANY}`, exact: true })).toBeEnabled()
    const current = rows.filter({ has: page.getByRole('heading', { name: revisedTitle, exact: true }) })
    await expect(current.getByText(revisedCompany, { exact: true })).toBeVisible()
    await expect(list).not.toContainText(staleAlias)
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])

    const open = second.getByRole('button', { name: `View saved job: ${REMOTE_TITLE} at ${SECOND_COMPANY}`, exact: true })
    const stop = second.getByRole('button', { name: `Stop watching: ${REMOTE_TITLE} at ${SECOND_COMPANY}`, exact: true })
    await open.press('Tab')
    await expect(stop).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('recognized-watchlist-targets.png'), animations: 'disabled' })

    await page.keyboard.press('Enter')
    await expect(second).toHaveCount(0)
    await expect(first).toBeVisible()
    await expect(current).toBeVisible()
    await expect(rows).toHaveCount(2)
    await expect(summary).toBeFocused()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${guardedTarget}`])
    expect(unexpected).toEqual([])
  })
}

test('Market disables Stop watching for unavailable watchlist identities', async ({ page, context, baseURL }) => {
  const legacy = { ...membership, card_key: FIRST_CARD, watch_id: FIRST_MEMBERSHIP }
  const unavailable = { ...membership, card_key: SECOND_CARD, watch_id: SECOND_MEMBERSHIP, card_identity: null }
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, (route, request) => {
    expect(request.method()).toBe('GET')
    return route.fulfill({ json: [membership, legacy, unavailable] })
  })

  const rows = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
  const unknown = rows.filter({ has: page.getByRole('heading', { name: 'Saved job details unavailable', exact: true }) })
  await expect(rows).toHaveCount(3)
  await expect(unknown).toHaveCount(2)
  const unknownStops = unknown.getByRole('button', { name: 'Stop watching: Saved job details unavailable', exact: true })
  await expect(unknownStops).toHaveCount(2)
  for (const stop of await unknownStops.all()) {
    await expect(stop).toBeDisabled()
    await stop.press('Enter')
  }
  await expect(section.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })).toBeEnabled()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
  expect(unexpected).toEqual([])
})

test('Market refreshes the watched identity from an explicitly opened current Card', async ({ page, context, baseURL }) => {
  const projectedTitle = 'Praktikum in der kommunalen Mobilitätsforschung (DEMO)'
  const projectedCompany = 'Kommunalverband für Verkehrsplanung (DEMO)'
  const freshTitle = 'Praktikum für barrierefreie Fahrgastinformation und Tarifdatenanalyse (DEMO)'
  const freshCompany = 'Verbundgesellschaft für nachhaltigen Regionalverkehr (DEMO)'
  const fresh = structuredClone(card)
  fresh.posting.identity.position_title.value = freshTitle
  fresh.posting.identity.company_name = { origin: 'source', value: freshCompany }
  const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, (route, request) => {
    expect(request.method()).toBe('GET')
    return route.fulfill({ json: [{
      ...membership,
      card_identity: { posting_alias: null, position_title: projectedTitle, company_name: projectedCompany },
    }] })
  }, { onCardRead: route => route.fulfill({ json: fresh }) })

  const row = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
  await expect(row.getByRole('heading', { name: projectedTitle, exact: true })).toBeVisible()
  await expect(row.getByText(projectedCompany, { exact: true })).toBeVisible()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
  await row.getByRole('button', { name: `View saved job: ${projectedTitle} at ${projectedCompany}`, exact: true }).press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: freshTitle, exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(row.getByRole('heading', { name: freshTitle, exact: true })).toBeVisible()
  await expect(row.getByText(freshCompany, { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: `View saved job: ${freshTitle} at ${freshCompany}`, exact: true })).toBeFocused()
  await expect(row.getByRole('button', { name: `Stop watching: ${freshTitle} at ${freshCompany}`, exact: true })).toBeEnabled()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${CARD}`])
  expect(unexpected).toEqual([])
})

const ALTERNATE_TITLE = 'Werkstudentin für barrierefreie Fahrgastzählung und kommunale Nahverkehrsplanung im Rheinland (DEMO)'
const RETAINED_TITLE = 'Praktikum für nachhaltige Mobilität und digitale Fahrgastinformationssysteme (DEMO)'
const alternateCard = { ...card, card_key: FIRST_CARD, posting_alias: ALTERNATE_TITLE }
const retainedCard = { ...card, card_key: SECOND_CARD, posting_alias: RETAINED_TITLE }
const alternateWatch = { ...membership, card_key: FIRST_CARD, watch_id: FIRST_MEMBERSHIP }
const retainedWatch = { ...membership, card_key: SECOND_CARD, watch_id: SECOND_MEMBERSHIP }
const alternateTarget = `${WATCHLIST}/${FIRST_CARD}`
const dismissReadbackCalls = [`GET ${CARDS}`, `GET ${WATCHLIST}`, `PUT ${TARGET}`, `GET ${WATCHLIST}`]

for (const width of [1440, 900]) {
  test(`Market dismisses a verified unrecorded watch and allows a different choice at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    let watchReads = 0
    const { section, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        watchReads += 1
        await route.fulfill({ json: watchReads === 1 ? [] : [retainedWatch] })
        return
      }
      expect(request.method()).toBe('PUT')
      expect(request.postData()).toBeNull()
      if (new URL(request.url()).pathname === TARGET) {
        await route.abort('failed')
      } else {
        await route.fulfill({ json: alternateWatch })
      }
    }, { savedCards: [card, alternateCard, retainedCard], watchTargets: [TARGET, alternateTarget] })

    const choice = section.getByRole('combobox', { name: 'Saved job to watch', exact: true })
    const watch = section.getByRole('button', { name: 'Watch job', exact: true })
    const dismiss = section.getByRole('button', { name: 'Dismiss change', exact: true })
    const list = section.getByRole('list', { name: 'Watched jobs', exact: true })
    await expect(choice).toBeEnabled()
    await choice.press('ArrowDown')
    await expect(choice).toHaveValue(KEY)
    await watch.press('Enter')
    const check = section.getByRole('button', { name: 'Check watchlist', exact: true })
    await expect(check).toBeEnabled()
    await expect(dismiss).toHaveCount(0)
    await expect(choice).toBeDisabled()
    expect(calls).toEqual(dismissReadbackCalls.slice(0, 3))

    await check.press('Enter')
    const retry = section.getByRole('button', { name: 'Retry same change', exact: true })
    await expect(retry).toBeEnabled()
    await expect(list.getByRole('heading', { name: RETAINED_TITLE, exact: true })).toBeVisible()
    expect(calls).toEqual(dismissReadbackCalls)
    await page.screenshot({ path: testInfo.outputPath('verified-watch-recovery.png'), animations: 'disabled' })
    await expect(dismiss).toBeEnabled()
    await dismiss.press('Enter')
    await expect(section.getByText('Pending watchlist change dismissed.', { exact: true })).toBeVisible()
    await expect(retry).toHaveCount(0)
    await expect(dismiss).toHaveCount(0)
    await expect(choice).toBeEnabled()
    await expect(choice).toHaveValue('')
    await expect(choice).toBeFocused()
    await expect(watch).toBeDisabled()
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list.getByRole('heading', { name: RETAINED_TITLE, exact: true })).toBeVisible()
    expect(calls).toEqual(dismissReadbackCalls)
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('dismissed-watch-focus.png'), animations: 'disabled' })

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(choice).toHaveValue(FIRST_CARD)
    expect(calls).toEqual(dismissReadbackCalls)
    await watch.press('Enter')
    await expect(list.getByRole('heading', { name: ALTERNATE_TITLE, exact: true })).toBeVisible()
    await expect(list.getByRole('heading', { name: RETAINED_TITLE, exact: true })).toBeVisible()
    await expect(list.getByRole('heading', { name: TITLE, exact: true })).toHaveCount(0)
    expect(calls).toEqual([...dismissReadbackCalls, `PUT ${alternateTarget}`])
    expect(unexpected).toEqual([])
  })
}

test('Market requires a fresh verification before dismissing a failed guarded removal', async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const refreshStarted = Promise.withResolvers()
  const releaseRefresh = Promise.withResolvers()
  let reads = 0
  const { section, summary, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
    if (request.method() === 'GET') {
      reads += 1
      if (reads === 3) {
        refreshStarted.resolve()
        await releaseRefresh.promise
        await route.fulfill({ status: 503, json: { detail: 'Synthetic temporary read failure' } })
      } else {
        await route.fulfill({ json: [membership] })
      }
      return
    }
    expect(request.method()).toBe('DELETE')
    expect(new URL(request.url()).search).toBe(`?expected_watch_id=${WATCH_ID}`)
    expect(request.postData()).toBeNull()
    await route.abort('failed')
  }, { savedCards: [card, alternateCard] })
  const list = section.getByRole('list', { name: 'Watched jobs', exact: true })
  const stop = list.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })
  const check = section.getByRole('button', { name: 'Check watchlist', exact: true })
  const retry = section.getByRole('button', { name: 'Retry same change', exact: true })
  const dismiss = section.getByRole('button', { name: 'Dismiss change', exact: true })
  const choice = section.getByRole('combobox', { name: 'Saved job to watch', exact: true })
  const initialCalls = [`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`]

  await stop.press('Enter')
  await expect(check).toBeEnabled()
  await expect(dismiss).toHaveCount(0)
  expect(calls).toEqual(initialCalls)
  await check.press('Enter')
  await expect(dismiss).toBeEnabled()
  await expect(retry).toBeEnabled()
  expect(calls).toEqual([...initialCalls, `GET ${WATCHLIST}`])

  try {
    await summary.press('Enter')
    await expect(list).toBeHidden()
    await summary.press('Enter')
    await refreshStarted.promise
    await expect(section.getByText('Loading watchlist…', { exact: true })).toBeVisible()
    await expect(dismiss).toHaveCount(0)
    await expect(retry).toHaveCount(0)
  } finally {
    releaseRefresh.resolve()
  }
  await expect(section.getByText('Could not load watchlist.', { exact: true })).toBeVisible()
  await expect(dismiss).toHaveCount(0)
  await expect(retry).toHaveCount(0)
  await expect(stop).toBeDisabled()
  expect(calls).toEqual([...initialCalls, `GET ${WATCHLIST}`, `GET ${WATCHLIST}`])

  await check.press('Enter')
  await expect(dismiss).toBeEnabled()
  await dismiss.press('Enter')
  await expect(section.getByText('Pending watchlist change dismissed.', { exact: true })).toBeVisible()
  await expect(dismiss).toHaveCount(0)
  await expect(retry).toHaveCount(0)
  await expect(stop).toBeEnabled()
  await expect(stop).toBeFocused()
  await expect(choice).toBeEnabled()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list.getByRole('heading', { name: TITLE, exact: true })).toBeVisible()
  expect(calls).toEqual([...initialCalls, `GET ${WATCHLIST}`, `GET ${WATCHLIST}`, `GET ${WATCHLIST}`])
  expect(unexpected).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('dismissed-guarded-removal.png'), animations: 'disabled' })
})

const unavailableCheck = { ...membership, last_source_check: null, last_source_check_unavailable: true }
const checkedWatch = {
  ...alternateWatch,
  last_source_check: { result: newerCheck.result, recorded_at: newerCheck.recorded_at },
}
const uncheckedWatch = { ...retainedWatch, last_source_check: null }

for (const width of [1440, 900]) {
  test(`Market keeps watch actions available when one source check is unavailable at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const { section, summary, calls, unexpected } = await openWatchlist({ page, context, baseURL }, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: [unavailableCheck, checkedWatch, uncheckedWatch] })
        return
      }
      expect(request.method()).toBe('DELETE')
      expect(new URL(request.url()).search).toBe(`?expected_watch_id=${WATCH_ID}`)
      expect(request.postData()).toBeNull()
      await route.fulfill({ status: 204 })
    }, { savedCards: [card, alternateCard, retainedCard] })

    const rows = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
    const affected = rows.filter({ has: page.getByRole('heading', { name: TITLE, exact: true }) })
    const healthy = rows.filter({ has: page.getByRole('heading', { name: ALTERNATE_TITLE, exact: true }) })
    const unchecked = rows.filter({ has: page.getByRole('heading', { name: RETAINED_TITLE, exact: true }) })
    const unavailable = section.getByText('Source check unavailable.', { exact: true })
    await expect(rows).toHaveCount(3)
    await expect(affected.getByText('Source check unavailable.', { exact: true })).toBeVisible()
    await expect(unavailable).toHaveCount(1)
    await expect(affected.getByText('No source check recorded.', { exact: true })).toHaveCount(0)
    await expect(healthy.getByText('No longer listed', { exact: true })).toBeVisible()
    await expect(healthy.locator(`time[datetime="${newerCheck.recorded_at}"]`)).toBeVisible()
    await expect(unchecked.getByText('No source check recorded.', { exact: true })).toBeVisible()
    await expect(affected.locator(`time[datetime="${WATCHED_AT}"]`)).toBeVisible()
    await expect(affected.locator('time')).toHaveCount(1)

    const view = affected.getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
    const stop = affected.getByRole('button', { name: `Stop watching: ${TITLE}`, exact: true })
    await expect(view).toBeEnabled()
    await expect(stop).toBeEnabled()
    await view.press('Tab')
    await expect(stop).toBeFocused()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`])
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('unavailable-source-check-row.png'), animations: 'disabled' })

    await page.keyboard.press('Enter')
    await expect(affected).toHaveCount(0)
    await expect(unavailable).toHaveCount(0)
    await expect(healthy.getByText('No longer listed', { exact: true })).toBeVisible()
    await expect(unchecked.getByText('No source check recorded.', { exact: true })).toBeVisible()
    await expect(rows).toHaveCount(2)
    await expect(summary).toBeFocused()
    expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `DELETE ${stopTarget(WATCH_ID)}`])
    expect(unexpected).toEqual([])
  })
}

test('Market replaces the unavailable watchlist source check after an explicit fresh source read', async ({ page, context, baseURL }) => {
  let watchReads = 0
  const { section, summary, calls, unexpected } = await openWatchlist({ page, context, baseURL }, (route, request) => {
    expect(request.method()).toBe('GET')
    watchReads += 1
    return watchReads === 1 ? previouslyWatched(route) : route.fulfill({ json: [unavailableCheck] })
  }, {
    ...watchedCardOptions,
    onSourceChecks: route => route.fulfill({ json: [newerCheck, earlierCheck] }),
  })
  const row = section.getByRole('list', { name: 'Watched jobs', exact: true }).getByRole('listitem')
  const unavailable = row.getByText('Source check unavailable.', { exact: true })
  await expect(row.getByText('Still listed', { exact: true })).toBeVisible()

  await summary.press('Enter')
  await expect(row).toBeHidden()
  await summary.press('Enter')
  await expect(unavailable).toBeVisible()
  await expect(row.getByText('Still listed', { exact: true })).toHaveCount(0)
  await expect(row.locator(`time[datetime="${earlierCheck.recorded_at}"]`)).toHaveCount(0)
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${WATCHLIST}`])

  const opener = row.getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
  const dialog = await openSourceChecks(page, opener)
  await expect(dialog.getByRole('list', { name: 'Recorded source checks', exact: true }).getByRole('listitem').first())
    .toContainText('No longer listed')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(unavailable).toHaveCount(0)
  await expect(row.getByText('No longer listed', { exact: true })).toBeVisible()
  await expect(row.locator(`time[datetime="${newerCheck.recorded_at}"]`)).toBeVisible()
  expect(calls).toEqual([`GET ${CARDS}`, `GET ${WATCHLIST}`, `GET ${WATCHLIST}`, `GET ${CARD}`, `GET ${SOURCE_RECEIPT}`, `GET ${SOURCE_CHECKS}`])
  expect(unexpected).toEqual([])
})
