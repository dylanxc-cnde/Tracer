import { expect, test } from '@playwright/test'
import { postingFixture } from './fixtures/posting.mjs'

const API = 'http://127.0.0.1:8000'
const CREATED_AT = '2026-11-27T10:00:00Z'
const CARD_KEY = 'a0000000-0000-4000-8000-000000000033'
const SAVED_TITLE = 'Gespeicherte Werkstudentenstelle für Energieversorgung und Netzinfrastruktur (DEMO)'
const OLD_CARD_KEY = 'a0000000-0000-4000-8000-000000000036'
const OLD_SAVED_TITLE = 'Gespeichertes Praktikum in der Verkehrsplanung (DEMO)'
const oldCardPath = `/posting/card/${OLD_CARD_KEY}`

const A = postingFixture(
  'a0000000-0000-4000-8000-000000000031',
  'Praktikum in der Verkehrsplanung und Fahrgastinformation (DEMO)',
  {
    kind: 'text', source_url: null,
    text: 'Für unser fiktives Verkehrsunternehmen suchen wir Unterstützung bei Fahrgastzählungen und der barrierefreien Linieninformation.',
  },
)
const B = postingFixture(
  'a0000000-0000-4000-8000-000000000032',
  'Werkstudent (m/w/d) für Netzentgeltabrechnung und Energiewirtschaft (DEMO)',
  {
    kind: 'text', source_url: null,
    text: 'Bei uns unterstützt du das fiktive Netzteam bei der Netzentgeltabrechnung, wertest Messdaten aus und bereitest Rückfragen zur Tarifbindung vor.',
  },
)
const LINK = postingFixture(
  'a0000000-0000-4000-8000-000000000034',
  'Werkstudent (m/w/d) für barrierefreie Fahrgastinformation und Mobilitätsforschung (DEMO)',
  { kind: 'url', url: 'https://tracer-fixture.invalid/stellen/werkstudent-mobilitaetsforschung' },
)
const LOCATION_EXCERPT = 'Das Projektteam arbeitet in Köln und Düsseldorf. Deinen tatsächlichen Einsatzort teilen wir dir erst nach der endgültigen Projektzuteilung mit.'
const LOCATION_DESCRIPTION = 'Die Anzeige nennt Köln und Düsseldorf, lässt aber offen, an welchem Standort die Werkstudententätigkeit nach der Projektzuteilung tatsächlich ausgeübt wird.'
const ROLE_EXCERPT = 'Du wertest Fahrgastzählungen aus und erstellst barrierefreie Berichte für die regionale Verkehrsplanung.'
const ELIGIBILITY_EXCERPT = 'Du bist während der Beschäftigung an einer deutschen Hochschule immatrikuliert.'
const REQUIREMENT_EXCERPT = 'Kenntnisse in SQL oder Python sind erforderlich, zum Beispiel mit PostgreSQL. Erfahrung mit der Dokumentation technischer Änderungen wird ebenfalls erwähnt.'
const REVIEW_TITLE = 'Werkstudent (m/w/d) für barrierefreie Fahrgastinformation und Verkehrsplanung im Rheinland (DEMO)'
const REVIEW_SAVED_TITLE = 'Gespeicherte Werkstudentenstelle für Verkehrsplanung im Rheinland (DEMO)'
const REVIEW = postingFixture(
  'a0000000-0000-4000-8000-000000000037', REVIEW_TITLE,
  { kind: 'text', source_url: null, text: [REVIEW_TITLE, LOCATION_EXCERPT, ROLE_EXCERPT, ELIGIBILITY_EXCERPT, REQUIREMENT_EXCERPT].join('\n\n') },
)
REVIEW.ambiguities = [{
  field_path: 'work_conditions.primary_address', description: LOCATION_DESCRIPTION,
  alternatives: ['Köln', 'Düsseldorf'], source: { excerpts: [LOCATION_EXCERPT], source_urls: [] },
}]
REVIEW.details.role_content = {
  source: { excerpts: [ROLE_EXCERPT], source_urls: [] }, role_summary: null, domains: [],
  responsibilities: [{ origin: 'source', value: 'Fahrgastzählungen auswerten und barrierefreie Berichte erstellen' }],
}
REVIEW.details.classification = {
  ...REVIEW.details.classification,
  source: { excerpts: [ELIGIBILITY_EXCERPT], source_urls: [] },
  eligibility: { origin: 'source', value: 'Immatrikulation an einer deutschen Hochschule' },
}
REVIEW.details.requirements = {
  source: { excerpts: [REQUIREMENT_EXCERPT], source_urls: [] },
  groups: [
    { origin: 'source', importance: 'required', item_rule: 'any_of', items: [
      { name: 'SQL', category: 'skill', is_example: false },
      { name: 'Python', category: 'skill', is_example: false },
      { name: 'PostgreSQL', category: 'skill', is_example: true },
    ] },
    { origin: 'source', importance: 'unknown', item_rule: 'unknown', items: [
      { name: 'Dokumentation technischer Änderungen', category: 'experience', is_example: false },
    ] },
  ],
}
const REPLACEMENT_A = { ...A, importKey: 'a0000000-0000-4000-8000-000000000035' }
const MULTIPLE = {
  ...A,
  importKey: 'a0000000-0000-4000-8000-000000000039',
  importSource: { kind: 'text', source_url: null, text: [A.title, A.importSource.text, B.title, B.importSource.text].join('\n\n') },
  proposals: [A, B].map(({ details }) => ({ details, parse_ambiguities: [] })),
}
const fixtures = [A, B, LINK, REVIEW, MULTIPLE]
const parsePath = (posting) => `/posting/import/${posting.importKey}/parse-results`

