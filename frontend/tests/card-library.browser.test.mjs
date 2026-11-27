import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const LIST_PATH = '/posting/card'
const A_KEY = 'a0000000-0000-4000-8000-000000000051'
const B_KEY = 'a0000000-0000-4000-8000-000000000052'
const A_IMPORT = 'a0000000-0000-4000-8000-000000000053'
const B_IMPORT = 'a0000000-0000-4000-8000-000000000054'
const A_CURRENT = 'Korrigiertes Praktikum in der barrierefreien Fahrgastinformation und Verkehrsplanung (DEMO)'
const B_CURRENT = 'Werkstudent (m/w/d) für Marktkommunikation und Netzentgeltabrechnung in der Energiewirtschaft (DEMO)'
const A_ORIGINAL = 'Ursprüngliches Praktikum für Fahrgastzählungen und regionale Nahverkehrsplanung (DEMO)'
const A_PATH = `${LIST_PATH}/${A_KEY}`
const ORIGINAL_PATH = `${A_PATH}/original`

function savedCard(cardKey, importKey, title) {
  const { details } = postingFixture(importKey, title, { kind: 'text', text: title, source_url: null })
  return {
    card_key: cardKey, import_key: importKey, schema_version: 1, created_at: '2026-11-27T10:00:00Z',
    posting: details, posting_alias: null, user_notes: null, tags: [],
  }
}

async function openCardLibrary({ page, context, baseURL }, routes) {
  const calls = []
  const unexpected = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const key = `${request.method()} ${url.pathname}`
    if (url.origin === API && Object.hasOwn(routes, key)) {
      calls.push(key)
      await routes[key](route, request)
      return
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
  await navigation.getByRole('button', { name: 'Card library', exact: true }).click()
  return { calls, unexpected }
}

for (const { outcome, status } of [{ outcome: 'success', status: 200 }, { outcome: 'failure', status: 503 }]) {
  test(`Card library ignores late original Card ${outcome} after opening a current Card`, async ({ page, context, baseURL }) => {
    const gate = Promise.withResolvers()
    const currentA = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const currentB = savedCard(B_KEY, B_IMPORT, B_CURRENT)
    const originalA = savedCard(A_KEY, A_IMPORT, A_ORIGINAL)
    let originalReads = 0

    const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
      [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [currentA, currentB] }),
      [`GET ${ORIGINAL_PATH}`]: async (route) => {
        originalReads += 1
        if (originalReads === 1) {
          await gate.promise
          if (status !== 200) {
            await route.fulfill({ status, json: { detail: 'Synthetic original read failed' } })
            return
          }
        }
        await route.fulfill({ json: originalA })
      },
    })

    const showOriginalA = page.getByRole('button', { name: `Show original: ${A_CURRENT}`, exact: true })
    const openCurrentB = page.getByRole('button', { name: `View details: ${B_CURRENT} at Unknown company`, exact: true })
    const dialog = page.getByRole('dialog')
    const edit = dialog.getByRole('button', { name: 'Edit card', exact: true })
    const originalError = page.getByRole('alert', { includeHidden: true })

    let lateResponse
    try {
      await showOriginalA.click()
      await expect.poll(() => originalReads).toBe(1)
      await openCurrentB.click()
      await expect(dialog.getByRole('heading', { name: B_CURRENT, exact: true })).toBeVisible()
      await expect(edit).toBeEnabled()
      lateResponse = page.waitForResponse(`${API}${ORIGINAL_PATH}`)
    } finally {
      gate.resolve()
    }

    const response = await lateResponse
    expect(response.status()).toBe(status)
    expect(await response.finished()).toBeNull()
    // Let the response handler and React render before checking that neither replaced B nor raised an error.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(dialog.getByRole('heading', { name: B_CURRENT, exact: true })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: A_ORIGINAL, exact: true })).toHaveCount(0)
    await expect(edit).toBeEnabled()
    await expect(originalError).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await showOriginalA.click()
    await expect(dialog.getByRole('heading', { name: A_ORIGINAL, exact: true })).toBeVisible()
    await expect(edit).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toHaveCount(0)
    expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${ORIGINAL_PATH}`, `GET ${ORIGINAL_PATH}`])
    expect(unexpected).toEqual([])
  })
}

for (const { originalKey, status, label } of [
  { originalKey: A_KEY, status: 200, label: 'ignores the deleted Card’s late original' },
  { originalKey: A_KEY, status: 503, label: 'ignores the deleted Card’s late original error' },
  { originalKey: B_KEY, status: 200, label: 'keeps the other Card’s pending original' },
]) {
  test(`Card library ${label} after a confirmed delete`, async ({ page, context, baseURL }) => {
    const gate = Promise.withResolvers()
    const cardA = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const cardB = savedCard(B_KEY, B_IMPORT, B_CURRENT)
    const originalPath = `${LIST_PATH}/${originalKey}/original`
    const isOriginalA = originalKey === A_KEY
    let originalReads = 0
    const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
      [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [cardA, cardB] }),
      [`GET ${originalPath}`]: async (route) => {
        originalReads += 1
        await gate.promise
        const original = isOriginalA ? savedCard(A_KEY, A_IMPORT, A_ORIGINAL) : cardB
        await route.fulfill({ status, json: status === 200 ? original : { detail: 'Synthetic read failure' } })
      },
      [`DELETE ${A_PATH}`]: route => route.fulfill({ status: 204 }),
    })

    const showOriginal = page.getByRole('button', { name: `Show original: ${isOriginalA ? A_CURRENT : B_CURRENT}`, exact: true })
    const deleteA = page.getByRole('button', { name: `Delete: ${A_CURRENT}`, exact: true })
    let lateResponse
    try {
      await showOriginal.press('Enter')
      await expect.poll(() => originalReads).toBe(1)
      page.once('dialog', native => native.accept())
      await deleteA.press('Enter')
      await expect(page.getByRole('status')).toHaveText('1 saved job')
      lateResponse = page.waitForResponse(`${API}${originalPath}`)
    } finally {
      gate.resolve()
    }

    const response = await lateResponse
    expect(response.status()).toBe(status)
    expect(await response.finished()).toBeNull()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const dialog = page.getByRole('dialog')
    if (isOriginalA) {
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('button', { name: `Show original: ${A_CURRENT}`, exact: true })).toHaveCount(0)
    } else {
      await expect(dialog.getByRole('heading', { name: B_CURRENT, exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    }
    expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${originalPath}`, `DELETE ${A_PATH}`])
    expect(unexpected).toEqual([])
  })
}

