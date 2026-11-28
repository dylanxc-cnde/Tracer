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
const B_PATH = `${LIST_PATH}/${B_KEY}`
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

for (const { width, action, regionName, formName, field, cancel } of [
  { width: 1440, action: 'Plan follow-up', regionName: 'Upcoming', formName: 'Add event', field: 'Event title', cancel: 'Cancel editing' },
  { width: 900, action: 'Record application', regionName: 'Your search', formName: 'Record application', field: 'Application date', cancel: 'Cancel' },
]) {
  test(`Card library opens a linked Home draft through ${action} at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.clock.setFixedTime(new Date('2026-11-27T12:00:00Z'))
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const currentTitle = 'Aktualisiertes Praktikum für barrierefreie Verkehrsplanung im regionalen Schienenverkehr (DEMO)'
    const editedTitle = `${currentTitle} – überarbeitet`
    const savedTitle = `${editedTitle} und bestätigt`
    const savedCompany = 'Verkehrsforschungsgesellschaft für nachhaltige Mobilität im Rheinland (DEMO)'
    const listed = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const current = savedCard(A_KEY, A_IMPORT, currentTitle)
    const original = savedCard(A_KEY, A_IMPORT, A_ORIGINAL)
    const updated = savedCard(A_KEY, A_IMPORT, savedTitle)
    updated.posting.identity.company_name = { value: savedCompany, origin: 'source' }
    const patches = []
    const diagnostics = []
    page.on('pageerror', error => diagnostics.push(error.message))
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()) })
    const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
      [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [listed] }),
      [`GET ${A_PATH}`]: route => route.fulfill({ json: current }),
      [`GET ${ORIGINAL_PATH}`]: route => route.fulfill({ json: original }),
      [`PATCH ${A_PATH}`]: (route, request) => {
        patches.push(request.postDataJSON())
        return route.fulfill({ json: updated })
      },
      'GET /settings': route => route.fulfill({ json: { user: { display_name: 'Demo Student' }, ai: { providers: [], tasks: [] } } }),
      'GET /home/overview': route => route.fulfill({ json: {
        today: { tasks: [], completed_count: 0, completed_tasks: [], events: [] },
        upcoming: { tasks: [], events: [] }, your_search: { active: 0, awaiting_reply: 0, interviews: 0 },
        applications: [], recent_jobs: [], recent_activity: [],
        ai_usage: { status: 'not_recorded', tokens: null, estimated_cost_usd: null, providers: [] },
      } }),
      'GET /home/activity': route => route.fulfill({ json: { events: [], recording_started_at: null } }),
    })

    const dialog = page.getByRole('dialog')
    const followUp = dialog.getByRole('button', { name: 'Plan follow-up', exact: true })
    const recordApplication = dialog.getByRole('button', { name: 'Record application', exact: true })
    await page.getByRole('button', { name: `Show original: ${A_CURRENT}`, exact: true }).press('Enter')
    await expect(dialog.getByRole('heading', { name: A_ORIGINAL, exact: true })).toBeVisible()
    await expect(followUp).toHaveCount(0)
    await expect(recordApplication).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true }).press('Enter')
    await expect(dialog.getByRole('heading', { name: currentTitle, exact: true })).toBeVisible()
    await expect(followUp).toBeVisible()
    await expect(recordApplication).toBeVisible()
    await dialog.getByRole('button', { name: 'Edit card', exact: true }).press('Enter')
    await expect(followUp).toHaveCount(0)
    await expect(recordApplication).toHaveCount(0)
    await dialog.getByRole('textbox', { name: 'Position title', exact: true }).fill(editedTitle)
    await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter')
    await expect(dialog.getByRole('heading', { name: savedTitle, exact: true })).toBeVisible()
    await expect(followUp).toBeVisible()
    await expect(recordApplication).toBeVisible()
    expect(patches).toEqual([expect.objectContaining({ position_title: editedTitle })])
    await page.screenshot({ path: testInfo.outputPath('current-card-actions.png'), animations: 'disabled' })

    await dialog.getByRole('button', { name: action, exact: true }).press('Enter')
    await expect(dialog).toHaveCount(0)
    const section = page.getByRole('region', { name: regionName, exact: true })
    const draft = section.getByRole('form', { name: formName, exact: true })
    await expect(draft.getByLabel(field, { exact: true })).toBeFocused()
    const selectedJob = draft.getByText(/Selected job:/)
    await expect(selectedJob).toContainText(savedTitle)
    await expect(selectedJob).toContainText(savedCompany)
    if (action === 'Plan follow-up') {
      await expect(draft.getByLabel('Event title', { exact: true })).toHaveValue('Follow up')
      await expect(draft.getByRole('combobox', { name: 'Event type', exact: true })).toHaveValue('other')
      await expect(draft.getByLabel('Starts (local time)', { exact: true })).toHaveValue('')
    } else {
      await expect(draft.getByLabel('Application date', { exact: true })).toHaveValue('')
      await expect(draft.getByRole('combobox', { name: 'Job', exact: true })).toHaveCount(0)
    }
    await draft.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('linked-home-draft.png'), animations: 'disabled' })
    await draft.getByRole('button', { name: cancel, exact: true }).press('Enter')
    await expect(draft).toHaveCount(0)
    await expect(section.getByRole('heading', { name: regionName, exact: true })).toBeFocused()
    expect(calls.filter(call => call.includes('/posting/'))).toEqual([
      `GET ${LIST_PATH}`, `GET ${ORIGINAL_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`,
    ])
    expect(calls.filter(call => !call.startsWith('GET '))).toEqual([`PATCH ${A_PATH}`])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([])
  })
}

test('Card library keeps Home handoffs unavailable after a Card save returns 404', async ({ page, context, baseURL }) => {
  const card = savedCard(A_KEY, A_IMPORT, A_CURRENT)
  const survivor = savedCard(B_KEY, B_IMPORT, B_CURRENT)
  const draftTitle = `${A_CURRENT} – Entwurf`
  const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
    [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [card, survivor] }),
    [`GET ${A_PATH}`]: route => route.fulfill({ json: card }),
    [`PATCH ${A_PATH}`]: route => route.fulfill({ status: 404, json: { detail: 'Posting card not found' } }),
  })

  const opener = page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true })
  const dialog = page.getByRole('dialog')
  const followUp = dialog.getByRole('button', { name: 'Plan follow-up', exact: true })
  const recordApplication = dialog.getByRole('button', { name: 'Record application', exact: true })
  await opener.press('Enter')
  await expect(followUp).toBeVisible()
  await expect(recordApplication).toBeVisible()
  await dialog.getByRole('button', { name: 'Edit card', exact: true }).press('Enter')
  const title = dialog.getByRole('textbox', { name: 'Position title', exact: true })
  await title.fill(draftTitle)
  await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter')
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: 'Dismiss save error', exact: true }).press('Enter')
  await expect(title).toHaveValue(draftTitle)
  await expect(title).toBeEditable()
  await dialog.getByRole('button', { name: 'Cancel editing', exact: true }).press('Enter')
  await expect(dialog).toBeVisible()
  await expect(title).toHaveCount(0)
  await expect(followUp).toHaveCount(0)
  await expect(recordApplication).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Saved jobs', exact: true })).toBeFocused()
  await expect(opener).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Show original: ${A_CURRENT}`, exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: `View details: ${B_CURRENT} at Unknown company`, exact: true })).toBeVisible()
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`])
  expect(unexpected).toEqual([])
})

for (const width of [1440, 900]) {
  test(`Card library preserves the freshly saved title in a notes-only edit at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const freshTitle = 'Aktualisiertes Praktikum für barrierefreie Umsteigeinformationen im regionalen Schienenverkehr (DEMO)'
    const note = 'Bewerbungsunterlagen für das aktualisierte Praktikum zusammenstellen. (DEMO)'
    const staleCard = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const freshCard = savedCard(A_KEY, A_IMPORT, freshTitle)
    const patches = []
    const browserErrors = []
    page.on('pageerror', error => browserErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
      [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [staleCard] }),
      [`GET ${A_PATH}`]: route => route.fulfill({ json: freshCard }),
      [`PATCH ${A_PATH}`]: (route, request) => {
        const patch = request.postDataJSON()
        patches.push(patch)
        const saved = savedCard(A_KEY, A_IMPORT, patch.position_title)
        saved.user_notes = patch.user_notes
        return route.fulfill({ json: saved })
      },
    })

    await page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true }).press('Enter')
    const dialog = page.getByRole('dialog')
    const edit = dialog.getByRole('button', { name: 'Edit card', exact: true })
    await edit.press('Enter')
    const editorTitle = await dialog.getByRole('textbox', { name: 'Position title', exact: true }).inputValue()
    await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill(note)
    await page.screenshot({ path: testInfo.outputPath('fresh-title-notes-editor.png') })
    await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter')
    await expect(edit).toBeVisible()
    expect(patches).toEqual([expect.objectContaining({ position_title: freshTitle, user_notes: note })])
    expect(editorTitle).toBe(freshTitle)
    await expect(dialog.getByRole('heading', { name: freshTitle, exact: true })).toBeVisible()
    await expect(dialog.getByText(note, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: `View details: ${freshTitle} at Unknown company`, exact: true })).toBeVisible()
    expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`])
    expect(unexpected).toEqual([])
    expect(browserErrors).toEqual([])
  })
}

test('Card library opens only the latest requested current Card', async ({ page, context, baseURL }) => {
  const gate = Promise.withResolvers()
  const lateResponseSent = Promise.withResolvers()
  const cardA = savedCard(A_KEY, A_IMPORT, A_CURRENT)
  const cardB = savedCard(B_KEY, B_IMPORT, B_CURRENT)
  const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
    [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [cardA, cardB] }),
    [`GET ${A_PATH}`]: async (route) => {
      try {
        await gate.promise
        await route.fulfill({ json: cardA })
      } finally {
        lateResponseSent.resolve()
      }
    },
    [`GET ${B_PATH}`]: route => route.fulfill({ json: cardB }),
  })

  const openA = page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true })
  const openB = page.getByRole('button', { name: `View details: ${B_CURRENT} at Unknown company`, exact: true })
  const dialog = page.getByRole('dialog')
  try {
    await openA.press('Enter')
    await expect(page.getByText('Opening saved card…', { exact: true })).toBeVisible()
    await expect(openA).toBeFocused()
    await expect(openA).toBeDisabled()
    await expect(dialog).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect.poll(() => calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`])
    await openB.press('Enter')
    await expect(dialog.getByRole('heading', { name: B_CURRENT, exact: true })).toBeVisible()
  } finally {
    gate.resolve()
  }
  await lateResponseSent.promise
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(dialog.getByRole('heading', { name: B_CURRENT, exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: A_CURRENT, exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert', { includeHidden: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(openB).toBeFocused()
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `GET ${B_PATH}`])
  expect(unexpected).toEqual([])
})