async function openImport(
  { page, context, baseURL },
  { releaseA, releaseCard, releaseDelete, resultA, failFirstParse, failFirstCard = false, replaceMissingA } = {},
) {
  const imports = []
  const parses = []
  const cards = []
  const deletes = []
  const unexpected = []
  const savedFixtures = replaceMissingA ? [...fixtures, REPLACEMENT_A] : fixtures

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'POST') {
      if (url.pathname === '/posting/import') {
        const body = request.postDataJSON()
        imports.push(body)
        const posting = fixtures.find(({ importSource }) => importSource.kind === body.kind
          && (importSource.kind === 'text' ? importSource.text === body.text : importSource.url === body.url))
        if (posting) {
          const savedPosting = posting === A && replaceMissingA && parses.includes(A.importKey) ? REPLACEMENT_A : posting
          await route.fulfill({ status: 201, json: {
            import_key: savedPosting.importKey, schema_version: 1, submitted_at: CREATED_AT, source: savedPosting.importSource,
          } })
          return
        }
      }
      const posting = savedFixtures.find((fixture) => parsePath(fixture) === url.pathname)
      if (posting) {
        const fail = posting === failFirstParse && !parses.includes(posting.importKey)
        parses.push(posting.importKey)
        if (posting === A && replaceMissingA) {
          await route.fulfill({ status: 404, json: { detail: 'Synthetic import missing' } })
          return
        }
        if (fail) {
          await route.fulfill({ status: 503, json: { detail: 'Synthetic parser unavailable' } })
          return
        }
        if (posting === A) await releaseA
        const completeResult = {
          status: 'complete', postings: posting.proposals ?? [{ details: posting.details, parse_ambiguities: posting.ambiguities ?? [] }],
          refinement_reason: null, refinement_suggestions: [],
        }
        await route.fulfill({ json: (posting === A ? resultA : undefined) ?? completeResult })
        return
      }
      if (url.pathname === '/posting/card') {
        const body = request.postDataJSON()
        cards.push(body)
        const savedPosting = savedFixtures.find(({ importKey }) => importKey === body.import_key)
        if (savedPosting) {
          await releaseCard
          if (failFirstCard && cards.length === 1) {
            await route.fulfill({ status: 409, json: { detail: 'Synthetic Card save rejected' } })
            return
          }
          const cardKey = savedPosting === A ? OLD_CARD_KEY : CARD_KEY
          let postingAlias = SAVED_TITLE
          if (savedPosting === A || savedPosting === MULTIPLE) postingAlias = OLD_SAVED_TITLE
          if (savedPosting === REVIEW) postingAlias = REVIEW_SAVED_TITLE
          await route.fulfill({ status: 201, json: {
            card_key: cardKey, import_key: savedPosting.importKey, schema_version: 1, created_at: CREATED_AT,
            posting: savedPosting.details, posting_alias: postingAlias, user_notes: null, tags: [],
          } })
          return
        }
      }
    }
    if (url.origin === API && request.method() === 'DELETE' && url.pathname === oldCardPath && releaseDelete) {
      deletes.push(OLD_CARD_KEY)
      await releaseDelete
      await route.fulfill({ status: 204 })
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
  await expect(page.getByRole('heading', { name: 'Import posting' })).toBeVisible()
  return {
    input: page.getByPlaceholder('Paste a job posting here'),
    analyze: page.getByRole('button', { name: 'Analyze', exact: true }),
    confirm: page.getByRole('button', { name: 'Confirm and save', exact: true }),
    imports, parses, cards, deletes, unexpected,
  }
}

