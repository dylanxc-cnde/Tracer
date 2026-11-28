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

const positionTitle = card => card.posting.identity.position_title.value
const cardPath = card => `${CARDS}/${card.card_key}`

async function enterMarket({ page, context, baseURL }, savedCards, details = {}) {
  const calls = []
  const unexpected = []
  const diagnostics = []
  page.on('pageerror', error => diagnostics.push({ type: 'pageerror', text: error.message }))
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      diagnostics.push({ type: message.type(), url: message.location().url, text: message.text() })
    }
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'GET' && !url.search) {
      if (url.pathname === CARDS) {
        calls.push(url.pathname)
        await route.fulfill({ json: savedCards })
        return
      }
      if (Object.hasOwn(details, url.pathname)) {
        calls.push(url.pathname)
        await details[url.pathname](route)
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

const domainControl = (chart, domain, count, total = 5) => chart.getByRole('button', { name: `${domain} ${count} of ${total}`, exact: true })
const savedJobControl = (group, card) => group.getByRole('button', { name: `View saved job: ${positionTitle(card)}`, exact: true })

async function expectContributors(chart, name, contributors) {
  const list = chart.getByRole('list', { name, exact: true })
  await expect(list.getByRole('listitem')).toHaveCount(contributors.length)
  for (const card of contributors) {
    await expect(savedJobControl(list, card)).toBeVisible()
  }
  return list
}

for (const width of [1440, 900]) {
  test(`Market role-domain drilldown shows exactly the contributing Cards at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const saved = cards[0]
    const fresh = structuredClone(saved)
    fresh.posting.identity.position_title.value += ' – aktualisiert'
    const { summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, cards, {
      [cardPath(saved)]: route => route.fulfill({ json: fresh }),
    })
    await summary.press('Enter')
    const data = domainControl(chart, 'Datenanalyse', 3)
    const mobility = domainControl(chart, LONG_DOMAIN, 2)
    const missing = domainControl(chart, MISSING, 2)
    await expect(data).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Tab')
    await expect(data).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(data).toBeFocused()
    await expect(data).toHaveAttribute('aria-expanded', 'true')
    const dataList = await expectContributors(chart, 'Saved Cards in Datenanalyse', cards.slice(0, 3))
    expect(calls).toEqual([CARDS])
    await dataList.scrollIntoViewIfNeeded()
    expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('role-domain-contributing-cards.png'), animations: 'disabled' })

    const opener = savedJobControl(dataList, saved)
    await page.keyboard.press('Tab')
    await expect(opener).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: positionTitle(fresh), exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(savedJobControl(dataList, fresh)).toBeFocused()

    await mobility.press('Enter')
    await expect(data).toHaveAttribute('aria-expanded', 'false')
    await expect(dataList).toHaveCount(0)
    await expect(mobility).toBeFocused()
    await expectContributors(chart, `Saved Cards in ${LONG_DOMAIN}`, [fresh, cards[1]])

    await missing.press('Enter')
    await expect(mobility).toHaveAttribute('aria-expanded', 'false')
    await expect(missing).toHaveAttribute('aria-expanded', 'true')
    const missingList = await expectContributors(chart, MISSING, cards.slice(3))
    await page.keyboard.press('Enter')
    await expect(missingList).toHaveCount(0)
    await expect(missing).toBeFocused()
    expect(calls).toEqual([CARDS, cardPath(saved)])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([])
  })
}

for (const action of ['switching groups', 'collapsing the chart']) {
  test(`Market role-domain drilldown ignores pending details after ${action}`, async ({ page, context, baseURL }) => {
    const held = Promise.withResolvers()
    const replied = Promise.withResolvers()
    const saved = cards[0]
    const path = cardPath(saved)
    const { summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, cards, {
      [path]: async route => {
        try {
          await held.promise
          await route.fulfill({ json: saved })
        } finally {
          replied.resolve()
        }
      },
    })
    const data = domainControl(chart, 'Datenanalyse', 3)
    const mobility = domainControl(chart, LONG_DOMAIN, 2)
    try {
      await summary.press('Enter')
      await data.press('Enter')
      const list = await expectContributors(chart, 'Saved Cards in Datenanalyse', cards.slice(0, 3))
      await savedJobControl(list, saved).press('Enter')
      await expect.poll(() => calls).toEqual([CARDS, path])
      if (action === 'switching groups') {
        await mobility.press('Enter')
        await expect(list).toHaveCount(0)
      } else {
        await summary.press('Enter')
        await expect(chart).not.toHaveAttribute('open', '')
      }
    } finally {
      held.resolve()
    }

    await replied.promise
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(chart.getByRole('alert')).toHaveCount(0)
    if (action === 'switching groups') {
      const list = await expectContributors(chart, `Saved Cards in ${LONG_DOMAIN}`, cards.slice(0, 2))
      await expect(savedJobControl(list, saved)).toBeEnabled()
      await expect(mobility).toBeFocused()
    } else {
      await summary.press('Enter')
      await expect(data).toHaveAttribute('aria-expanded', 'false')
      await expect(chart.getByRole('list', { name: 'Saved Cards in Datenanalyse', exact: true })).toHaveCount(0)
    }
    expect(calls).toEqual([CARDS, path])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([])
  })
}

for (const width of [1440, 900]) {
  test(`R009-01 Market keeps legible job titles and distinguishes same-name contributors at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const title = 'Werkstudentin für barrierefreie Fahrgastinformation und Verkehrsplanung'
    const company = 'Verbund für Schienenpersonennahverkehr (DEMO)'
    const berlin = 'Invalidenstraße 1, 10115 Berlin, Deutschland'
    const dresden = 'Wiener Platz 4, 01069 Dresden, Deutschland'
    const alias = 'Meine Auswahl für das Wintersemester'
    const unconfirmed = 'Nicht bestätigter Standort'
    const cases = [
      { alias: '', address: berlin, jobId: 'BE-21', detail: `${berlin} · Job ID: BE-21` },
      { alias: '  ', address: dresden, jobId: 'DD-42', detail: dresden },
      { alias: '\u200b', jobId: 'DE-63', detail: 'Job ID: DE-63' },
      { alias: null, detail: 'No distinguishing details recorded' },
      { alias: null, address: berlin, jobId: 'BE-84', detail: `${berlin} · Job ID: BE-84` },
      { alias, address: berlin },
    ]
    const sameNameCards = cases.map(({ alias, address, jobId }, index) => {
      const card = savedCard(21 + index, title, ['Datenanalyse'])
      card.posting_alias = alias
      card.posting.identity.company_name = { value: company, origin: 'source' }
      if (address) card.posting.work_conditions.primary_address = { value: address, origin: 'source' }
      if (jobId) card.posting.identity.external_job_id = { value: jobId, origin: 'source' }
      card.posting.work_conditions.address_candidates = [unconfirmed]
      return card
    })
    const selected = sameNameCards[1]
    const currentTitle = `${title} – aktualisiert`
    const current = structuredClone(selected)
    current.posting.identity.position_title.value = currentTitle
    const { main, summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, sameNameCards, {
      [cardPath(selected)]: route => route.fulfill({ json: current }),
    })
    const reference = main.getByRole('combobox', { name: 'Reference saved job', exact: true })
    await expect(reference.getByRole('option', { name: `${title} · ${company}`, exact: true })).toHaveCount(5)
    await expect(reference.getByRole('option', { name: `${alias} · ${company}`, exact: true })).toHaveCount(1)

    await summary.press('Enter')
    await chart.getByRole('button', { name: 'Datenanalyse 6 of 6', exact: true }).press('Enter')
    const contributors = chart.getByRole('list', { name: 'Saved Cards in Datenanalyse', exact: true })
    const rows = contributors.getByRole('listitem')
    await expect(rows).toHaveCount(cases.length)
    for (const [index, testCase] of cases.entries()) {
      const isAlias = testCase.alias === alias
      const displayedTitle = isAlias ? alias : title
      const row = rows.nth(index)
      await expect(row.getByRole('heading', { name: displayedTitle, exact: true })).toBeVisible()
      const accessibleSuffix = testCase.detail ? ` · ${testCase.detail}` : ''
      await expect(row.getByRole('button', { name: `View saved job: ${displayedTitle}${accessibleSuffix}`, exact: true })).toBeVisible()
      if (testCase.detail) await expect(row.getByText(testCase.detail, { exact: true })).toBeVisible()
      if (isAlias) await expect(row.getByText(berlin, { exact: true })).toHaveCount(0)
    }
    await expect(contributors.getByText(unconfirmed, { exact: true })).toHaveCount(0)
    await expect(contributors.getByText('DD-42')).toHaveCount(0)
    await contributors.scrollIntoViewIfNeeded()
    expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('role-domain-distinguished-contributors.png'), animations: 'disabled' })
    expect(calls).toEqual([CARDS])

    await page.keyboard.press('Tab')
    await expect(rows.nth(0).getByRole('button')).toBeFocused()
    await page.keyboard.press('Tab')
    const opener = contributors.getByRole('button', { name: `View saved job: ${title} · ${dresden}`, exact: true })
    await expect(opener).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: currentTitle, exact: true })).toBeVisible()
    await expect(dialog.locator('.posting-card-details__position-title')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(contributors.getByRole('button', { name: `View saved job: ${currentTitle}`, exact: true })).toBeFocused()
    expect(calls).toEqual([CARDS, cardPath(selected)])
    expect(unexpected).toEqual([])
    expect(diagnostics).toEqual([])
  })
}

