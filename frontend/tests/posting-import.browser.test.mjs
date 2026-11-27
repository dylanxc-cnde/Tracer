import { expect, test } from '@playwright/test'

const API = 'http://127.0.0.1:8000'
const CREATED_AT = '2026-11-27T10:00:00Z'
const CARD_KEY = 'a0000000-0000-4000-8000-000000000033'
const SAVED_TITLE = 'Gespeicherte Werkstudentenstelle für Energieversorgung und Netzinfrastruktur (DEMO)'

function postingFixture(importKey, title, text) {
  const source = { excerpts: [], source_urls: [] }
  const details = {
    identity: {
      source, company_name: null, department_name: null, position_title: { value: title, origin: 'source' },
      external_job_id: null, canonical_posting_url: null, source_platform: null, published_on: null, posting_language: null,
    },
    company: { source, industry_tags: [], employee_range: null, company_summary: null },
    classification: {
      source, role_families: null, workload_type: null, contract_type: null, seniority: null,
      internship_requirement: null, eligibility: null,
    },
    work_conditions: {
      source, primary_address: null, address_candidates: [], work_modes: null, weekly_hours: null,
      schedule: null, travel_requirement: null, start_on: null, duration: null,
    },
    role_content: { source, role_summary: null, responsibilities: [], domains: [] },
    requirements: { source, groups: [] },
    compensation: { source, entries: [], benefits: [], vacation_days: null },
    application_instructions: {
      source, channels: null, application_url: null, required_email_subject: null,
      required_documents: [], special_instructions: [], application_deadline: null,
    },
    contact: null,
  }
  return { importKey, title, details, importSource: { kind: 'text', text, source_url: null } }
}

const A = postingFixture(
  'a0000000-0000-4000-8000-000000000031',
  'Praktikum in der Verkehrsplanung und Fahrgastinformation (DEMO)',
  'Für unser fiktives Verkehrsunternehmen suchen wir Unterstützung bei Fahrgastzählungen und der barrierefreien Linieninformation.',
)
const B = postingFixture(
  'a0000000-0000-4000-8000-000000000032',
  'Werkstudent (m/w/d) für Netzentgeltabrechnung und Energiewirtschaft (DEMO)',
  'Bei uns unterstützt du das fiktive Netzteam bei der Netzentgeltabrechnung, wertest Messdaten aus und bereitest Rückfragen zur Tarifbindung vor.',
)
const parsePath = (posting) => `/posting/import/${posting.importKey}/parse-results`

async function openImport({ page, context, baseURL }, { releaseA, releaseCard } = {}) {
  const imports = []
  const parses = []
  const cards = []
  const unexpected = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API && request.method() === 'POST') {
      if (url.pathname === '/posting/import') {
        const body = request.postDataJSON()
        imports.push(body)
        const posting = [A, B].find(({ importSource }) => importSource.text === body.text)
        if (posting) {
          await route.fulfill({ status: 201, json: {
            import_key: posting.importKey, schema_version: 1, submitted_at: CREATED_AT, source: posting.importSource,
          } })
          return
        }
      }
      const posting = [A, B].find((fixture) => parsePath(fixture) === url.pathname)
      if (posting) {
        parses.push(posting.importKey)
        if (posting === A) await releaseA
        await route.fulfill({ json: {
          status: 'complete', postings: [{ details: posting.details, parse_ambiguities: [] }],
          refinement_reason: null, refinement_suggestions: [],
        } })
        return
      }
      if (url.pathname === '/posting/card') {
        cards.push(request.postDataJSON())
        await releaseCard
        await route.fulfill({ status: 201, json: {
          card_key: CARD_KEY, import_key: B.importKey, schema_version: 1, created_at: CREATED_AT,
          posting: B.details, posting_alias: SAVED_TITLE, user_notes: null, tags: [],
        } })
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
  await expect(page.getByRole('heading', { name: 'Import posting' })).toBeVisible()
  return {
    input: page.getByPlaceholder('Paste a job posting here'),
    analyze: page.getByRole('button', { name: 'Analyze', exact: true }),
    confirm: page.getByRole('button', { name: 'Confirm and save', exact: true }),
    imports, parses, cards, unexpected,
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