test('Posting import discards a selected proposal after the source changes and saves only the new confirmed proposal', async ({ page, context, baseURL }) => {
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport({ page, context, baseURL })
  await input.fill(A.importSource.text)
  await analyze.click()
  await expect(page.getByRole('heading', { name: A.title })).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(confirm).toBeEnabled()
  expect(cards).toEqual([])

  await input.fill(B.importSource.text)
  await expect(page.getByRole('heading', { name: A.title })).toHaveCount(0)
  await expect(confirm).toHaveCount(0)
  expect(cards).toEqual([])

  await analyze.click()
  await expect(page.getByRole('heading', { name: B.title })).toBeVisible()
  await expect(confirm).toBeDisabled()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(confirm).toBeEnabled()
  expect(cards).toEqual([])
  await confirm.click()
  await expect(page.getByRole('heading', { name: SAVED_TITLE })).toBeVisible()
  await page.getByRole('button', { name: 'View details' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: SAVED_TITLE })).toBeVisible()

  expect(imports).toEqual([A.importSource, B.importSource])
  expect(parses).toEqual([A.importKey, B.importKey])
  expect(cards).toEqual([{
    import_key: B.importKey, posting: B.details, posting_alias: null, user_notes: null, tags: [],
  }])
  expect(unexpected).toEqual([])
})