const DRAFT_TITLE = 'Korrigiertes Praktikum für Fahrgastinformation und barrierefreie Verkehrsplanung im Rheinland (DEMO)'
const SERVER_NOTE = 'Serverbestätigte Notiz zur Einarbeitung und Abstimmung mit der Netzleitstelle (DEMO)'

async function submitCardDraft({ page, context, baseURL }, outcome) {
  let current = savedCard(A_KEY, A_IMPORT, A_CURRENT)
  const original = savedCard(A_KEY, A_IMPORT, A_ORIGINAL)
  const saved = savedCard(A_KEY, A_IMPORT, DRAFT_TITLE)
  saved.posting.identity.position_title.origin = 'user_defined'
  // A value absent from the draft distinguishes adopting the read from rebuilding it locally.
  saved.user_notes = SERVER_NOTE
  const patches = []
  await page.clock.install()
  const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
    [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [current] }),
    [`GET ${A_PATH}`]: route => route.fulfill({ json: current }),
    [`GET ${ORIGINAL_PATH}`]: route => route.fulfill({ json: original }),
    [`PATCH ${A_PATH}`]: async (route, request) => {
      patches.push(request.postDataJSON())
      if (patches.length === 1) {
        if (outcome === 'rejected') {
          await route.fulfill({ status: 422, json: { detail: 'Synthetic rejection' } })
          return
        }
        if (outcome === 'committed') current = saved
        await route.abort('failed')
        return
      }
      current = saved
      await route.fulfill({ json: saved })
    },
  })
  await page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Edit card', exact: true }).click()
  const title = dialog.getByRole('textbox', { name: 'Position title', exact: true })
  const save = dialog.getByRole('button', { name: 'Save', exact: true })
  await title.fill(DRAFT_TITLE)
  await save.click()
  return { dialog, title, save, calls, patches, unexpected }
}

