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
const ORIGINAL_PATH = `${LIST_PATH}/${A_KEY}/original`

function savedCard(cardKey, importKey, title) {
  const { details } = postingFixture(importKey, title, { kind: 'text', text: title, source_url: null })
  return {
    card_key: cardKey, import_key: importKey, schema_version: 1, created_at: '2026-11-27T10:00:00Z',
    posting: details, posting_alias: null, user_notes: null, tags: [],
  }
}

for (const { outcome, status } of [{ outcome: 'success', status: 200 }, { outcome: 'failure', status: 503 }]) {
  test(`Card library ignores late original Card ${outcome} after opening a current Card`, async ({ page, context, baseURL }) => {
    const gate = Promise.withResolvers()
    const currentA = savedCard(A_KEY, A_IMPORT, A_CURRENT)
    const currentB = savedCard(B_KEY, B_IMPORT, B_CURRENT)
    const originalA = savedCard(A_KEY, A_IMPORT, A_ORIGINAL)
    const reads = []
    const unexpected = []
    let originalReads = 0

    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === API && request.method() === 'GET') {
        if (url.pathname === LIST_PATH) {
          reads.push(url.pathname)
          await route.fulfill({ json: [currentA, currentB] })
          return
        }
        if (url.pathname === ORIGINAL_PATH) {
          reads.push(url.pathname)
          originalReads += 1
          if (originalReads === 1) {
            await gate.promise
            if (status !== 200) {
              await route.fulfill({ status, json: { detail: 'Synthetic original read failed' } })
              return
            }
          }
          await route.fulfill({ json: originalA })
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
    expect(reads).toEqual([LIST_PATH, ORIGINAL_PATH, ORIGINAL_PATH])
    expect(unexpected).toEqual([])
  })
}
