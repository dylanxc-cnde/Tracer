import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const IMPORTS = '/posting/import'
const SUBMITTED_AT = '2026-11-27T10:00:00Z'
const A = postingFixture(
  'a0000000-0000-4000-8000-000000000041',
  'Praktikum in der barrierefreien Verkehrsplanung und Fahrgastinformation (DEMO)',
  {
    kind: 'text', source_url: null,
    text: 'Unser fiktives Verkehrsunternehmen sucht Unterstützung bei Fahrgastzählungen und der verständlichen Dokumentation barrierefreier Linieninformationen.',
  },
)
const B = postingFixture(
  'a0000000-0000-4000-8000-000000000042',
  'Werkstudent (m/w/d) für Netzentgeltabrechnung und Energiewirtschaft im Rheinland (DEMO)',
  {
    kind: 'text', source_url: null,
    text: 'Unser fiktives Netzteam sucht Unterstützung bei der Netzentgeltabrechnung, Messdatenauswertung und Vorbereitung von Rückfragen zur Tarifbindung.',
  },
)
const REPLACEMENT_A = { ...A, importKey: 'a0000000-0000-4000-8000-000000000043' }
const deletePath = `${IMPORTS}/${A.importKey}`
const parsePath = (posting) => `${IMPORTS}/${posting.importKey}/parse-results`

async function openWorkspace({ page, context, baseURL }, { createGate, parseGate, deleteGate } = {}) {
  const receipts = new Map()
  const requests = { creates: [], parses: [], deletes: [], unexpected: [] }
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await context.route('**/*', async (route) => {
    const request = route.request()
    const { origin, pathname } = new URL(request.url())
    const method = request.method()
    if (origin === API && pathname === IMPORTS && method === 'POST') {
      const body = request.postDataJSON()
      const posting = [A, B].find(({ importSource }) => importSource.text === body.text)
      if (posting) {
        const replacement = posting === A && requests.creates.some(({ key }) => key === A.importKey)
        const { importKey: key } = replacement ? REPLACEMENT_A : posting
        const receipt = { import_key: key, schema_version: 1, submitted_at: SUBMITTED_AT, source: posting.importSource }
        requests.creates.push({ key, body })
        receipts.set(key, receipt)
        if (key === A.importKey) await createGate?.promise
        await route.fulfill({ status: 201, json: receipt })
        return
      }
    }
    if (origin === API && pathname === IMPORTS && method === 'GET') {
      await route.fulfill({ json: [...receipts.values()] })
      return
    }
    if (origin === API && pathname === deletePath && method === 'DELETE') {
      requests.deletes.push(A.importKey)
      receipts.delete(A.importKey)
      await deleteGate?.promise
      await route.fulfill({ status: 204 })
      return
    }
    if (origin === API && method === 'POST') {
      const posting = [A, B, REPLACEMENT_A].find((fixture) => parsePath(fixture) === pathname)
      if (posting) {
        requests.parses.push(posting.importKey)
        if (!receipts.has(posting.importKey)) {
          await route.fulfill({ status: 404, json: { detail: 'Synthetic import missing' } })
          return
        }
        if (posting === A) await parseGate?.promise
        await route.fulfill({ json: {
          status: 'complete', postings: [{ details: posting.details, parse_ambiguities: [] }],
          refinement_reason: null, refinement_suggestions: [],
        } })
        return
      }
    }
    if (origin === baseURL && method === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
      return
    }
    requests.unexpected.push(`${method} ${request.url()}`)
    await route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
      return
    }
    requests.unexpected.push(`WebSocket ${socket.url()}`)
    socket.close()
  })

  const main = page.getByRole('main')
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const loadHistory = main.getByRole('button', { name: 'Load import history', exact: true })
  const historyA = main.getByRole('article').filter({ hasText: A.importKey })
  await page.goto('/')
  await expect(main.getByRole('heading', { name: 'Import posting' })).toBeVisible()
  return {
    main, requests, errors, historyA,
    input: main.getByRole('textbox', { name: 'Posting text', exact: true }),
    analyze: main.getByRole('button', { name: 'Analyze', exact: true }),
    confirm: main.getByRole('button', { name: 'Confirm and save', exact: true }),
    async openHistory() {
      await nav.getByRole('button', { name: 'Import history', exact: true }).press('Enter')
      await expect(main.getByRole('heading', { name: 'Import history' })).toBeVisible()
      await loadHistory.press('Enter')
    },
    async openImport() {
      await nav.getByRole('button', { name: 'Import posting', exact: true }).press('Enter')
      await expect(main.getByRole('heading', { name: 'Import posting' })).toBeVisible()
    },
    async deleteA() {
      await expect(historyA).toBeVisible()
      page.once('dialog', (dialog) => dialog.accept())
      await historyA.getByRole('button', { name: 'Delete', exact: true }).press('Enter')
      await expect.poll(() => requests.deletes).toEqual([A.importKey])
    },
  }
}