test('Posting import reviews proposal uncertainties and source evidence before explicit selection and save', async ({ page, context, baseURL }) => {
  const { input, analyze, confirm, imports, parses, cards, deletes, unexpected } = await openImport({ page, context, baseURL })
  await input.fill(REVIEW.importSource.text)
  await analyze.click()

  const candidate = page.getByRole('article', { name: REVIEW.title })
  const review = candidate.getByText('Review proposal', { exact: true })
  const uncertainties = candidate.getByRole('heading', { name: 'Uncertainties' })
  const uncertaintySource = candidate.getByText('View uncertainty source', { exact: true })
  const locationQuote = candidate.getByText(LOCATION_EXCERPT, { exact: true })

  await expect(candidate.getByText('Unknown location', { exact: true })).toBeVisible()
  await expect(candidate.getByText('Location needs review', { exact: true })).toBeVisible()
  await expect(review).toHaveAccessibleDescription(`${REVIEW.title} Location needs review`)
  await expect(confirm).toBeDisabled()
  await expect(uncertainties).toBeHidden()
  await review.focus()
  await page.keyboard.press('Enter')
  await expect(review).toBeFocused()
  await expect(uncertainties).toBeVisible()
  await expect(candidate.getByText('Location', { exact: true })).toBeVisible()
  await expect(candidate.getByText(LOCATION_DESCRIPTION, { exact: true })).toBeVisible()
  await expect(candidate.getByText('Köln', { exact: true })).toBeVisible()
  await expect(candidate.getByText('Düsseldorf', { exact: true })).toBeVisible()
  await expect(locationQuote).toBeHidden()
  await uncertaintySource.focus()
  await page.keyboard.press('Space')
  await expect(uncertaintySource).toBeFocused()
  await expect(locationQuote).toBeVisible()

  await expect(candidate.getByRole('heading', { name: 'Role and responsibilities' })).toBeVisible()
  await expect(candidate.getByText('Fahrgastzählungen auswerten und barrierefreie Berichte erstellen', { exact: true })).toBeVisible()
  await expect(candidate.getByRole('heading', { name: 'Requirements' })).toBeVisible()
  await expect(candidate.getByText('Immatrikulation an einer deutschen Hochschule', { exact: false })).toBeVisible()
  const requiredGroup = candidate.getByRole('listitem').filter({ has: page.getByText('Required', { exact: true }) })
  await expect(requiredGroup.getByText('Choose any one', { exact: true })).toBeVisible()
  await expect(requiredGroup.getByText('SQL', { exact: true })).toBeVisible()
  await expect(requiredGroup.getByText('Python', { exact: true })).toBeVisible()
  const examplesLabel = requiredGroup.getByText('Examples', { exact: true })
  await expect(examplesLabel).toBeVisible()
  await expect(examplesLabel.locator('+ ul').getByText('PostgreSQL', { exact: true })).toBeVisible()
  const unknownGroup = candidate.getByRole('listitem').filter({ has: page.getByText('Importance unknown', { exact: true }) })
  await expect(unknownGroup.getByText('Combination unclear', { exact: true })).toBeVisible()
  await expect(unknownGroup.getByText('Dokumentation technischer Änderungen', { exact: true })).toBeVisible()

  const roleQuote = candidate.getByText(ROLE_EXCERPT, { exact: true })
  const eligibilityQuote = candidate.getByText(ELIGIBILITY_EXCERPT, { exact: true })
  const requirementQuote = candidate.getByText(REQUIREMENT_EXCERPT, { exact: true })
  await expect(roleQuote).toBeHidden()
  await expect(eligibilityQuote).toBeHidden()
  await expect(requirementQuote).toBeHidden()
  await candidate.getByText('View role source', { exact: true }).press('Enter')
  await expect(roleQuote).toBeVisible()
  await expect(eligibilityQuote).toBeHidden()
  await candidate.getByText('View eligibility source', { exact: true }).press('Enter')
  await expect(eligibilityQuote).toBeVisible()
  await expect(requirementQuote).toBeHidden()
  await candidate.getByText('View requirements source', { exact: true }).press('Enter')
  await expect(requirementQuote).toBeVisible()

  await review.focus()
  await page.keyboard.press('Space')
  await expect(review).toBeFocused()
  await expect(uncertainties).toBeHidden()
  await expect(locationQuote).toBeHidden()
  expect(imports).toEqual([REVIEW.importSource])
  expect(parses).toEqual([REVIEW.importKey])
  expect(cards).toEqual([])

  await candidate.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(confirm).toBeEnabled()
  expect(cards).toEqual([])
  await confirm.click()
  await expect(page.getByRole('heading', { name: REVIEW_SAVED_TITLE })).toBeVisible()
  expect(imports).toEqual([REVIEW.importSource])
  expect(parses).toEqual([REVIEW.importKey])
  expect(cards).toEqual([{
    import_key: REVIEW.importKey, posting: REVIEW.details, posting_alias: null, user_notes: null, tags: [],
  }])
  expect(deletes).toEqual([])
  expect(unexpected).toEqual([])
})