test('Card library retries a transient current read failure without opening the cached row', async ({ page, context, baseURL }, testInfo) => {
  const card = savedCard(A_KEY, A_IMPORT, A_CURRENT)
  const freshTitle = 'Überarbeitetes Praktikum für Fahrgastinformation und regionale Nahverkehrsplanung (DEMO)'
  const freshCard = savedCard(A_KEY, A_IMPORT, freshTitle)
  let reads = 0
  const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
    [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [card] }),
    [`GET ${A_PATH}`]: route => ++reads === 1
      ? route.fulfill({ status: 503, json: { detail: 'Synthetic unavailable Card detail' } })
      : route.fulfill({ json: freshCard }),
  })

  const open = page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true })
  const dialog = page.getByRole('dialog')
  await open.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Could not open the saved card. Try again.')
  await expect(open).toBeFocused()
  await expect(dialog).toHaveCount(0)
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`])
  await page.screenshot({ path: testInfo.outputPath('current-read-failed.png') })
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { name: freshTitle, exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert', { includeHidden: true })).toHaveCount(0)
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `GET ${A_PATH}`])
  expect(unexpected).toEqual([])
})

test('Card library removes a missing current Card even if a stale refresh returns later', async ({ page, context, baseURL }) => {
  const cardA = savedCard(A_KEY, A_IMPORT, A_CURRENT)
  const cardB = savedCard(B_KEY, B_IMPORT, B_CURRENT)
  const refreshGate = Promise.withResolvers()
  let listReads = 0
  const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
    [`GET ${LIST_PATH}`]: async (route) => {
      listReads += 1
      if (listReads === 2) await refreshGate.promise
      await route.fulfill({ json: [cardA, cardB] })
    },
    [`GET ${A_PATH}`]: route => route.fulfill({ status: 404, json: { detail: 'Synthetic missing Card' } }),
  })

  const openA = page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true })
  const openB = page.getByRole('button', { name: `View details: ${B_CURRENT} at Unknown company`, exact: true })
  try {
    await expect(openA).toBeVisible()
    await page.getByRole('button', { name: 'Refresh card library', exact: true }).press('Enter')
    await expect.poll(() => listReads).toBe(2)
    await openA.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('This card is no longer available.')
    await expect(openA).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Saved jobs', exact: true })).toBeFocused()
  } finally {
    refreshGate.resolve()
  }
  await expect(page.getByRole('status')).toHaveText('1 saved job')
  await expect(openA).toHaveCount(0)
  await expect(openB).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Saved jobs', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(openB).toBeFocused()
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${LIST_PATH}`, `GET ${A_PATH}`])
  expect(unexpected).toEqual([])
})

