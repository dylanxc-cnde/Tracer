import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const LIST_PATH = '/posting/card'
const CARD_KEY = 'a0000000-0000-4000-8000-000000000071'
const IMPORT_KEY = 'a0000000-0000-4000-8000-000000000072'
const CURRENT_PATH = `${LIST_PATH}/${CARD_KEY}`
const ORIGINAL_PATH = `${CURRENT_PATH}/original`
const RECEIPT_PATH = `${CURRENT_PATH}/source-receipt`
const CHECKS_PATH = `${CURRENT_PATH}/source-checks`
const TITLE = 'Werkstudent (m/w/d) für barrierefreie Fahrgastinformation und regionale Nahverkehrsplanung (DEMO)'
const SUBMITTED_AT = '2026-11-24T09:10:00.000Z'
const SOURCE_URL = 'https://stellenbeispiel.invalid/jobs/werkstudent-fahrgastinformationssysteme-und-nahverkehrsplanung?quelle=campus&sprache=de'
const CURRENT_URL = 'https://stellenbeispiel.invalid/aktuell/werkstudent-verkehrsplanung'

async function openCard({ page, context, baseURL }, { receipt, failFirst = false, original = false, source, onSourceChecks }) {
  const posting = postingFixture(IMPORT_KEY, TITLE, source).details
  posting.identity.canonical_posting_url = { origin: 'user_defined', value: CURRENT_URL }
  const card = {
    card_key: CARD_KEY, import_key: IMPORT_KEY, schema_version: 1, created_at: '2026-11-27T10:00:00Z',
    posting, posting_alias: null, user_notes: null, tags: [],
  }
  const calls = []
  const checkCalls = []
  const unexpected = []
  let receiptReads = 0

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && url.pathname === CHECKS_PATH && onSourceChecks) {
      checkCalls.push(request.method())
      await onSourceChecks(route, request)
      return
    }
    if (url.origin === API && request.method() === 'GET') {
      calls.push(url.pathname)
      if (url.pathname === LIST_PATH) {
        await route.fulfill({ json: [card] })
        return
      }
      if (url.pathname === (original ? ORIGINAL_PATH : CURRENT_PATH)) {
        await route.fulfill({ json: card })
        return
      }
      if (url.pathname === RECEIPT_PATH) {
        receiptReads += 1
        if (failFirst && receiptReads === 1) {
          await route.fulfill({ status: 503, json: { detail: 'Synthetic receipt storage error' } })
          return
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(receipt) })
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
  await navigation.getByRole('button', { name: 'Card library', exact: true }).click()
  const buttonName = original ? `Show original: ${TITLE}` : `View details: ${TITLE} at Unknown company`
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: TITLE, exact: true })).toBeVisible()
  const summary = dialog.getByText('Import source', { exact: true })
  const disclosure = summary.locator('..')
  await expect(summary).toBeVisible()
  await expect(disclosure).not.toHaveAttribute('open', '')
  expect(calls).toEqual([LIST_PATH, original ? ORIGINAL_PATH : CURRENT_PATH])
  return { dialog, summary, disclosure, calls, checkCalls, unexpected }
}

const TEXT_SOURCE = { kind: 'text', text: 'Synthetischer Ausschreibungstext für den Browser-Test.', source_url: null }
const CASES = [
  { source: { kind: 'url', url: SOURCE_URL }, label: 'Submitted link', url: SOURCE_URL, original: false },
  { source: TEXT_SOURCE, label: 'Pasted text', url: null, original: true },
]

for (const { source, label, url, original } of CASES) {
  test(`Card import source lazily reads the receipt for ${label.toLowerCase()} in the Card viewer`, async ({ page, context, baseURL }) => {
    const receipt = { kind: source.kind, submitted_at: SUBMITTED_AT, source_url: url }
    const { dialog, summary, disclosure, calls, unexpected } = await openCard({ page, context, baseURL }, { source, receipt, original })
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(summary).toBeFocused()
    await expect(disclosure.getByText(label, { exact: true })).toBeVisible()
    await expect(disclosure.getByText('Submitted', { exact: true })).toBeVisible()
    await expect(disclosure.locator('time')).toHaveAttribute('datetime', SUBMITTED_AT)
    if (url) {
      const link = disclosure.getByRole('link', { name: url, exact: true })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', url)
      await expect(disclosure.getByRole('link')).toHaveCount(1)
      await expect(disclosure).not.toContainText(CURRENT_URL)
    } else {
      await expect(disclosure.getByRole('link')).toHaveCount(0)
      await expect(disclosure).not.toContainText(TEXT_SOURCE.text)
      await expect(dialog.getByRole('button', { name: 'Edit card' })).toHaveCount(0)
    }
    await expect(dialog.getByRole('checkbox', { name: 'Show sources' })).not.toBeChecked()
    expect(calls).toEqual([LIST_PATH, original ? ORIGINAL_PATH : CURRENT_PATH, RECEIPT_PATH])
    expect(unexpected).toEqual([])
  })
}