test('Posting import validates a link and saves the link proposal only after review', async ({ page, context, baseURL }) => {
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport({ page, context, baseURL })
  const source = page.getByRole('group', { name: 'Posting source' })
  const textMode = source.getByRole('radio', { name: 'Text', exact: true })
  const linkMode = source.getByRole('radio', { name: 'Link', exact: true })
  const linkInput = page.getByRole('textbox', { name: 'Posting link', exact: true })
  const invalidLink = 'file:///local-job-posting'
  const linkError = page.getByText('Enter an HTTP or HTTPS job posting link.', { exact: true })

  await expect(textMode).toBeChecked()
  await input.fill(A.importSource.text)
  await analyze.click()
  await expect(page.getByRole('heading', { name: A.title })).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(confirm).toBeEnabled()

  await textMode.focus()
  await textMode.press('ArrowRight')
  await expect(linkMode).toBeChecked()
  await expect(linkMode).toBeFocused()
  await expect(page.getByRole('heading', { name: A.title })).toHaveCount(0)
  await expect(confirm).toHaveCount(0)
  await linkInput.fill('kein Stellenlink')
  await expect(linkError).toBeVisible()
  await expect(analyze).toBeDisabled()
  await linkInput.fill(invalidLink)
  await expect(linkError).toBeVisible()
  await expect(analyze).toBeDisabled()
  expect(imports).toEqual([A.importSource])
  expect(parses).toEqual([A.importKey])
  expect(cards).toEqual([])

  await linkMode.focus()
  await linkMode.press('ArrowLeft')
  await expect(textMode).toBeChecked()
  await expect(input).toHaveValue(A.importSource.text)
  await expect(confirm).toHaveCount(0)
  await textMode.press('ArrowRight')
  await expect(linkMode).toBeChecked()
  await expect(linkInput).toHaveValue(invalidLink)

  await linkInput.fill(`  ${LINK.importSource.url}  `)
  await expect(linkError).toHaveCount(0)
  await analyze.click()
  await expect(page.getByRole('heading', { name: LINK.title })).toBeVisible()
  await expect(confirm).toBeDisabled()
  expect(imports).toEqual([A.importSource, LINK.importSource])
  expect(parses).toEqual([A.importKey, LINK.importKey])
  expect(cards).toEqual([])

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(confirm).toBeEnabled()
  expect(cards).toEqual([])
  await confirm.click()
  await expect(page.getByRole('heading', { name: SAVED_TITLE })).toBeVisible()
  await page.getByRole('button', { name: 'View details' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: SAVED_TITLE })).toBeVisible()
  expect(cards).toEqual([{
    import_key: LINK.importKey, posting: LINK.details, posting_alias: null, user_notes: null, tags: [],
  }])
  expect(unexpected).toEqual([])
})

for (const { mode, fixture, value } of [
  { mode: 'text', fixture: A, value: A.importSource.text },
  { mode: 'link', fixture: LINK, value: LINK.importSource.url },
]) {
  test(`Posting import retries parsing the same ${mode} only after Analyze is pressed again`, async ({ page, context, baseURL }) => {
    await page.clock.install()
    const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
      { page, context, baseURL }, { failFirstParse: fixture },
    )
    const linkInput = page.getByRole('textbox', { name: 'Posting link', exact: true })
    if (mode === 'link') await page.getByRole('radio', { name: 'Link', exact: true }).check()
    const sourceInput = mode === 'link' ? linkInput : input
    const error = page.getByRole('main').getByRole('alert')

    await sourceInput.fill(value)
    await analyze.click()
    await expect(error).toBeVisible()
    await expect(sourceInput).toHaveValue(value)
    await expect(analyze).toBeEnabled()
    await expect(confirm).toHaveCount(0)
    await page.clock.fastForward(10_000)
    expect(imports).toEqual([fixture.importSource])
    expect(parses).toEqual([fixture.importKey])
    expect(cards).toEqual([])

    await analyze.click()
    await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible()
    await expect(error).toHaveCount(0)
    await expect(confirm).toBeDisabled()
    expect(imports).toEqual([fixture.importSource])
    expect(parses).toEqual([fixture.importKey, fixture.importKey])
    expect(cards).toEqual([])
    expect(unexpected).toEqual([])
  })
}

