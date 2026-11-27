import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const CARDS = '/posting/card'
const DISCLOSURE = 'Role domains in saved jobs'
const MISSING = 'Saved Cards without recorded domains'
const LONG_DOMAIN = 'Öffentliche Mobilitätsplanung und barrierefreie Fahrgastinformationssysteme im Schienenpersonennahverkehr'

function savedCard(id, title, domains) {
  const key = suffix => `a0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
  const importKey = key(id + 20)
  const { details } = postingFixture(importKey, title, { kind: 'text', source_url: null, text: title })
  details.role_content.domains = domains.map(value => ({ value, origin: 'source' }))
  return {
    card_key: key(id), import_key: importKey, schema_version: 1, created_at: '2026-11-27T12:00:00Z',
    posting: details, posting_alias: null, user_notes: null, tags: [],
  }
}

const cards = [
  savedCard(1, 'Werkstudentin für barrierefreie Verkehrsinformation im Rheinland (DEMO)',
    ['Datenanalyse', '  DATENANALYSE ', LONG_DOMAIN]),
  savedCard(2, 'Praktikum für Fahrgastzählungen und Nahverkehrsplanung (DEMO)',
    ['datenanalyse', LONG_DOMAIN.normalize('NFD').toUpperCase().replace(' UND ', '  UND   ')]),
  savedCard(3, 'Werkstudent für Unternehmenskommunikation und Berichterstattung (DEMO)',
    ['Datenanalyse', 'Unternehmenskommunikation']),
  savedCard(4, 'Praktikum mit noch unbekanntem Aufgabenbereich (DEMO)', []),
  savedCard(5, 'Werkstudentin für abteilungsübergreifende Aufgaben (DEMO)', [' ', '\t']),
]

async function enterMarket({ page, context, baseURL }, savedCards) {
  const calls = []
  const unexpected = []
  const diagnostics = []
  page.on('pageerror', error => diagnostics.push(error.message))
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text())
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET' && url.pathname === CARDS && !url.search) {
      calls.push(url.pathname)
      await route.fulfill({ json: savedCards })
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
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpected.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Import posting', exact: true })).toBeVisible()
  expect(calls).toEqual([])
  const market = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market', exact: true })
  await market.press('Enter')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Market', exact: true })).toBeVisible()
  const summary = main.getByText(DISCLOSURE, { exact: true })
  await expect(summary).toBeVisible()
  const chart = summary.locator('..')
  await expect(chart).not.toHaveAttribute('open', '')
  return { main, summary, chart, calls, unexpected, diagnostics }
}

for (const width of [1440, 900]) {
  test(`Market compares saved role-domain counts with one Card per domain at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const { main, summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, cards)
    const denominator = chart.getByText('Based on 5 saved Cards.', { exact: true })
    const list = chart.getByRole('list', { name: 'Recorded role domains', exact: true })
    const rows = list.getByRole('listitem')
    await expect(denominator).toBeHidden()
    await main.getByRole('combobox', { name: 'Reference saved job', exact: true }).press('Tab')
    await expect(summary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(summary).toBeFocused()
    await expect(denominator).toBeVisible()
    await expect(chart.getByText('A Card can count in more than one domain.', { exact: true })).toBeVisible()
    await expect(rows).toHaveCount(3)
    for (const [domain, count] of [['Datenanalyse', 3], [LONG_DOMAIN, 2], ['Unternehmenskommunikation', 1]]) {
      const row = rows.filter({ has: page.getByText(domain, { exact: true }) })
      await expect(row.getByText(`${count} of 5`, { exact: true })).toBeVisible()
      const bar = row.locator('.market-role-domains__bar')
      const proportion = await bar.evaluate(element => element.getBoundingClientRect().width / element.parentElement.getBoundingClientRect().width)
      expect(proportion).toBeCloseTo(count / 5, 2)
    }
    await expect(list.getByText(MISSING, { exact: true })).toHaveCount(0)
    const missing = chart.getByText(MISSING, { exact: true }).locator('..')
    await expect(missing.getByText('2 of 5', { exact: true })).toBeVisible()
    expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('saved-role-domain-counts.png'), animations: 'disabled' })

    await page.keyboard.press('Space')
    await expect(chart).not.toHaveAttribute('open', '')
    await expect(denominator).toBeHidden()
    await expect(summary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(denominator).toBeVisible()
    expect(calls).toEqual([CARDS])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([])
  })
}

for (const { label, savedCards } of [
  { label: 'no saved Cards', savedCards: [] },
  { label: 'saved Cards without recorded domains', savedCards: cards.slice(3) },
]) {
  test(`Market role-domain comparison handles ${label}`, async ({ page, context, baseURL }) => {
    const { summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, savedCards)
    await summary.press('Enter')
    await expect(summary).toBeFocused()
    await expect(chart.getByRole('listitem')).toHaveCount(0)
    if (savedCards.length === 0) {
      await expect(chart.getByText('No saved Cards to compare.', { exact: true })).toBeVisible()
      await expect(chart.getByText(MISSING, { exact: true })).toHaveCount(0)
    } else {
      await expect(chart.getByText('Based on 2 saved Cards.', { exact: true })).toBeVisible()
      await expect(chart.getByText(MISSING, { exact: true }).locator('..')
        .getByText('2 of 2', { exact: true })).toBeVisible()
    }
    expect(calls).toEqual([CARDS])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([])
  })
}