async function releaseResponse(page, path, gate, status) {
  const reply = page.waitForResponse(`${API}${path}`)
  gate.resolve()
  const response = await reply
  expect(response.status()).toBe(status)
  expect(await response.finished()).toBeNull()
}

test('Import history keeps a newer selected proposal when an earlier import delete completes', async ({ page, context, baseURL }) => {
  const deleteGate = Promise.withResolvers()
  const workspace = await openWorkspace({ page, context, baseURL }, { deleteGate })
  const { main, input, analyze, confirm, historyA, requests, errors } = workspace
  const proposalB = main.getByRole('article').filter({ has: page.getByRole('heading', { name: B.title }) })
  await input.fill(A.importSource.text)
  await analyze.press('Enter')
  await expect(main.getByRole('heading', { name: A.title })).toBeVisible()

  try {
    await workspace.openHistory()
    await workspace.deleteA()
    await expect(historyA.getByRole('button', { name: 'Deleting...', exact: true })).toBeDisabled()
    await workspace.openImport()
    await input.fill(B.importSource.text)
    await analyze.press('Enter')
    await proposalB.getByRole('button', { name: 'Select', exact: true }).press('Enter')
    await expect(confirm).toBeEnabled()
    await releaseResponse(page, deletePath, deleteGate, 204)
  } finally {
    deleteGate.resolve()
  }

  await workspace.openHistory()
  await expect(main.getByText(B.importKey, { exact: false })).toBeVisible()
  await expect(historyA).toHaveCount(0)
  await workspace.openImport()
  await expect(input).toHaveValue(B.importSource.text)
  await expect(proposalB.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await expect(confirm).toBeEnabled()
  expect(requests.creates).toEqual([{ key: A.importKey, body: A.importSource }, { key: B.importKey, body: B.importSource }])
  expect(requests.parses).toEqual([A.importKey, B.importKey])
  expect(requests.deletes).toEqual([A.importKey])
  expect(requests.unexpected).toEqual([])
  expect(errors).toEqual([])
})

test('Import history clears the matching proposal when a pending parse beats its delete reply', async ({ page, context, baseURL }) => {
  const parseGate = Promise.withResolvers()
  const deleteGate = Promise.withResolvers()
  const workspace = await openWorkspace({ page, context, baseURL }, { parseGate, deleteGate })
  const { main, input, analyze, confirm, requests, errors } = workspace
  const proposal = main.getByRole('heading', { name: A.title })

  try {
    await input.fill(A.importSource.text)
    await analyze.press('Enter')
    await expect.poll(() => requests.parses).toEqual([A.importKey])
    await workspace.openHistory()
    await workspace.deleteA()
    await workspace.openImport()
    await releaseResponse(page, parsePath(A), parseGate, 200)
    await expect(proposal).toBeVisible()
    await releaseResponse(page, deletePath, deleteGate, 204)
  } finally {
    parseGate.resolve()
    deleteGate.resolve()
  }

  await expect(input).toHaveValue(A.importSource.text)
  await expect(analyze).toBeEnabled()
  await expect(proposal).toHaveCount(0)
  await expect(confirm).toHaveCount(0)
  expect(requests.creates).toEqual([{ key: A.importKey, body: A.importSource }])
  expect(requests.parses).toEqual([A.importKey])
  expect(requests.deletes).toEqual([A.importKey])
  expect(requests.unexpected).toEqual([])
  expect(errors).toEqual([])
})

test('Import history skips parsing an import deleted before its create receipt reaches the workspace', async ({ page, context, baseURL }) => {
  const createGate = Promise.withResolvers()
  const workspace = await openWorkspace({ page, context, baseURL }, { createGate })
  const { main, input, analyze, confirm, historyA, requests, errors } = workspace
  const alert = main.getByRole('alert')

  try {
    await input.fill(A.importSource.text)
    await analyze.press('Enter')
    await expect.poll(() => requests.creates).toEqual([{ key: A.importKey, body: A.importSource }])
    await workspace.openHistory()
    await workspace.deleteA()
    await expect(historyA).toHaveCount(0)
    await releaseResponse(page, IMPORTS, createGate, 201)
  } finally {
    createGate.resolve()
  }

  await workspace.openImport()
  await expect(input).toHaveValue(A.importSource.text)
  await expect(alert).toHaveText('This import is no longer available. Analyze the source again.')
  await expect(analyze).toBeEnabled()
  await expect(confirm).toHaveCount(0)
  expect(requests.creates).toEqual([{ key: A.importKey, body: A.importSource }])
  expect(requests.parses).toEqual([])

  await analyze.press('Enter')
  await expect(main.getByRole('heading', { name: A.title })).toBeVisible()
  await expect(alert).toHaveCount(0)
  await expect(confirm).toBeDisabled()
  expect(requests.creates).toEqual([{ key: A.importKey, body: A.importSource }, { key: REPLACEMENT_A.importKey, body: A.importSource }])
  expect(requests.parses).toEqual([REPLACEMENT_A.importKey])
  expect(requests.deletes).toEqual([A.importKey])
  expect(requests.unexpected).toEqual([])
  expect(errors).toEqual([])
})