test('Posting import creates a new import when the source changes after a parse failure', async ({ page, context, baseURL }) => {
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
    { page, context, baseURL }, { failFirstParse: A },
  )
  const error = page.getByRole('main').getByRole('alert')
  await input.fill(A.importSource.text)
  await analyze.click()
  await expect(error).toBeVisible()

  await input.fill(B.importSource.text)
  await expect(error).toHaveCount(0)
  await analyze.click()
  await expect(page.getByRole('heading', { name: B.title })).toBeVisible()
  await expect(confirm).toBeDisabled()
  expect(imports).toEqual([A.importSource, B.importSource])
  expect(parses).toEqual([A.importKey, B.importKey])
  expect(cards).toEqual([])
  expect(unexpected).toEqual([])
})

test('Posting import recreates a missing import only after Analyze is pressed again', async ({ page, context, baseURL }) => {
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
    { page, context, baseURL }, { replaceMissingA: true },
  )
  const error = page.getByRole('main').getByRole('alert')
  await input.fill(A.importSource.text)
  await analyze.click()
  await expect(error).toHaveText('This import is no longer available. Analyze the source again.')
  await expect(input).toHaveValue(A.importSource.text)
  await expect(analyze).toBeEnabled()
  expect(imports).toEqual([A.importSource])
  expect(parses).toEqual([A.importKey])

  await analyze.click()
  await expect(page.getByRole('heading', { name: A.title })).toBeVisible()
  await expect(error).toHaveCount(0)
  await expect(confirm).toBeDisabled()
  expect(imports).toEqual([A.importSource, A.importSource])
  expect(parses).toEqual([A.importKey, REPLACEMENT_A.importKey])
  expect(cards).toEqual([])
  expect(unexpected).toEqual([])
})

const additionalSource = 'Ergänze die vollständigen Abschnitte zu Aufgaben, Voraussetzungen und Arbeitszeit während der Vorlesungszeit.'

for (const { resultA, message } of [
  {
    resultA: {
      status: 'refinement_required',
      postings: [{ details: A.details, parse_ambiguities: [] }],
      refinement_reason: 'insufficient_detail',
      refinement_suggestions: [additionalSource],
    },
    message: 'The source only includes part of the posting. Add more of the posting and analyze again.',
  },
  {
    resultA: {
      status: 'not_found', postings: [], refinement_reason: null, refinement_suggestions: [],
    },
    message: 'No job posting found. Try a direct posting link or paste the full text, then analyze again.',
  },
]) {
  test(`Posting import guides a new analysis after ${resultA.status}`, async ({ page, context, baseURL }) => {
    const { input, analyze, confirm, parses, cards, unexpected } = await openImport(
      { page, context, baseURL }, { resultA },
    )
    await input.fill(A.importSource.text)
    await analyze.click()
    const feedback = page.getByRole('main').getByRole('status')
    await expect(feedback).toContainText(message)
    await expect(input).toHaveValue(A.importSource.text)
    if (resultA.status === 'refinement_required') {
      await expect(feedback.getByRole('listitem')).toHaveText(additionalSource)
      await expect(page.getByRole('heading', { name: A.title })).toBeVisible()
      await expect(confirm).toBeDisabled()
    } else {
      await expect(confirm).toHaveCount(0)
    }
    expect(cards).toEqual([])

    await input.fill(B.importSource.text)
    await expect(feedback).toBeEmpty()
    await analyze.click()
    await expect(page.getByRole('heading', { name: B.title })).toBeVisible()
    await expect(feedback).toHaveText('Review the proposed posting before saving.')
    expect(parses).toEqual([A.importKey, B.importKey])
    expect(cards).toEqual([])
    expect(unexpected).toEqual([])
  })
}