test('Card import source retries a failed read and reports an unavailable receipt', async ({ page, context, baseURL }) => {
  const { summary, disclosure, calls, unexpected } = await openCard(
    { page, context, baseURL }, { source: TEXT_SOURCE, receipt: null, failFirst: true },
  )
  const unavailable = disclosure.getByText('Import receipt is unavailable.', { exact: true })
  const error = disclosure.getByText('Could not load the import receipt.', { exact: true })
  const retry = disclosure.getByRole('button', { name: 'Retry', exact: true })
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(error).toBeVisible()
  await expect(unavailable).toBeHidden()
  expect(calls).toEqual([LIST_PATH, CURRENT_PATH, RECEIPT_PATH])

  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(unavailable).toBeVisible()
  await expect(summary).toBeFocused()
  await expect(error).toBeHidden()
  await expect(retry).toHaveCount(0)
  await expect(disclosure.getByRole('link')).toHaveCount(0)
  await expect(disclosure.getByText('Submitted', { exact: true })).toHaveCount(0)
  expect(calls).toEqual([LIST_PATH, CURRENT_PATH, RECEIPT_PATH, RECEIPT_PATH])
  expect(unexpected).toEqual([])
})

const LINK_SOURCE = { kind: 'url', url: SOURCE_URL }
const LINK_RECEIPT = { kind: 'url', submitted_at: SUBMITTED_AT, source_url: SOURCE_URL }
const RECORDED_AT = '2026-11-27T12:34:56Z'

test('Card rechecks the import receipt when a quick close and reopen share one browser event', async ({ page, context, baseURL }) => {
  const { summary, disclosure, calls, unexpected } = await openCard({ page, context, baseURL }, {
    source: LINK_SOURCE, receipt: LINK_RECEIPT,
  })
  await summary.press('Enter')
  const sourceLink = disclosure.getByRole('link', { name: SOURCE_URL, exact: true })
  await expect(sourceLink).toBeVisible()
  expect(calls).toEqual([LIST_PATH, CURRENT_PATH, RECEIPT_PATH])

  let refreshed = 0
  await context.route(`${API}${RECEIPT_PATH}`, async route => {
    refreshed += 1
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })
  await disclosure.evaluate(element => {
    element.open = false
    element.open = true
  })
  await expect(disclosure.getByText('Import receipt is unavailable.', { exact: true })).toBeVisible()
  await expect(sourceLink).toHaveCount(0)
  expect(refreshed).toBe(1)
  expect(unexpected).toEqual([])
})

async function expandChecks(summary, disclosure, checkCalls) {
  await summary.press('Enter')
  const checkSummary = disclosure.getByText('Source checks', { exact: true })
  await expect(checkSummary).toBeVisible()
  expect(checkCalls).toEqual([])
  await checkSummary.press('Enter')
  return checkSummary.locator('..')
}

