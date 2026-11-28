import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const LIST = '/posting/card'
const CARD_KEY = 'a0000000-0000-4000-8000-000000000095'
const IMPORT_KEY = 'a0000000-0000-4000-8000-000000000096'
const CURRENT = `${LIST}/${CARD_KEY}`
const ORIGINAL = `${CURRENT}/original`
const TITLE = 'Werkstudentin für nachhaltige Regionalverkehrsplanung und barrierefreie Fahrgastinformation (DEMO)'
const DOMAIN = 'Verkehrsplanung'
const EXCERPT = 'Unterstützung der regionalen Verkehrsplanung für barrierefreie Fahrgastinformation, einschließlich Auswertung von Haltestelleninformationen und Anschlussverbindungen.'
const CURRENT_SUMMARY = 'Benutzerkorrektur: Untersuchung des Schienenpersonennahverkehrs und Abstimmung mit kommunalen Verkehrsunternehmen.'

const { details: originalPosting } = postingFixture(IMPORT_KEY, TITLE, { kind: 'text', text: EXCERPT, source_url: null })
originalPosting.role_content = {
  ...originalPosting.role_content,
  role_summary: { value: EXCERPT, origin: 'source' },
  domains: [{ value: DOMAIN, origin: 'source' }],
  source: { excerpts: [EXCERPT], source_urls: [] },
}
const originalCard = {
  card_key: CARD_KEY, import_key: IMPORT_KEY, schema_version: 1, created_at: '2026-11-27T12:00:00Z',
  posting: originalPosting, posting_alias: null, user_notes: null, tags: [],
}
const currentCard = {
  ...originalCard,
  posting: {
    ...originalPosting,
    role_content: { ...originalPosting.role_content, role_summary: { value: CURRENT_SUMMARY, origin: 'user_defined' } },
  },
}

async function mockCardReads({ page, context, baseURL }, replyWithOriginal) {
  const calls = []
  const unexpected = []
  const diagnostics = []
  page.on('pageerror', error => diagnostics.push(error.message))
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      diagnostics.push({ text: message.text(), url: message.location().url })
    }
  })
  const responses = {
    [LIST]: route => route.fulfill({ json: [currentCard] }),
    [CURRENT]: route => route.fulfill({ json: currentCard }),
    [ORIGINAL]: replyWithOriginal,
  }
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET' && !url.search && Object.hasOwn(responses, url.pathname)) {
      calls.push(url.pathname)
      await responses[url.pathname](route)
    } else if (url.origin === baseURL && request.method() === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
    } else {
      unexpected.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') socket.connectToServer()
    else {
      unexpected.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })
  return { calls, unexpected, diagnostics }
}

for (const width of [1440, 900]) {
  test(`Read-only Card sources identify saved modifications at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const superseded = Promise.withResolvers()
    const supersededReplied = Promise.withResolvers()
    let reads = 0
    const { calls, unexpected, diagnostics } = await mockCardReads({ page, context, baseURL }, async route => {
      reads += 1
      if (reads === 1) {
        try {
          await superseded.promise
          await route.fulfill({ json: currentCard })
        } finally {
          supersededReplied.resolve()
        }
      } else if (reads === 2) {
        await route.fulfill({ status: 503, json: { detail: 'Synthetic source comparison failure' } })
      } else {
        await route.fulfill({ json: originalCard })
      }
    })

    await page.goto('/')
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await navigation.getByRole('button', { name: 'Market', exact: true }).press('Enter')
    await page.getByText('Role domains in saved jobs', { exact: true }).press('Enter')
    await page.getByRole('button', { name: `${DOMAIN} 1 of 1`, exact: true }).press('Enter')
    const opener = page.getByRole('button', { name: `View saved job: ${TITLE}`, exact: true })
    await opener.press('Enter')
    const dialog = page.getByRole('dialog')
    const sources = dialog.getByRole('checkbox', { name: 'Show sources', exact: true })
    const role = dialog.getByRole('heading', { name: 'What you’ll do', exact: true }).locator('..')
    const evidence = role.locator('.posting-card-source-evidence')
    const modified = role.getByText('Modified by user.', { exact: true })
    const checking = dialog.getByRole('status').filter({ hasText: 'Checking changes against the original' })
    const failed = dialog.getByRole('status').filter({ hasText: 'Could not compare with the original' })

    await expect(role.getByText(CURRENT_SUMMARY, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toHaveCount(0)
    expect(calls).toEqual([LIST, CURRENT])
    try {
      await sources.press('Space')
      await expect(checking).toBeVisible()
      await expect.poll(() => reads).toBe(1)
      const aborted = page.waitForEvent('requestfailed', request => request.url() === `${API}${ORIGINAL}`)
      await sources.press('Space')
      expect((await aborted).failure()?.errorText).toBe('net::ERR_ABORTED')
      await expect(evidence).toHaveCount(0)
      await sources.press('Space')
      await expect(failed).toBeVisible()
      await expect(modified).toHaveCount(0)
    } finally {
      superseded.resolve()
    }
    await supersededReplied.promise
    await expect(failed).toBeVisible()
    await sources.press('Space')
    await sources.press('Space')
    await evidence.getByText('View source', { exact: true }).press('Enter')
    await expect(evidence.getByText(EXCERPT, { exact: true })).toBeVisible()
    await expect(modified).toBeVisible()
    await expect(checking).toHaveCount(0)
    await expect(failed).toHaveCount(0)
    expect(calls).toEqual([LIST, CURRENT, ORIGINAL, ORIGINAL, ORIGINAL])
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('read-only-current-sources.png'), animations: 'disabled' })

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await navigation.getByRole('button', { name: 'Card library', exact: true }).press('Enter')
    await page.getByRole('button', { name: `Show original: ${TITLE}`, exact: true }).press('Enter')
    await expect(dialog.getByRole('heading', { name: TITLE, exact: true })).toBeVisible()
    await expect(role.getByText(EXCERPT, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    await sources.press('Space')
    await evidence.getByText('View source', { exact: true }).press('Enter')
    await expect(evidence.getByText(EXCERPT, { exact: true })).toBeVisible()
    await expect(modified).toHaveCount(0)
    await expect(checking).toHaveCount(0)
    await expect(failed).toHaveCount(0)
    expect(calls).toEqual([LIST, CURRENT, ORIGINAL, ORIGINAL, ORIGINAL, LIST, ORIGINAL])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([{ url: `${API}${ORIGINAL}`, text: expect.stringContaining('503') }])
  })
}