test('Posting import ignores a parse response for source text edited while parsing', async ({ page, context, baseURL }) => {
  const gate = Promise.withResolvers()
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
    { page, context, baseURL }, { releaseA: gate.promise },
  )
  const firstResponse = page.waitForResponse(`${API}${parsePath(A)}`)
  try {
    await input.fill(A.importSource.text)
    await analyze.click()
    await expect.poll(() => parses).toEqual([A.importKey])
    await input.fill(B.importSource.text)
  } finally {
    gate.resolve()
  }

  expect(await (await firstResponse).finished()).toBeNull()
  await expect(analyze).toBeEnabled()
  await expect(input).toHaveValue(B.importSource.text)
  await expect(page.getByRole('heading', { name: A.title })).toHaveCount(0)
  await expect(confirm).toHaveCount(0)
  expect(cards).toEqual([])

  await analyze.click()
  await expect(page.getByRole('heading', { name: B.title })).toBeVisible()
  await expect(confirm).toBeDisabled()
  expect(imports).toEqual([A.importSource, B.importSource])
  expect(parses).toEqual([A.importKey, B.importKey])
  expect(cards).toEqual([])
  expect(unexpected).toEqual([])
})

test('Posting import waits for the confirmed Card before analyzing edited source text', async ({ page, context, baseURL }) => {
  const gate = Promise.withResolvers()
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
    { page, context, baseURL }, { releaseCard: gate.promise },
  )
  await input.fill(B.importSource.text)
  await analyze.click()
  await expect(page.getByRole('heading', { name: B.title })).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()

  try {
    await confirm.click()
    await expect.poll(() => cards).toEqual([{
      import_key: B.importKey, posting: B.details, posting_alias: null, user_notes: null, tags: [],
    }])
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await input.fill(A.importSource.text)
    await expect(input).toHaveValue(A.importSource.text)
    await expect(analyze).toBeDisabled()
    await expect(page.getByRole('heading', { name: SAVED_TITLE })).toHaveCount(0)
    expect(imports).toEqual([B.importSource])
    expect(parses).toEqual([B.importKey])
  } finally {
    gate.resolve()
  }

  await expect(page.getByRole('heading', { name: SAVED_TITLE })).toBeVisible()
  await expect(analyze).toBeEnabled()
  expect(imports).toEqual([B.importSource])
  await analyze.click()
  await expect(page.getByRole('heading', { name: A.title })).toBeVisible()
  await expect(confirm).toBeDisabled()
  expect(imports).toEqual([B.importSource, A.importSource])
  expect(parses).toEqual([B.importKey, A.importKey])
  expect(cards).toHaveLength(1)
  expect(unexpected).toEqual([])
})