test('Market role-domain drilldown retries a failed Card read from the same keyboard opener', async ({ page, context, baseURL }) => {
  const saved = cards[0]
  const path = cardPath(saved)
  let attempts = 0
  const { summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, cards, {
    [path]: route => ++attempts === 1
      ? route.fulfill({ status: 503, json: { detail: 'Synthetic detail failure' } })
      : route.fulfill({ json: saved }),
  })
  await summary.press('Enter')
  await domainControl(chart, 'Datenanalyse', 3).press('Enter')
  const list = chart.getByRole('list', { name: 'Saved Cards in Datenanalyse', exact: true })
  const opener = savedJobControl(list, saved)
  await opener.press('Enter')
  const alert = list.getByRole('alert')
  const dialog = page.getByRole('dialog')
  await expect(alert).toHaveText('Could not open the saved job. Try again.')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  expect(calls).toEqual([CARDS, path])

  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { name: positionTitle(saved), exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
  await expect(alert).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  expect(calls).toEqual([CARDS, path, path])
  expect(unexpected).toEqual([])
  expectOnlyDetailDiagnostic(diagnostics, path, 503)
})

function expectOnlyDetailDiagnostic(diagnostics, path, status) {
  expect(diagnostics.length).toBeLessThanOrEqual(1)
  for (const diagnostic of diagnostics) {
    expect(diagnostic).toEqual({ type: 'error', url: API + path, text: expect.stringContaining(String(status)) })
  }
}

const sixCards = [
  ...cards,
  savedCard(6, 'Werkstudentin für Arbeitsrecht und Personalberatung (DEMO)', ['Arbeitsrecht']),
]
const updatedCard = savedCard(4, 'Aktualisiertes Praktikum für regionale Fahrgastdatenanalyse im Rheinland (DEMO)', ['Datenanalyse'])
const updatedPath = cardPath(updatedCard)
const deletedPath = cardPath(cards[4])

for (const width of [1440, 900]) {
  test(`Market reconciles updated and deleted Cards from current detail reads at ${width}×1000`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const { main, summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, sixCards, {
      [updatedPath]: route => route.fulfill({ json: updatedCard }),
      [deletedPath]: route => route.fulfill({ status: 404, json: { detail: 'Posting card not found' } }),
    })
    const reference = main.getByRole('combobox', { name: 'Reference saved job', exact: true })
    await reference.press('Home')
    await page.keyboard.press('ArrowDown')
    await expect(reference).toHaveValue(cards[0].card_key)
    const relatedName = 'Related saved jobs'
    await expectContributors(main, relatedName, cards.slice(1, 3))

    await summary.press('Enter')
    await expect(chart.getByText('Based on 6 saved Cards.', { exact: true })).toBeVisible()
    await expect(domainControl(chart, 'Datenanalyse', 3, 6)).toBeVisible()
    await domainControl(chart, MISSING, 2, 6).press('Enter')
    const missingList = await expectContributors(chart, MISSING, cards.slice(3))
    expect(calls).toEqual([CARDS])

    await savedJobControl(missingList, cards[3]).press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: positionTitle(updatedCard), exact: true })).toBeVisible()
    await expect(dialog.getByText('Datenanalyse', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    const survivingGroup = domainControl(chart, MISSING, 1, 6)
    await expect(survivingGroup).toBeFocused()
    await expect(survivingGroup).toHaveAttribute('aria-expanded', 'true')
    await expect(domainControl(chart, 'Datenanalyse', 4, 6)).toBeVisible()
    await expectContributors(chart, MISSING, [cards[4]])
    await expectContributors(main, relatedName, [cards[1], cards[2], updatedCard])
    await expect(reference.locator(`option[value="${updatedCard.card_key}"]`)).toContainText(positionTitle(updatedCard))
    expect(calls).toEqual([CARDS, updatedPath])

    await page.keyboard.press('Tab')
    await expect(savedJobControl(missingList, cards[4])).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(chart.getByText('Based on 5 saved Cards.', { exact: true })).toBeVisible()
    await expect(chart.getByRole('alert')).toHaveText('This saved job is no longer available.')
    await expect(chart.getByText(MISSING, { exact: true }).locator('..')
      .getByText('0 of 5', { exact: true })).toBeVisible()
    await expect(chart.getByRole('button', { name: new RegExp(`^${MISSING}`) })).toHaveCount(0)
    await expect(missingList).toHaveCount(0)
    await expect(summary).toBeFocused()
    await expect(domainControl(chart, 'Datenanalyse', 4, 5)).toBeVisible()
    await expect(reference.locator(`option[value="${cards[4].card_key}"]`)).toHaveCount(0)
    await expectContributors(main, relatedName, [cards[1], cards[2], updatedCard])
    expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await chart.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('role-domain-current-counts.png'), animations: 'disabled' })
    await domainControl(chart, 'Datenanalyse', 4, 5).press('Enter')
    await expectContributors(chart, 'Saved Cards in Datenanalyse', [...cards.slice(0, 3), updatedCard])
    expect(calls).toEqual([CARDS, updatedPath, deletedPath])
    expect(unexpected).toEqual([])
    expectOnlyDetailDiagnostic(diagnostics, deletedPath, 404)
  })
}

