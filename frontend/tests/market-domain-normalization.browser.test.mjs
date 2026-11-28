import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

function savedCard(id, title, roles) {
  const key = suffix => `a0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
  const importKey = key(id + 20)
  const { details } = postingFixture(importKey, title, { kind: 'text', source_url: null, text: title })
  details.role_content.domains = roles.map(value => ({ value, origin: 'source' }))
  return {
    card_key: key(id), import_key: importKey, schema_version: 1, created_at: '2026-11-27T12:00:00Z',
    posting: details, posting_alias: null, user_notes: null, tags: [],
  }
}

const titles = [
  'Werkstudentin für kommunale Straßenverkehrsplanung',
  'Praktikum in der Verkehrsplanung im Rheinland',
  'Werkstudent im Straßenverkehr bei der Stadt',
  'Praktikum in der Verkehrsverwaltung ohne Aufgabenangabe',
]
const cards = [
  savedCard(1, titles[0], ['Straßenverkehr', 'Straßen\u200bverkehr', 'STRAẞENVERKEHR',
    'Verkehrs\u00adplanung', 'Maße', 'Bahn-Infrastruktur']),
  savedCard(2, titles[1], ['STRASSENVERKEHR', 'Verkehrsplanung', 'Masse', 'Bahninfrastruktur']),
  savedCard(3, titles[2], ['STRAẞENVERKEHR', 'MASSE']),
  savedCard(4, titles[3], ['\u200b', '\u00ad', ' \u200b \u00ad ']),
]

for (const width of [1440, 900]) {
  test(`Market applies the same saved-domain comparisons to both views at ${width}×1000`, async ({
    page, context, baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const diagnostics = []
    const unexpected = []
    const requests = []
    page.on('pageerror', error => diagnostics.push(error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text())
    })
    await context.route('**/*', async route => {
      const request = route.request()
      const url = request.url()
      if (request.method() === 'GET' && url === 'http://127.0.0.1:8000/posting/card') {
        requests.push(url)
        await route.fulfill({ json: cards })
      } else if (request.method() === 'GET' && new URL(url).origin === baseURL &&
        !['fetch', 'xhr'].includes(request.resourceType())) {
        await route.continue()
      } else {
        unexpected.push(`${request.method()} ${url}`)
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

    await page.goto('/')
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market', exact: true }).press('Enter')
    const main = page.getByRole('main')
    const reference = main.getByRole('combobox', { name: 'Reference saved job', exact: true })
    await reference.selectOption(cards[0].card_key)
    const related = main.getByRole('list', { name: 'Related saved jobs', exact: true })
    const first = related.getByRole('listitem').filter({ hasText: titles[1] })
    const second = related.getByRole('listitem').filter({ hasText: titles[2] })
    await expect(related.getByRole('listitem')).toHaveCount(2)
    await expect(first.locator('dd')).toHaveText('STRASSENVERKEHR · Verkehrsplanung')
    await expect(second.locator('dd')).toHaveText('STRAẞENVERKEHR')

    await reference.press('Tab')
    await expect(first.getByRole('button')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(second.getByRole('button')).toBeFocused()
    await page.keyboard.press('Tab')
    const summary = main.getByText('Role domains in saved jobs', { exact: true })
    await expect(summary).toBeFocused()
    await summary.press('Enter')
    const rows = main.getByRole('list', { name: 'Recorded role domains', exact: true })
    await expect(rows.getByRole('listitem')).toHaveCount(7)
    await expect(rows.getByRole('button', { name: 'Verkehrs\u00adplanung 2 of 4', exact: true })).toBeVisible()
    for (const label of ['Maße', 'Masse', 'MASSE', 'Bahn-Infrastruktur', 'Bahninfrastruktur']) {
      await expect(rows.getByRole('button', { name: `${label} 1 of 4`, exact: true })).toBeVisible()
    }
    await expect(main.getByRole('button', { name: 'Saved Cards without recorded domains 1 of 4', exact: true })).toBeVisible()
    const roads = rows.getByRole('button', { name: 'Straßenverkehr 3 of 4', exact: true })
    await roads.press('Enter')
    await expect(roads).toBeFocused()
    const evidence = main.getByRole('list', { name: 'Saved Cards in Straßenverkehr', exact: true })
    await expect(evidence.getByRole('listitem')).toHaveCount(3)
    for (const title of titles.slice(0, 3)) await expect(evidence.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('market-domain-normalization.png'), fullPage: true, animations: 'disabled' })
    expect(requests).toEqual(['http://127.0.0.1:8000/posting/card'])
    expect(diagnostics).toEqual([])
    expect(unexpected).toEqual([])
  })
}