test('Posting import preserves the confirmed candidate while saving and after success', async ({ page, context, baseURL }) => {
  const gate = Promise.withResolvers()
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
    { page, context, baseURL }, { releaseCard: gate.promise },
  )
  const candidateA = page.getByRole('article', { name: A.title })
  const candidateB = page.getByRole('article', { name: B.title })
  const selectB = candidateB.getByRole('button', { name: 'Select', exact: true })
  const reviewB = candidateB.getByText('Review proposal', { exact: true })
  await input.fill(MULTIPLE.importSource.text)
  await analyze.click()
  await expect(selectB).toBeEnabled()
  await candidateA.getByRole('button', { name: 'Select', exact: true }).click()

  const expectedCard = {
    import_key: MULTIPLE.importKey, posting: A.details, posting_alias: null, user_notes: null, tags: [],
  }
  try {
    await confirm.click()
    await expect.poll(() => cards).toEqual([expectedCard])
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
    await expect(selectB).toBeDisabled()
    await expect(candidateA.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
    await reviewB.focus()
    await page.keyboard.press('Enter')
    await expect(reviewB).toBeFocused()
    await expect(candidateB.getByRole('heading', { name: 'Role and responsibilities' })).toBeVisible()
    await expect(candidateB.getByText('Requirement groups unknown', { exact: true })).toBeVisible()
    expect(cards).toEqual([expectedCard])
  } finally {
    gate.resolve()
  }

  const receipt = page.getByRole('heading', { name: OLD_SAVED_TITLE })
  await expect(receipt).toBeVisible()
  await expect(selectB).toBeDisabled()
  await expect(candidateA.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await expect(candidateB.getByRole('heading', { name: 'Role and responsibilities' })).toBeVisible()
  expect(imports).toEqual([MULTIPLE.importSource])
  expect(parses).toEqual([MULTIPLE.importKey])
  expect(cards).toEqual([expectedCard])
  expect(unexpected).toEqual([])
})

test('Posting import unlocks another candidate after an explicit Card save rejection', async ({ page, context, baseURL }) => {
  const { input, analyze, confirm, imports, parses, cards, unexpected } = await openImport(
    { page, context, baseURL }, { failFirstCard: true },
  )
  const candidateA = page.getByRole('article', { name: A.title })
  const candidateB = page.getByRole('article', { name: B.title })
  await input.fill(MULTIPLE.importSource.text)
  await analyze.click()
  await candidateA.getByRole('button', { name: 'Select', exact: true }).click()
  await confirm.click()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await expect(candidateA.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await candidateB.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(candidateB.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await expect(confirm).toBeEnabled()
  expect(imports).toEqual([MULTIPLE.importSource])
  expect(parses).toEqual([MULTIPLE.importKey])
  expect(cards.map(({ posting }) => posting)).toEqual([A.details])
  expect(unexpected).toEqual([])
})

test('Posting import keeps a newly saved Card when an earlier delete finishes', async ({ page, context, baseURL }) => {
  const gate = Promise.withResolvers()
  const { input, analyze, confirm, imports, parses, cards, deletes, unexpected } = await openImport(
    { page, context, baseURL }, { releaseDelete: gate.promise },
  )
  const select = page.getByRole('button', { name: 'Select', exact: true })
  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })
  const newSummary = page.getByRole('article').filter({ has: page.getByRole('heading', { name: SAVED_TITLE }) })
  await input.fill(A.importSource.text)
  await analyze.click()
  await expect(page.getByRole('heading', { name: A.title })).toBeVisible()
  await select.click()
  await confirm.click()
  await expect(page.getByRole('heading', { name: OLD_SAVED_TITLE })).toBeVisible()

  let deletion
  try {
    page.once('dialog', (dialog) => dialog.accept())
    await deleteButton.click()
    await expect.poll(() => deletes).toEqual([OLD_CARD_KEY])
    await expect(page.getByRole('button', { name: 'Deleting...', exact: true })).toBeDisabled()

    await input.fill(B.importSource.text)
    await analyze.click()
    await expect(page.getByRole('heading', { name: B.title })).toBeVisible()
    await select.click()
    await confirm.click()
    await expect(newSummary).toBeVisible()
    deletion = page.waitForResponse(`${API}${oldCardPath}`)
  } finally {
    gate.resolve()
  }

  expect((await deletion).status()).toBe(204)
  await expect(page.getByRole('button', { name: 'Deleting...', exact: true })).toHaveCount(0)
  await expect(newSummary).toBeVisible()
  await newSummary.getByRole('button', { name: 'View details' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: SAVED_TITLE })).toBeVisible()
  expect(imports).toEqual([A.importSource, B.importSource])
  expect(parses).toEqual([A.importKey, B.importKey])
  expect(cards.map(({ import_key }) => import_key)).toEqual([A.importKey, B.importKey])
  expect(deletes).toEqual([OLD_CARD_KEY])
  expect(unexpected).toEqual([])
})