for (const { status, width } of [{ status: 200, width: 1440 }, { status: 404, width: 900 }]) {
  test(`Market keeps saved data after an aborted ${status} and a transient Card read failure at ${width}×1000`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 900) await page.emulateMedia({ reducedMotion: 'reduce' })
    const held = Promise.withResolvers()
    const replied = Promise.withResolvers()
    const { summary, chart, calls, unexpected, diagnostics } = await enterMarket({ page, context, baseURL }, sixCards, {
      [updatedPath]: async route => {
        try {
          await held.promise
          await route.fulfill({ status, json: status === 200 ? updatedCard : { detail: 'Posting card not found' } })
        } finally {
          replied.resolve()
        }
      },
      [deletedPath]: route => route.fulfill({ status: 503, json: { detail: 'Synthetic temporary failure' } }),
    })
    const missing = domainControl(chart, MISSING, 2, 6)
    const data = domainControl(chart, 'Datenanalyse', 3, 6)
    try {
      await summary.press('Enter')
      await missing.press('Enter')
      const list = await expectContributors(chart, MISSING, cards.slice(3))
      await savedJobControl(list, cards[3]).press('Enter')
      await expect.poll(() => calls).toEqual([CARDS, updatedPath])
      await data.press('Enter')
      await expect(list).toHaveCount(0)
    } finally {
      held.resolve()
    }
    await replied.promise
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveCount(0)
    await expect(data).toBeFocused()
    await expect(chart.getByText('Based on 6 saved Cards.', { exact: true })).toBeVisible()
    await expect(chart.getByRole('alert')).toHaveCount(0)

    await missing.press('Enter')
    const list = await expectContributors(chart, MISSING, cards.slice(3))
    const opener = savedJobControl(list, cards[4])
    await opener.press('Enter')
    await expect(list.getByRole('alert')).toHaveText('Could not open the saved job. Try again.')
    await expect(opener).toBeFocused()
    await expect(dialog).toHaveCount(0)
    await expectContributors(chart, MISSING, cards.slice(3))
    await expect(data).toBeVisible()
    await expect(chart.getByText('Based on 6 saved Cards.', { exact: true })).toBeVisible()
    expect(calls).toEqual([CARDS, updatedPath, deletedPath])
    expect(unexpected).toEqual([])
    expectOnlyDetailDiagnostic(diagnostics, deletedPath, 503)
  })
}
