import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const LIST_PATH = '/posting/card'
const CARD_KEY = 'a0000000-0000-4000-8000-000000000071'
const IMPORT_KEY = 'a0000000-0000-4000-8000-000000000072'
const ORIGINAL_PATH = `${LIST_PATH}/${CARD_KEY}/original`
const RECEIPT_PATH = `${LIST_PATH}/${CARD_KEY}/source-receipt`
const TITLE = 'Werkstudent (m/w/d) für barrierefreie Fahrgastinformation und regionale Nahverkehrsplanung (DEMO)'
const SUBMITTED_AT = '2026-11-24T09:10:00.000Z'
const SOURCE_URL = 'https://stellenbeispiel.invalid/jobs/werkstudent-fahrgastinformationssysteme-und-nahverkehrsplanung?quelle=campus&sprache=de'
const CURRENT_URL = 'https://stellenbeispiel.invalid/aktuell/werkstudent-verkehrsplanung'

async function openCard({ page, context, baseURL }, { receipt, failFirst = false, original = false, source }) {
  const posting = postingFixture(IMPORT_KEY, TITLE, source).details
  posting.identity.canonical_posting_url = { origin: 'user_defined', value: CURRENT_URL }
  const card = {
    card_key: CARD_KEY, import_key: IMPORT_KEY, schema_version: 1, created_at: '2026-11-27T10:00:00Z',
    posting, posting_alias: null, user_notes: null, tags: [],
  }
  const calls = []
  const unexpected = []
  let receiptReads = 0

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET') {
      calls.push(url.pathname)
      if (url.pathname === LIST_PATH) {
        await route.fulfill({ json: [card] })
        return
      }
      if (original && url.pathname === ORIGINAL_PATH) {
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
  expect(calls).toEqual(original ? [LIST_PATH, ORIGINAL_PATH] : [LIST_PATH])
  return { dialog, summary, disclosure, calls, unexpected }
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
    expect(calls).toEqual(original ? [LIST_PATH, ORIGINAL_PATH, RECEIPT_PATH] : [LIST_PATH, RECEIPT_PATH])
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
  expect(calls).toEqual([LIST_PATH, RECEIPT_PATH])

  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(unavailable).toBeVisible()
  await expect(summary).toBeFocused()
  await expect(error).toBeHidden()
  await expect(retry).toHaveCount(0)
  await expect(disclosure.getByRole('link')).toHaveCount(0)
  await expect(disclosure.getByText('Submitted', { exact: true })).toHaveCount(0)
  expect(calls).toEqual([LIST_PATH, RECEIPT_PATH, RECEIPT_PATH])
  expect(unexpected).toEqual([])
})