for (const outcome of ['committed', 'uncommitted']) {
  test(`Card library recovers ${outcome === 'committed' ? 'a committed' : 'an uncommitted'} save after its response is lost`, async ({ page, context, baseURL }) => {
    const { dialog, title, save, calls, patches, unexpected } = await submitCardDraft({ page, context, baseURL }, outcome)
    const read = dialog.getByRole('button', { name: 'Read saved Card', exact: true })
    const useSaved = dialog.getByRole('button', { name: 'Use saved version', exact: true })

    await expect(read).toBeVisible()
    await expect(title).toHaveValue(DRAFT_TITLE)
    await expect(save).toBeDisabled()
    await expect(useSaved).toHaveCount(0)
    await page.clock.fastForward(10_000)
    expect(calls).toEqual([`GET ${LIST_PATH}`, `PATCH ${A_PATH}`])
    expect(patches).toHaveLength(1)
    expect(patches[0].position_title).toBe(DRAFT_TITLE)

    await read.focus()
    await page.keyboard.press('Enter')
    if (outcome === 'committed') {
      await expect(useSaved).toBeVisible()
      await expect(title).toHaveValue(DRAFT_TITLE)
      await expect(save).toBeDisabled()
      expect(calls).toEqual([`GET ${LIST_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`])
      await useSaved.focus()
      await page.keyboard.press('Enter')
    } else {
      await expect(save).toBeEnabled()
      await expect(save).toBeFocused()
      await expect(title).toHaveValue(DRAFT_TITLE)
      await page.clock.fastForward(10_000)
      expect(calls).toEqual([`GET ${LIST_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`])
      await page.keyboard.press('Enter')
      await expect.poll(() => patches).toEqual([patches[0], patches[0]])
    }
    await expect(dialog.getByRole('heading', { name: DRAFT_TITLE, exact: true })).toBeVisible()
    await expect(dialog.getByText(SERVER_NOTE, { exact: true })).toBeVisible()
    await expect(title).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: `Show original: ${DRAFT_TITLE}`, exact: true }).click()
    await expect(dialog.getByRole('heading', { name: A_ORIGINAL, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    const expectedCalls = [`GET ${LIST_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`]
    if (outcome === 'uncommitted') expectedCalls.push(`PATCH ${A_PATH}`)
    expect(calls).toEqual([...expectedCalls, `GET ${ORIGINAL_PATH}`])
    expect(unexpected).toEqual([])
  })
}

test('Discarding recovery keeps the verified Card for the next edit', async ({ page, context, baseURL }) => {
  const { dialog, calls, patches, unexpected } = await submitCardDraft({ page, context, baseURL }, 'committed')
  await dialog.getByRole('button', { name: 'Read saved Card', exact: true }).press('Enter')
  await expect(dialog.getByRole('button', { name: 'Use saved version', exact: true })).toBeVisible()
  // Dismissal must update the owner even before the browser delivers its close event.
  await dialog.evaluate(element => {
    element.addEventListener('close', event => event.stopImmediatePropagation(), { capture: true, once: true })
  })
  await dialog.getByRole('button', { name: 'Discard draft and close', exact: true }).press('Enter')
  await expect(dialog).toHaveCount(0)
  expect(calls).toEqual([`GET ${LIST_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`])

  await page.getByRole('button', { name: `View details: ${DRAFT_TITLE} at Unknown company`, exact: true }).press('Enter')
  await expect(dialog.getByRole('heading', { name: DRAFT_TITLE, exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Edit card', exact: true }).press('Enter')
  const note = 'Rückfrage für das Vorstellungsgespräch (DEMO)'
  await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill(note)
  await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter')
  await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toBeVisible()
  expect(patches).toHaveLength(2)
  expect(patches[1]).toMatchObject({ position_title: DRAFT_TITLE, user_notes: note })
  expect(calls).toEqual([`GET ${LIST_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`])
  expect(unexpected).toEqual([])
})

test('Card library keeps a rejected Card draft available for correction', async ({ page, context, baseURL }) => {
  const { dialog, title, save, calls, unexpected } = await submitCardDraft({ page, context, baseURL }, 'rejected')
  await expect(dialog.getByRole('alert')).toContainText('Some card fields are invalid.')
  await expect(dialog.getByRole('button', { name: 'Read saved Card', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Dismiss save error', exact: true }).click()
  await expect(title).toHaveValue(DRAFT_TITLE)
  await title.fill(`${DRAFT_TITLE} – präzisiert`)
  await expect(save).toBeEnabled()
  expect(calls).toEqual([`GET ${LIST_PATH}`, `PATCH ${A_PATH}`])
  expect(unexpected).toEqual([])
})