for (const { outcome, status } of [{ outcome: 'success', status: 200 }, { outcome: 'failure', status: 503 }]) {
  test(`Card library ignores late original Card ${outcome} after opening a current Card`, async ({ page, context, baseURL }) => {
    const gate = Promise.withResolvers()
    const currentA = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const currentB = savedCard(B_KEY, B_IMPORT, B_CURRENT)
    const originalA = savedCard(A_KEY, A_IMPORT, A_ORIGINAL)
    let originalReads = 0

    const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
      [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [currentA, currentB] }),
      [`GET ${B_PATH}`]: route => route.fulfill({ json: currentB }),
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
    expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${ORIGINAL_PATH}`, `GET ${B_PATH}`, `GET ${ORIGINAL_PATH}`])
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
    expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`])
    expect(patches).toHaveLength(1)
    expect(patches[0].position_title).toBe(DRAFT_TITLE)

    await read.focus()
    await page.keyboard.press('Enter')
    if (outcome === 'committed') {
      await expect(useSaved).toBeVisible()
      await expect(title).toHaveValue(DRAFT_TITLE)
      await expect(save).toBeDisabled()
      expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`])
      await useSaved.focus()
      await page.keyboard.press('Enter')
    } else {
      await expect(save).toBeEnabled()
      await expect(save).toBeFocused()
      await expect(title).toHaveValue(DRAFT_TITLE)
      await page.clock.fastForward(10_000)
      expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`])
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
    const expectedCalls = [`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`]
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
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`])

  await page.getByRole('button', { name: `View details: ${DRAFT_TITLE} at Unknown company`, exact: true }).press('Enter')
  await expect(dialog.getByRole('heading', { name: DRAFT_TITLE, exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Edit card', exact: true }).press('Enter')
  const note = 'Rückfrage für das Vorstellungsgespräch (DEMO)'
  await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill(note)
  await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter')
  await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toBeVisible()
  expect(patches).toHaveLength(2)
  expect(patches[1]).toMatchObject({ position_title: DRAFT_TITLE, user_notes: note })
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`, `GET ${A_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`])
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
  expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`, `PATCH ${A_PATH}`])
  expect(unexpected).toEqual([])
})

const LONG_DOMAIN = 'Barrierefreie Fahrgastinformation und regionale Verkehrsplanung für den öffentlichen Personennahverkehr mit digitaler Linienkommunikation (DEMO)'
const COMPOUND_DOMAIN = 'Schienenpersonennahverkehrsinfrastrukturmodernisierungsbedarfsermittlungskoordination'
  + 'verkehrsverbundübergreifenderfahrgastinformationsschnittstellenstandardisierung'
const SHORT_DOMAIN = 'Mobilität'

for (const width of [1440, 900]) {
  test(`Card library wraps long role domains without clipping at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const browserErrors = []
    page.on('pageerror', error => browserErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    const card = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const domains = [LONG_DOMAIN, COMPOUND_DOMAIN, SHORT_DOMAIN]
    card.posting.role_content.domains = domains.map(value => ({ value, origin: 'source' }))
    const { calls, unexpected } = await openCardLibrary({ page, context, baseURL }, {
      [`GET ${LIST_PATH}`]: route => route.fulfill({ json: [card] }),
      [`GET ${A_PATH}`]: route => route.fulfill({ json: card }),
    })
    await page.getByRole('button', { name: `View details: ${A_CURRENT} at Unknown company`, exact: true }).press('Enter')
    const dialog = page.getByRole('dialog')
    const roleDomains = dialog.locator('.posting-card-role-domains')
    for (const domain of domains) {
      await expect(roleDomains.getByText(domain, { exact: true })).toBeVisible()
    }
    await page.evaluate(() => document.fonts.ready)
    await roleDomains.scrollIntoViewIfNeeded()

    const layout = await roleDomains.evaluate(root => {
      const dialog = root.closest('dialog')
      const field = root.closest('.posting-card-details__field').getBoundingClientRect()
      return {
        dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
        labels: [...root.querySelectorAll('.posting-card-role-domains__value')].map(label => {
          const pill = label.closest('.posting-card-role-domains__pill').getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(label)
          const lines = [...range.getClientRects()]
          const overflow = Math.max(0, pill.right - field.right, field.left - pill.left,
            ...lines.map(line => Math.max(line.right - pill.right, pill.left - line.left)))
          return { overflow, lineCount: lines.length }
        }),
      }
    })
    await page.screenshot({ path: testInfo.outputPath('role-domains-read-view.png') })
    expect(layout.dialogOverflow, JSON.stringify(layout)).toBeLessThanOrEqual(1)
    expect(Math.max(...layout.labels.map(label => label.overflow))).toBeLessThanOrEqual(1)
    expect(layout.labels.map(label => label.lineCount > 1)).toEqual([true, true, false])

    await dialog.getByRole('button', { name: 'Edit card', exact: true }).press('Enter')
    for (const [index, domain] of domains.entries()) {
      await expect(dialog.getByRole('textbox', { name: `Role domain ${index + 1}`, exact: true })).toHaveValue(domain)
    }
    const shortInput = dialog.getByRole('textbox', { name: 'Role domain 3', exact: true })
    const { width: initialWidth, height: initialHeight } = await shortInput.boundingBox()
    await shortInput.fill('Interdisziplinäre regionale Verkehrsplanung')
    await expect.poll(async () => (await shortInput.boundingBox()).width).toBeGreaterThan(initialWidth)
    expect((await shortInput.boundingBox()).height).toBe(initialHeight)
    expect(calls).toEqual([`GET ${LIST_PATH}`, `GET ${A_PATH}`])
    expect(unexpected).toEqual([])
    expect(browserErrors).toEqual([])
  })
}