for (const width of [1440, 900]) {
  test(`Card records a user-confirmed source check at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const rows = []
    const drafts = []
    const { summary, disclosure, calls, checkCalls, unexpected } = await openCard({ page, context, baseURL }, {
      source: LINK_SOURCE, receipt: LINK_RECEIPT,
      onSourceChecks: async (route, request) => {
        if (request.method() === 'GET') {
          await route.fulfill({ json: rows })
          return
        }
        const body = request.postDataJSON()
        drafts.push(body)
        const row = { ...body, recorded_at: RECORDED_AT }
        rows.unshift(row)
        await route.fulfill({ status: 201, json: row })
      },
    })
    const checks = await expandChecks(summary, disclosure, checkCalls)
    const result = checks.getByRole('combobox')
    const record = checks.getByRole('button', { name: 'Record check', exact: true })
    await expect(record).toBeDisabled()
    await result.focus()
    await result.selectOption('listed')
    await expect(record).toBeEnabled()
    expect(checkCalls).toEqual(['GET'])
    expect(drafts).toEqual([])
    await record.press('Enter')
    await expect(checks.locator(`time[datetime="${RECORDED_AT}"]`)).toBeVisible()
    await expect(checks.getByRole('listitem')).toContainText('Still listed')
    expect(drafts).toEqual([{ check_id: expect.stringMatching(/^[0-9a-f-]{36}$/), result: 'listed' }])
    expect(checkCalls).toEqual(['GET', 'POST'])
    expect(calls).toEqual([LIST_PATH, CURRENT_PATH, RECEIPT_PATH])
    expect(unexpected).toEqual([])
    await checks.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('user-recorded-source-check.png') })
  })
}

for (const { original, receipt, name } of [
  { original: true, receipt: LINK_RECEIPT, name: 'the original Card viewer' },
  { original: false, receipt: null, name: 'the current Card after receipt deletion' },
]) {
  test(`Card source checks are read-only in ${name}`, async ({ page, context, baseURL }) => {
    const row = { check_id: 'a0000000-0000-4000-8000-000000000076', result: 'unable_to_confirm', recorded_at: RECORDED_AT }
    const { summary, disclosure, checkCalls, unexpected } = await openCard({ page, context, baseURL }, {
      source: LINK_SOURCE, receipt, original,
      onSourceChecks: route => route.fulfill({ json: [row] }),
    })
    const checks = await expandChecks(summary, disclosure, checkCalls)
    await expect(checks.getByRole('listitem')).toContainText('Could not confirm')
    await expect(checks.getByRole('button', { name: 'Record check', exact: true })).toHaveCount(0)
    await expect(checks.getByRole('combobox')).toHaveCount(0)
    if (receipt === null) await expect(disclosure.getByRole('link')).toHaveCount(0)
    expect(checkCalls).toEqual(['GET'])
    expect(unexpected).toEqual([])
  })
}

test('Card source checks offers an explicit retry after a failed history read', async ({ page, context, baseURL }) => {
  let reads = 0
  const { summary, disclosure, checkCalls, unexpected } = await openCard({ page, context, baseURL }, {
    source: LINK_SOURCE, receipt: LINK_RECEIPT,
    onSourceChecks: async (route) => {
      reads += 1
      if (reads === 1) {
        await route.fulfill({ status: 503, json: { detail: 'Synthetic read failure' } })
      } else {
        await route.fulfill({ json: [] })
      }
    },
  })
  const checks = await expandChecks(summary, disclosure, checkCalls)
  const retry = checks.getByRole('button', { name: 'Retry reading source checks', exact: true })
  const empty = checks.getByText('No source checks recorded.', { exact: true })
  await expect(retry).toBeVisible()
  await expect(empty).toBeHidden()
  expect(checkCalls).toEqual(['GET'])
  await retry.press('Enter')
  await expect(empty).toBeVisible()
  expect(checkCalls).toEqual(['GET', 'GET'])
  expect(unexpected).toEqual([])
})

test('Card removes stale source controls if the link is deleted before a check is recorded', async ({ page, context, baseURL }) => {
  const row = { check_id: 'a0000000-0000-4000-8000-000000000076', result: 'unable_to_confirm', recorded_at: RECORDED_AT }
  const { summary, disclosure, checkCalls, unexpected } = await openCard({ page, context, baseURL }, {
    source: LINK_SOURCE, receipt: LINK_RECEIPT,
    onSourceChecks: async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ json: [row] })
        return
      }
      await route.fulfill({ status: 409, json: { detail: 'posting.source_check_unavailable' } })
    },
  })
  const checks = await expandChecks(summary, disclosure, checkCalls)
  await expect(disclosure.getByRole('link', { name: SOURCE_URL, exact: true })).toBeVisible()
  await checks.getByRole('combobox').selectOption('listed')
  const record = checks.getByRole('button', { name: 'Record check', exact: true })
  await expect(record).toBeEnabled()
  await record.press('Enter')
  await expect(checks.getByRole('alert')).toHaveText('The submitted link is no longer available.')
  await expect(checks.getByRole('listitem')).toContainText('Could not confirm')
  await expect(checks.getByRole('combobox')).toHaveCount(0)
  await expect(disclosure.getByRole('link')).toHaveCount(0)
  await expect(checks.getByText('Source checks', { exact: true })).toBeFocused()
  expect(checkCalls).toEqual(['GET', 'POST'])
  expect(unexpected).toEqual([])
})

for (const committed of [true, false]) {
  test(`Card reconciles ${committed ? 'a recorded' : 'an unrecorded'} source check after a lost response`, async ({ page, context, baseURL }) => {
    const rows = []
    const drafts = []
    const { summary, disclosure, checkCalls, unexpected } = await openCard({ page, context, baseURL }, {
      source: LINK_SOURCE, receipt: LINK_RECEIPT,
      onSourceChecks: async (route, request) => {
        if (request.method() === 'GET') {
          await route.fulfill({ json: rows })
          return
        }
        const body = request.postDataJSON()
        drafts.push(body)
        const row = { ...body, recorded_at: RECORDED_AT }
        if (drafts.length === 1) {
          if (committed) rows.unshift(row)
          await route.abort('failed')
          return
        }
        rows.unshift(row)
        await route.fulfill({ status: 201, json: row })
      },
    })
    const checks = await expandChecks(summary, disclosure, checkCalls)
    const result = checks.getByRole('combobox')
    await result.selectOption('not_listed')
    const record = checks.getByRole('button', { name: 'Record check', exact: true })
    await expect(record).toBeEnabled()
    await record.press('Enter')
    const refresh = checks.getByRole('button', { name: 'Read source checks', exact: true })
    await expect(refresh).toBeVisible()
    await expect(result).toHaveValue('not_listed')
    await expect(result).toBeDisabled()
    expect(checkCalls).toEqual(['GET', 'POST'])
    await refresh.press('Enter')

    if (!committed) {
      const retry = checks.getByRole('button', { name: 'Retry same check', exact: true })
      await expect(retry).toBeEnabled()
      expect(checkCalls).toEqual(['GET', 'POST', 'GET'])
      await retry.press('Enter')
    }
    await expect(checks.getByRole('listitem')).toContainText('No longer listed')
    if (!committed) expect(drafts).toEqual([drafts[0], drafts[0]])
    expect(checkCalls).toEqual(committed ? ['GET', 'POST', 'GET'] : ['GET', 'POST', 'GET', 'POST'])
    expect(unexpected).toEqual([])
  })
}
