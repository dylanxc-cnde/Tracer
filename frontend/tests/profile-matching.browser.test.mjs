import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

// Profile / Goal / local match review in the real App DOM. Imported by
// settings-providers.browser.test.mjs, which is the only file Playwright discovers.
// Every API and WebSocket request is answered by a closed in-test mock: no real
// backend, database, credential store, supplier or model. The mock returns canned
// server confirmations; it never computes a match, so the assertions check what the
// real components send and display, not an aggregation re-implemented here.
// All content is synthetic DEMO data. Mocked browser runs prove no real persistence.

const API = 'http://127.0.0.1:8000'
const CARD_KEY = 'c0000000-0000-4000-8000-0000000000c1'
const IMPORT_KEY = 'c0000000-0000-4000-8000-0000000000a1'
const MATCH_ID = 'a0000000-0000-4000-8000-000000000001'
const PROFILE_ID = 'b0000000-0000-4000-8000-000000000001'
const GOAL_ID = 'b0000000-0000-4000-8000-000000000002'
const E_QUAL = 'e0000000-0000-4000-8000-000000000001'
const E_SKILL = 'e0000000-0000-4000-8000-000000000002'
const C_LOC = 'd0000000-0000-4000-8000-000000000001'

const LONG_TITLE = 'Werkstudent (m/w/d) Datenanalyse, Reporting und Marktkommunikation für Netzentgeltabrechnung und Energiewirtschaft (DEMO)'
const LONG_COMPANY = 'Süddeutsche Energieversorgungs- und Netzinfrastrukturgesellschaft mit beschränkter Haftung (DEMO)'
const ELIGIBILITY_TEXT = 'Immatrikulation an einer deutschen Hochschule während der gesamten Vertragslaufzeit erforderlich (DEMO)'
const NOT_ENROLLED = 'Aktuell nicht immatrikuliert, Abschluss 2025 (DEMO)'
const SKILL_DETAIL = 'Drei Kursprojekte mit echten Verkehrsdaten (DEMO)'
const SETTINGS = { user: { display_name: 'Demo Student' }, ai: { providers: [], tasks: [] } }

// ------------------------------------------------------------------ fixtures

const emptySource = () => ({ excerpts: [], source_urls: [] })
const fact = (value) => ({ value, origin: 'source' })
const item = (name) => ({ name, category: 'skill', is_example: false })

function postingDetails() {
  return {
    identity: {
      source: emptySource(), company_name: fact(LONG_COMPANY), department_name: null,
      position_title: fact(LONG_TITLE), external_job_id: null, canonical_posting_url: null,
      source_platform: null, published_on: null, posting_language: null,
    },
    company: { source: emptySource(), industry_tags: [], employee_range: null, company_summary: null },
    classification: {
      source: emptySource(), role_families: null, workload_type: null, contract_type: null,
      seniority: null, internship_requirement: null, eligibility: fact(ELIGIBILITY_TEXT),
    },
    work_conditions: {
      source: emptySource(), primary_address: fact('München'), address_candidates: [], work_modes: null,
      weekly_hours: null, schedule: null, travel_requirement: null, start_on: null, duration: null,
    },
    role_content: { source: emptySource(), role_summary: null, responsibilities: [], domains: [] },
    requirements: {
      source: emptySource(),
      groups: [
        { origin: 'source', importance: 'required', item_rule: 'all_of', items: [item('Python')] },
        { origin: 'source', importance: 'required', item_rule: 'any_of', items: [item('SQL'), item('R')] },
      ],
    },
    compensation: { source: emptySource(), entries: [], benefits: [], vacation_days: null },
    application_instructions: {
      source: emptySource(), channels: null, application_url: null, required_email_subject: null,
      required_documents: [], special_instructions: [], application_deadline: null,
    },
    contact: null,
  }
}

const POSTING = postingDetails()
const CARD = {
  card_key: CARD_KEY, import_key: IMPORT_KEY, schema_version: 1, created_at: '2026-10-14T10:00:00Z',
  posting: POSTING, posting_alias: null, user_notes: null, tags: [],
}

const profileDoc = (revision = 1) => ({
  profile_id: PROFILE_ID, revision, confirmed_at: '2026-10-15T08:00:00Z',
  evidence: [
    { evidence_id: E_QUAL, kind: 'qualification', label: NOT_ENROLLED, description: 'Exmatrikulation zum 31.03.2025 (DEMO)' },
    { evidence_id: E_SKILL, kind: 'skill', label: 'Python', description: SKILL_DETAIL },
  ],
})
const goalDoc = (revision = 1) => ({
  goal_id: GOAL_ID, revision, confirmed_at: '2026-10-15T08:05:00Z', objective: null,
  constraints: [{ constraint_id: C_LOC, kind: 'location', label: 'Nur Berlin', description: null, importance: 'required' }],
})

function inputsOf(fingerprint, { posting = 'posting-rev-1', profile = 1, goal = 1 } = {}) {
  return { fingerprint, posting_revision: posting, profile_revision: profile, goal_revision: goal, rule_revision: 'rules-1' }
}

// Group/target identities are opaque server ids; a suffix gives a new review new ones.
function groupsOf(sfx = '') {
  const target = (id, label, extra = {}) => ({
    target_id: `t-${id}${sfx}`, label, is_example: false, posting_available: true, constraint_id: null, category: null, ...extra,
  })
  return [
    { group_id: `g-elig${sfx}`, dimension: 'qualification', label: 'eligibility', importance: 'unknown', item_rule: 'all_of', targets: [target('elig', ELIGIBILITY_TEXT)] },
    { group_id: `g-python${sfx}`, dimension: 'capability', label: 'requirement 1', importance: 'required', item_rule: 'all_of', targets: [target('python', 'Python', { category: 'skill' })] },
    { group_id: `g-any${sfx}`, dimension: 'capability', label: 'requirement 2', importance: 'required', item_rule: 'any_of', targets: [target('sql', 'SQL', { category: 'skill' }), target('r', 'R', { category: 'skill' })] },
    { group_id: `g-loc${sfx}`, dimension: 'preference', label: 'location', importance: 'required', item_rule: 'all_of', targets: [target('loc', 'Nur Berlin', { constraint_id: C_LOC })] },
  ]
}

// `judged` maps a target key to its saved judgment; `groupStatus` and `extras` are the
// canned server-side summary for that scenario (the mock never derives them).
function reviewView({
  sfx = '', matchId = MATCH_ID, fingerprint = 'fp-1', current = fingerprint, profileRev = 1, goalRev = 1,
  revision = 1, judged = {}, groupStatus = {}, importances = {}, warnings = [], gaps = [], conflicts = [],
  coverage, stale = false, staleReasons = [], currentProfileRev = profileRev,
}) {
  const groups = groupsOf(sfx)
  const judgments = groups.flatMap((group) => group.targets).map((target) => {
    const key = target.target_id.slice(2, target.target_id.length - sfx.length)
    return {
      judgment_id: `j-${key}${sfx}`, target_id: target.target_id, status: 'unknown', reason: null, evidence: [],
      confirmed_importance: null, confirmed_at: null, ...(judged[key] ?? {}),
    }
  })
  return {
    stale, stale_reasons: staleReasons,
    current_inputs: inputsOf(current, { profile: currentProfileRev, goal: goalRev, posting: 'posting-rev-1' }),
    match: {
      match_id: matchId, card_key: CARD_KEY, version: 1, revision, created_at: '2026-10-15T09:00:00Z',
      updated_at: '2026-10-15T09:10:00Z', mode: 'local_review', inputs: inputsOf(fingerprint, { profile: profileRev, goal: goalRev }),
      posting_snapshot: POSTING, profile_snapshot: profileDoc(profileRev), goal_snapshot: goalDoc(goalRev),
      groups, judgments,
      summary: {
        groups: groups.map((group) => ({
          group_id: group.group_id, dimension: group.dimension,
          importance: importances[group.group_id.slice(2, group.group_id.length - sfx.length)] ?? group.importance,
          status: groupStatus[group.group_id.slice(2, group.group_id.length - sfx.length)] ?? 'unknown',
        })),
        qualification_warnings: warnings, capability_gaps: gaps, preference_conflicts: conflicts,
        evidence_coverage: coverage ?? { total: 5, linked: 0, unknown: 5, explicitly_not_applicable: 0 },
      },
    },
  }
}

const noReviewView = (fingerprint = 'fp-1') => ({ stale: false, stale_reasons: [], current_inputs: inputsOf(fingerprint), match: null })

// ------------------------------------------------------------ mock and helpers

const matchPath = (suffix = '') => `/matching/card/${CARD_KEY}${suffix}`

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

// `routes` maps "METHOD /path" to a handler; anything else on the API origin or any
// other origin fails closed and is reported through `unexpected`.
async function installBackend({ context, baseURL, routes = {}, settings = SETTINGS }) {
  const calls = []
  const unexpected = []
  const defaults = {
    'GET /settings': (route) => route.fulfill({ json: settings }),
    'GET /posting/card': (route) => route.fulfill({ json: [CARD] }),
    [`GET /posting/card/${CARD_KEY}/original`]: (route) => route.fulfill({ json: CARD }),
  }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === API) {
      const key = `${request.method()} ${url.pathname}`
      calls.push(key)
      const handler = routes[key] ?? defaults[key]
      if (handler) await handler(route, request)
      else { unexpected.push(key); await route.abort('blockedbyclient') }
    } else if (url.origin === baseURL && request.method() === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
    } else {
      unexpected.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') socket.connectToServer()
    else { unexpected.push(`WebSocket ${socket.url()}`); socket.close() }
  })
  return { calls, unexpected }
}

const count = (calls, key) => calls.filter((call) => call === key).length
// Gives a wrongly issued follow-up request time to reach the closed mock first.
const settle = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)))
const mainNavigation = (page) => page.getByRole('navigation', { name: 'Main navigation' })

async function openWorkspace(page) {
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Open Profile and Goal', exact: true }).click()
  const workspace = page.getByRole('region', { name: 'Profile and Goal', exact: true })
  await expect(workspace).toBeVisible()
  return workspace
}
const profileSection = (page) => page.getByRole('region', { name: 'Confirmed evidence', exact: true })
const goalSection = (page) => page.getByRole('region', { name: 'Job-search goal', exact: true })

async function openCard(page) {
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Card library', exact: true }).click()
  await page.getByRole('button', { name: `View details: ${LONG_TITLE} at ${LONG_COMPANY}` }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function openReview(page, dialog) {
  await dialog.getByRole('button', { name: 'Review match', exact: true }).click()
  const panel = dialog.getByRole('region', { name: 'Local match review', exact: true })
  await expect(panel).toBeVisible()
  return panel
}

function groupIn(page, panel, dimension) {
  return panel.locator('details.posting-match__group').filter({ has: page.locator('summary', { hasText: dimension }) })
}
async function openGroup(page, panel, dimension) {
  const group = groupIn(page, panel, dimension)
  await group.locator('summary').first().click()
  return group
}

// ------------------------------------------------------------- PM_UI_CONFIRM

test('Profile and Goal are cancelled, skipped and confirmed separately with their own saves', async ({ page, context, baseURL }) => {
  let savedProfile = null
  let savedGoal = null
  const puts = { profile: [], goal: [] }
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      'GET /profile': (route) => route.fulfill({ json: savedProfile }),
      'GET /goal': (route) => route.fulfill({ json: savedGoal }),
      'PUT /profile': (route, request) => {
        puts.profile.push(request.postDataJSON())
        savedProfile = profileDoc(1)
        return route.fulfill({ json: savedProfile })
      },
      'PUT /goal': (route, request) => {
        puts.goal.push(request.postDataJSON())
        savedGoal = goalDoc(1)
        return route.fulfill({ json: savedGoal })
      },
    },
  })

  await openWorkspace(page)
  const profile = profileSection(page)
  const goal = goalSection(page)
  await expect(profile).toContainText('Not recorded yet')
  await expect(goal).toContainText('Not recorded yet')
  await expect(profile).toContainText('Not providing evidence means unknown, not a gap.')
  const saveProfile = profile.getByRole('button', { name: 'Save Profile', exact: true })
  // Nothing is confirmed by merely opening the workspace.
  await expect(saveProfile).toBeDisabled()

  // A cancelled draft sends no write and leaves the section unrecorded.
  await profile.getByRole('button', { name: 'Add evidence', exact: true }).click()
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).fill('Unbestätigter Entwurf (DEMO)')
  await profile.getByRole('button', { name: 'Cancel Profile changes', exact: true }).click()
  await expect(profile).toContainText('Draft cancelled. No write was sent.')
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveCount(0)
  expect(puts.profile).toHaveLength(0)

  // Two entries; the optional description of the second one is skipped (unknown).
  const add = profile.getByRole('button', { name: 'Add evidence', exact: true })
  await add.click()
  await add.click()
  await profile.getByRole('combobox', { name: /^Type/ }).first().selectOption({ label: 'qualification' })
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).nth(0).fill(NOT_ENROLLED)
  await profile.getByRole('textbox', { name: /Evidence or explanation/ }).nth(0).fill('Exmatrikulation zum 31.03.2025 (DEMO)')
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).nth(1).fill('Python')
  await expect(saveProfile).toBeDisabled()
  await profile.getByRole('checkbox', { name: /I confirm these facts and evidence/ }).check()
  await expect(saveProfile).toBeEnabled()
  await saveProfile.click()

  await expect(profile).toContainText('Saved revision 1')
  await expect(profile).toContainText('Confirmed evidence saved and confirmed.')
  expect(puts.profile).toEqual([{
    expected_revision: 0,
    evidence: [
      { evidence_id: null, kind: 'qualification', label: NOT_ENROLLED, description: 'Exmatrikulation zum 31.03.2025 (DEMO)' },
      { evidence_id: null, kind: 'skill', label: 'Python', description: null },
    ],
  }])
  // The server's confirmed document is adopted, including its stable ids and text.
  await expect(profile.getByRole('textbox', { name: /Evidence or explanation/ }).nth(1)).toHaveValue(SKILL_DETAIL)
  // Saving the Profile confirms nothing about the Goal.
  await expect(goal).toContainText('Not recorded yet')
  expect(puts.goal).toHaveLength(0)

  // The Goal is confirmed on its own: objective skipped, one required constraint.
  await goal.getByRole('button', { name: 'Add constraint', exact: true }).click()
  await goal.getByRole('textbox', { name: /^Constraint$/ }).fill('Nur Berlin')
  await goal.getByRole('combobox', { name: /^Priority/ }).selectOption({ label: 'Required' })
  await goal.getByRole('checkbox', { name: /I confirm these goals and constraints/ }).check()
  await goal.getByRole('button', { name: 'Save Goal', exact: true }).click()
  await expect(goal).toContainText('Saved revision 1')
  expect(puts.goal).toEqual([{
    expected_revision: 0, objective: null,
    constraints: [{ constraint_id: null, kind: 'location', label: 'Nur Berlin', description: null, importance: 'required' }],
  }])
  expect(puts.profile).toHaveLength(1)

  // Closing returns focus to its trigger; reopening reads what was saved.
  await page.getByRole('button', { name: 'Close workspace', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Profile and Goal', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Open Profile and Goal', exact: true }).click()
  await expect(profileSection(page)).toContainText('Saved revision 1')
  await expect(profileSection(page).getByRole('textbox', { name: 'Confirmed fact' }).first()).toHaveValue(NOT_ENROLLED)
  await expect(goalSection(page).getByRole('textbox', { name: /^Constraint$/ })).toHaveValue('Nur Berlin')
  await settle(page)
  expect(count(calls, 'PUT /profile')).toBe(1)
  expect(count(calls, 'PUT /goal')).toBe(1)
  expect(calls.filter((call) => call.startsWith('PATCH') || call.startsWith('POST'))).toEqual([])
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

const GAP_REASON = 'Seit April 2025 nicht mehr eingeschrieben; die Anzeige verlangt Immatrikulation (DEMO)'
const savedElig = (overrides) => ({
  status: 'missing', reason: GAP_REASON, evidence: [{ kind: 'profile', entry_id: E_QUAL }],
  confirmed_importance: 'required', confirmed_at: '2026-10-15T09:10:00Z', ...overrides,
})
const GAP_VIEW = () => reviewView({
  revision: 2, judged: { elig: savedElig() }, groupStatus: { elig: 'missing' }, importances: { elig: 'required' },
  warnings: ['g-elig'], coverage: { total: 5, linked: 1, unknown: 4, explicitly_not_applicable: 0 },
})

test('a Card match review starts unknown, confirms a gap with evidence and corrects it without touching the posting', async ({ page, context, baseURL }) => {
  let view = noReviewView('fp-1')
  const evaluates = []
  const judgments = []
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      [`GET ${matchPath()}`]: (route) => route.fulfill({ json: view }),
      [`POST ${matchPath('/evaluate')}`]: (route, request) => {
        evaluates.push(request.postDataJSON())
        view = reviewView({})
        return route.fulfill({ json: view })
      },
      [`PUT ${matchPath(`/${MATCH_ID}/judgment/t-elig`)}`]: (route, request) => {
        judgments.push(request.postDataJSON())
        view = judgments.length === 1 ? GAP_VIEW() : reviewView({
          revision: 3, judged: { elig: savedElig({ status: 'unknown', reason: 'Rückfrage beim Arbeitgeber offen (DEMO)', evidence: [], confirmed_importance: null }) },
          coverage: { total: 5, linked: 0, unknown: 5, explicitly_not_applicable: 0 },
        })
        return route.fulfill({ json: view })
      },
    },
  })

  const dialog = await openCard(page)
  const panel = await openReview(page, dialog)
  await expect(panel).toContainText('No review recorded.')
  // Opening the review and reading it records nothing.
  expect(evaluates).toHaveLength(0)
  await panel.getByRole('button', { name: 'Start local review', exact: true }).click()
  expect(evaluates).toEqual([{ expected_inputs: 'fp-1' }])

  // Every comparison starts as unknown; unknown is not shown as a gap or a score.
  await expect(panel).toContainText('5 unknown judgments; 0 of 5 items linked to confirmed evidence')
  await expect(panel).toContainText('No confirmed advantages yet.')
  await expect(panel).toContainText('No confirmed gaps. Unknown does not mean met.')
  await expect(panel).toContainText('Inputs current at last read.')
  expect(await panel.innerText()).not.toMatch(/\d+\s*%/)

  const eligibility = await openGroup(page, panel, 'Eligibility')
  await expect(eligibility).toContainText('Not yet confirmed')
  await expect(eligibility).toContainText('No linked confirmed evidence.')
  await eligibility.getByRole('button', { name: `Confirm or correct ${ELIGIBILITY_TEXT}`, exact: true }).click()
  const editor = panel.locator('form.posting-match__editor')
  await expect(editor.getByRole('heading', { name: `Confirm judgment: ${ELIGIBILITY_TEXT}` })).toBeFocused()

  const save = editor.getByRole('button', { name: 'Save judgment', exact: true })
  await editor.getByRole('combobox', { name: /^Status/ }).selectOption({ label: 'Confirmed gap' })
  await editor.getByRole('checkbox', { name: /I confirm this comparison/ }).check()
  // A confirmed gap needs linked evidence; unknown is the only status without it.
  await expect(editor).toContainText('Link confirmed evidence before saving this status.')
  await expect(save).toBeDisabled()
  // Only qualification evidence is offered for an eligibility comparison.
  await expect(editor.getByRole('checkbox', { name: /Python/ })).toHaveCount(0)
  await editor.getByRole('checkbox', { name: new RegExp(NOT_ENROLLED.replace(/[()]/g, '\\$&')) }).check()
  await editor.getByRole('combobox', { name: /^Eligibility priority/ }).selectOption({ label: 'Required' })
  await editor.getByRole('textbox', { name: /^Reason/ }).fill(GAP_REASON)
  // Any edit withdraws the confirmation until the user confirms again.
  await expect(save).toBeDisabled()
  await editor.getByRole('checkbox', { name: /I confirm this comparison/ }).check()
  await save.click()

  await expect(panel).toContainText('Local review saved. No Profile or posting fact changed.')
  expect(judgments).toEqual([{
    expected_inputs: 'fp-1', expected_revision: 1, status: 'missing', reason: GAP_REASON,
    evidence: [{ kind: 'profile', entry_id: E_QUAL }], confirmed_importance: 'required',
  }])
  await expect(panel).toContainText('required eligibility gate; abilities do not override it')
  await expect(eligibility).toContainText('Confirmed gap')
  await expect(eligibility).toContainText(`User-confirmed judgment — ${GAP_REASON}`)
  await expect(eligibility).toContainText(NOT_ENROLLED)
  await expect(panel).toContainText('No confirmed advantages yet.')
  await expect(eligibility.getByRole('button', { name: `Confirm or correct ${ELIGIBILITY_TEXT}` })).toBeFocused()
  // Untouched comparisons stay unknown rather than inheriting the gate.
  const python = await openGroup(page, panel, 'requirement 1')
  await expect(python).toContainText('Not yet confirmed')

  // The user corrects the earlier judgment; the editor starts from the saved values.
  await eligibility.getByRole('button', { name: `Confirm or correct ${ELIGIBILITY_TEXT}` }).click()
  await expect(editor.getByRole('combobox', { name: /^Status/ })).toHaveValue('missing')
  await expect(editor.getByRole('textbox', { name: /^Reason/ })).toHaveValue(GAP_REASON)
  await editor.getByRole('combobox', { name: /^Status/ }).selectOption({ label: 'Unknown' })
  await editor.getByRole('textbox', { name: /^Reason/ }).fill('Rückfrage beim Arbeitgeber offen (DEMO)')
  await editor.getByRole('checkbox', { name: new RegExp(NOT_ENROLLED.replace(/[()]/g, '\\$&')) }).uncheck()
  await editor.getByRole('checkbox', { name: /I confirm this comparison/ }).check()
  await save.click()
  await expect(panel).toContainText('No confirmed gaps. Unknown does not mean met.')
  expect(judgments).toHaveLength(2)
  expect(judgments[1]).toMatchObject({ expected_inputs: 'fp-1', expected_revision: 2, status: 'unknown', evidence: [], reason: 'Rückfrage beim Arbeitgeber offen (DEMO)' })

  // Only the domain review was written: no posting edit, deletion, application or model call.
  await settle(page)
  expect(calls.filter((call) => call.startsWith('POST') || call.startsWith('PUT') || call.startsWith('PATCH') || call.startsWith('DELETE'))).toEqual([
    `POST ${matchPath('/evaluate')}`,
    `PUT ${matchPath(`/${MATCH_ID}/judgment/t-elig`)}`,
    `PUT ${matchPath(`/${MATCH_ID}/judgment/t-elig`)}`,
  ])
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ----------------------------------------------------------- PM_UI_RECOVERY

test('Profile read failure, rejected save and a lost save response keep the draft and need an explicit read', async ({ page, context, baseURL }) => {
  const private_detail = 'PRIVATE-STORAGE-DETAIL-MUST-NOT-SHOW'
  let savedProfile = null
  let reads = 0
  const puts = []
  const hold = deferred()
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      'GET /profile': (route) => {
        reads += 1
        return reads === 1
          ? route.fulfill({ status: 500, json: { detail: private_detail } })
          : route.fulfill({ json: savedProfile })
      },
      'GET /goal': (route) => route.fulfill({ json: null }),
      'PUT /profile': async (route, request) => {
        puts.push(request.postDataJSON())
        if (puts.length === 1) {
          await hold.promise
          await route.fulfill({ status: 422, json: { detail: private_detail } })
        } else {
          // The server commits, but the response never reaches the browser.
          savedProfile = profileDoc(1)
          await route.abort('failed')
        }
      },
    },
  })

  await openWorkspace(page)
  const profile = profileSection(page)
  await expect(profile.getByRole('alert')).toHaveText('Could not load local data. Try reading again.')
  await expect(goalSection(page).getByRole('alert')).toHaveCount(0)
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveCount(0)
  await settle(page)
  // A failed read is never retried automatically.
  expect(count(calls, 'GET /profile')).toBe(1)
  await profile.getByRole('button', { name: 'Read saved Profile', exact: true }).click()
  await expect(profile).toContainText('Saved data read.')
  expect(count(calls, 'GET /profile')).toBe(2)

  await profile.getByRole('button', { name: 'Add evidence', exact: true }).click()
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).fill('Python')
  await profile.getByRole('textbox', { name: /Evidence or explanation/ }).fill(SKILL_DETAIL)
  await profile.getByRole('checkbox', { name: /I confirm these facts and evidence/ }).check()
  const save = profile.getByRole('button', { name: 'Save Profile', exact: true })
  await save.click()

  // While the request is pending the section is busy and nothing else can be sent.
  await expect(profile).toContainText('Working…')
  await expect(save).toBeDisabled()
  await expect(profile.getByRole('button', { name: 'Cancel Profile changes', exact: true })).toBeDisabled()
  await settle(page)
  expect(puts).toHaveLength(1)
  hold.resolve()

  // A rejected save keeps the draft, shows a safe message and allows another attempt.
  await expect(profile.getByRole('alert')).toHaveText('Check the entries and confirmed evidence. This change was rejected.')
  expect(await page.locator('body').innerText()).not.toContain(private_detail)
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveValue('Python')
  await expect(profile.getByRole('button', { name: /^Read saved Profile/ })).toHaveCount(0)
  await expect(save).toBeEnabled()
  await save.click()

  // Unknown outcome: no automatic replay, writes are locked until the user reads.
  await expect(profile.getByRole('alert')).toHaveText('Save outcome unknown. Read saved data before another write.')
  await expect(save).toBeDisabled()
  await settle(page)
  expect(puts).toHaveLength(2)
  expect(puts[0]).toEqual(puts[1])
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveValue('Python')
  await profile.getByRole('button', { name: 'Read saved Profile', exact: true }).click()
  await expect(profile).toContainText('Saved version for comparison')
  await expect(profile).toContainText('Revision 1')
  await expect(profile).toContainText('Further writes stay locked.')
  await expect(save).toBeDisabled()
  // The draft is kept until the user explicitly adopts the saved version.
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveValue('Python')
  await profile.getByRole('button', { name: 'Use saved version', exact: true }).click()
  await expect(profile).toContainText('Saved revision 1')
  await expect(profile.getByRole('textbox', { name: /Evidence or explanation/ }).first()).toHaveValue(
    profileDoc(1).evidence[0].description,
  )
  // Adopting the saved version re-requires confirmation; the lost save was never replayed.
  await expect(save).toBeDisabled()
  await settle(page)
  expect(puts).toHaveLength(2)
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('match review load failure, a lost judgment response and a late old response never overwrite the current review', async ({ page, context, baseURL }) => {
  const privateReason = 'Rückfrage beim Arbeitgeber offen (DEMO)'
  let reads = 0
  let committed = reviewView({ revision: 1 })
  const judgments = []
  const lateRead = deferred()
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      [`GET ${matchPath()}`]: async (route) => {
        reads += 1
        if (reads === 1) await route.fulfill({ status: 500, json: { detail: 'PRIVATE-STORAGE-DETAIL' } })
        else if (reads === 4) {
          // Read 1 failed, 2 is the manual retry and 3 the post-loss read. Read 4 belongs to
          // a panel the user closes: answered only after the user has reopened it.
          await lateRead.promise
          await route.fulfill({ json: reviewView({ revision: 9 }) })
        } else await route.fulfill({ json: committed })
      },
      [`PUT ${matchPath(`/${MATCH_ID}/judgment/t-elig`)}`]: async (route, request) => {
        judgments.push(request.postDataJSON())
        committed = reviewView({
          revision: 2, coverage: { total: 5, linked: 0, unknown: 5, explicitly_not_applicable: 0 },
          judged: { elig: savedElig({ status: 'unknown', reason: privateReason, evidence: [], confirmed_importance: null }) },
        })
        await route.abort('failed')
      },
    },
  })

  const dialog = await openCard(page)
  const panel = await openReview(page, dialog)
  await expect(panel.getByRole('alert')).toHaveText('Could not load this local review. Try reading again or close to continue with the Card.')
  // The Card itself stays readable beside the failed review.
  await expect(dialog).toContainText(LONG_COMPANY)
  await settle(page)
  expect(reads).toBe(1)
  await panel.getByRole('button', { name: 'Read saved review', exact: true }).click()
  await expect(panel).toContainText('Current inputs and saved review read.')
  await expect(panel.getByRole('alert')).toHaveCount(0)

  // Lost judgment response: locked, no replay, explicit read and comparison.
  const eligibility = await openGroup(page, panel, 'Eligibility')
  await eligibility.getByRole('button', { name: `Confirm or correct ${ELIGIBILITY_TEXT}` }).click()
  const editor = panel.locator('form.posting-match__editor')
  await editor.getByRole('textbox', { name: /^Reason/ }).fill(privateReason)
  await editor.getByRole('checkbox', { name: /I confirm this comparison/ }).check()
  await editor.getByRole('button', { name: 'Save judgment', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('Save outcome unknown. Read saved data before another write.')
  await expect(editor.getByRole('button', { name: 'Save judgment', exact: true })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Cancel judgment changes' })).toBeDisabled()
  await settle(page)
  expect(judgments).toHaveLength(1)
  await panel.getByRole('button', { name: 'Read saved review', exact: true }).click()
  await expect(panel).toContainText('Saved review read. Compare your retained draft below before using the saved review.')
  await expect(panel).toContainText(`Saved judgment: Unknown — ${privateReason}`)
  await expect(editor.getByRole('button', { name: 'Save judgment', exact: true })).toBeDisabled()
  await panel.getByRole('button', { name: 'Use saved review', exact: true }).click()
  await expect(panel).toContainText('Saved review adopted. Open a judgment to explicitly confirm new changes.')
  await expect(editor).toHaveCount(0)
  expect(judgments).toHaveLength(1)

  // A panel closed while its read is pending cannot write into the reopened panel.
  await panel.getByRole('button', { name: 'Close match review', exact: true }).click()
  await expect(panel).toHaveCount(0)
  // Read 4 is the abandoned panel's; read 5 is the reopened panel's own read.
  await dialog.getByRole('button', { name: 'Review match', exact: true }).click()
  await expect.poll(() => reads).toBe(4)
  await dialog.getByRole('region', { name: 'Local match review', exact: true }).getByRole('button', { name: 'Close match review', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review match', exact: true }).click()
  const reopened = dialog.getByRole('region', { name: 'Local match review', exact: true })
  await expect(reopened).toContainText('saved revision 2')
  lateRead.resolve()
  await settle(page)
  await expect(reopened).toContainText('saved revision 2')
  await expect(reopened).not.toContainText('saved revision 9')
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
  expect(calls.filter((call) => call.startsWith('PATCH') || call.startsWith('DELETE'))).toEqual([])
})

// ---------------------------------------------------------------- PM_UI_STALE

const STALE_VIEW = () => reviewView({
  fingerprint: 'fp-old', current: 'fp-new', profileRev: 1, currentProfileRev: 2, revision: 2,
  stale: true, staleReasons: ['profile'],
  judged: {
    python: {
      status: 'met', reason: SKILL_DETAIL, evidence: [{ kind: 'profile', entry_id: E_SKILL }],
      confirmed_importance: null, confirmed_at: '2026-10-15T09:10:00Z',
    },
  },
  groupStatus: { python: 'met' }, coverage: { total: 5, linked: 1, unknown: 4, explicitly_not_applicable: 0 },
})
const FRESH_VIEW = () => reviewView({
  sfx: '-2', matchId: 'a0000000-0000-4000-8000-000000000002', fingerprint: 'fp-new', profileRev: 2, revision: 1,
})

test('a review saved against older inputs is marked stale and read-only until explicitly re-evaluated', async ({ page, context, baseURL }) => {
  let view = STALE_VIEW()
  const evaluates = []
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      [`GET ${matchPath()}`]: (route) => route.fulfill({ json: view }),
      [`POST ${matchPath('/evaluate')}`]: (route, request) => {
        evaluates.push(request.postDataJSON())
        view = FRESH_VIEW()
        return route.fulfill({ json: view })
      },
    },
  })

  const dialog = await openCard(page)
  const panel = await openReview(page, dialog)
  await expect(panel).toContainText('Needs re-evaluation: profile. Old judgments are read-only and will not be copied.')
  await expect(panel).toContainText('Profile 1 · Goal 1')
  await panel.getByText('Input versions and posting context').click()
  // The saved snapshot and the current confirmed inputs are shown side by side.
  await expect(panel).toContainText('Current Profile 2 · Goal 1 · Rules rules-1')
  await expect(panel).toContainText('Re-evaluate changed inputs before confirming judgments.')

  // The old confirmed judgment stays readable, but cannot be edited or saved.
  const python = await openGroup(page, panel, 'requirement 1')
  await expect(python).toContainText(`User-confirmed judgment — ${SKILL_DETAIL}`)
  await expect(python).toContainText('Met')
  await expect(panel.getByRole('button', { name: /^Confirm or correct/ })).toHaveCount(0)
  expect(evaluates).toHaveLength(0)

  await panel.getByRole('button', { name: 'Re-evaluate current inputs', exact: true }).click()
  expect(evaluates).toEqual([{ expected_inputs: 'fp-new' }])
  await expect(panel).toContainText('Inputs current at last read.')
  await expect(panel).toContainText('Profile 2 · Goal 1')
  // Nothing is carried over by name: the new review starts from unknown again.
  await expect(panel).toContainText('5 unknown judgments; 0 of 5 items linked to confirmed evidence')
  await expect(panel).not.toContainText(SKILL_DETAIL)
  await expect(panel).toContainText('No confirmed advantages yet.')
  const fresh = await openGroup(page, panel, 'requirement 1')
  await expect(fresh).toContainText('Not yet confirmed')
  await expect(fresh.getByRole('button', { name: 'Confirm or correct Python' })).toBeEnabled()

  await settle(page)
  expect(calls.filter((call) => call.startsWith('PUT') || call.startsWith('PATCH') || call.startsWith('DELETE'))).toEqual([])
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------ PM_CARD_BOUNDARY

test('a failed match review never blocks the Card: close, edit, save and Show original keep working', async ({ page, context, baseURL }) => {
  const NEW_TITLE = `${LONG_TITLE} – korrigiert`
  const patches = []
  const edited = structuredClone(CARD)
  edited.posting.identity.position_title = fact(NEW_TITLE)
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      [`GET ${matchPath()}`]: (route) => route.fulfill({ status: 500, json: { detail: 'PRIVATE-STORAGE-DETAIL' } }),
      [`PATCH /posting/card/${CARD_KEY}`]: (route, request) => {
        patches.push(request.postDataJSON())
        return route.fulfill({ json: edited })
      },
    },
  })

  const dialog = await openCard(page)
  const panel = await openReview(page, dialog)
  await expect(panel.getByRole('alert')).toContainText('Could not load this local review.')
  await expect(dialog).toContainText(LONG_COMPANY)
  await panel.getByRole('button', { name: 'Close match review', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toBeFocused()

  // Editing hides the review entry; saving the Card sends its own request only.
  await dialog.getByRole('button', { name: 'Edit card', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toHaveCount(0)
  await dialog.getByRole('textbox', { name: 'Position title', exact: true }).fill(NEW_TITLE)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Edit card', exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: NEW_TITLE })).toBeVisible()
  expect(patches).toHaveLength(1)
  expect(patches[0].position_title).toBe(NEW_TITLE)
  await expect(dialog.getByRole('button', { name: 'Review match', exact: true })).toBeVisible()
  expect(count(calls, `GET ${matchPath()}`)).toBe(1)

  // The original stays reachable and read-only: no review entry and no match request.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: `Show original: ${NEW_TITLE}` }).click()
  const original = page.getByRole('dialog')
  await expect(original.getByRole('heading', { name: LONG_TITLE, exact: true })).toBeVisible()
  await expect(original.getByRole('button', { name: 'Review match', exact: true })).toHaveCount(0)
  await expect(original.getByRole('button', { name: 'Edit card', exact: true })).toHaveCount(0)
  await settle(page)
  expect(count(calls, `GET /posting/card/${CARD_KEY}/original`)).toBe(1)
  expect(count(calls, `GET ${matchPath()}`)).toBe(1)
  expect(calls.filter((call) => call.includes('/matching/') && call.split(' ')[0] !== 'GET')).toEqual([])
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// ------------------------------------------------------------------ PM_VISUAL

const SHOWCASE_VIEW = () => reviewView({
  revision: 4,
  judged: {
    elig: savedElig(),
    python: {
      status: 'met', reason: SKILL_DETAIL, evidence: [{ kind: 'profile', entry_id: E_SKILL }],
      confirmed_importance: null, confirmed_at: '2026-10-15T09:12:00Z',
    },
    loc: {
      status: 'missing', reason: 'Die Stelle liegt in München, das Ziel verlangt ausschließlich Berlin (DEMO)',
      evidence: [{ kind: 'goal', entry_id: C_LOC }], confirmed_importance: null, confirmed_at: '2026-10-15T09:14:00Z',
    },
  },
  groupStatus: { elig: 'missing', python: 'met', loc: 'missing' }, importances: { elig: 'required' },
  warnings: ['g-elig'], conflicts: ['g-loc'], coverage: { total: 5, linked: 3, unknown: 2, explicitly_not_applicable: 0 },
})

function longProfile() {
  const doc = profileDoc(1)
  doc.evidence.push({
    evidence_id: 'e0000000-0000-4000-8000-000000000003', kind: 'experience',
    label: 'Werkstudententätigkeit in der Netzentgeltabrechnung eines Verteilnetzbetreibers (DEMO)',
    description: 'Monatliche Plausibilitätsprüfungen von Abrechnungsdaten, Abstimmung mit der Marktkommunikation und Dokumentation von Abweichungen über zwölf Monate (DEMO)',
  })
  return doc
}

// Elements whose box leaves the viewport horizontally, or whose text is clipped by an
// overflow rule. Native fields scroll their own value and are not text clipping.
function layoutProblems(root) {
  return root.evaluate((element) => {
    const problems = []
    for (const node of [element, ...element.querySelectorAll('*')]) {
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const label = `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)} "${(node.textContent ?? '').trim().slice(0, 40)}"`
      if (rect.right > window.innerWidth + 1 || rect.left < -1) problems.push(`outside viewport: ${label}`)
      const style = getComputedStyle(node)
      const clipsText = !['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) && style.overflowX !== 'visible'
      if (clipsText && node.scrollWidth > node.clientWidth + 1) problems.push(`clipped text: ${label}`)
    }
    return problems
  })
}

// Why a visible-in-viewport proof: a page screenshot only shows what the real scroll
// containers currently display, so DOM presence or an element's own box proves nothing about
// the picture. A target counts as shown only when its whole box lies inside the window and
// inside every clipping ancestor, and the element at its points is the target itself (not a
// sticky header or overlay).
function visibilityProblem(locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return 'has no box'
    if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) {
      return `box ${Math.round(rect.top)}..${Math.round(rect.bottom)} leaves the ${window.innerWidth}x${window.innerHeight} window`
    }
    for (let node = el.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).overflowY === 'visible') continue
      const clip = node.getBoundingClientRect()
      if (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1) return `clipped by scroll container ${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`
    }
    // The corner probe is inset past a typical 12px border radius: a point on the very corner
    // of a rounded box is outside its painted shape and would report the parent as "covering" it.
    const inset = Math.min(12, Math.min(rect.width, rect.height) / 4)
    for (const [x, y] of [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + inset, rect.top + inset]]) {
      const hit = document.elementFromPoint(x, y)
      if (!hit || !el.contains(hit)) return `covered by ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 40)}` : 'nothing'}`
    }
    return null
  })
}

// Scroll the nearest real scroll container so the first target sits a little below its top,
// then require every named target to be demonstrably visible in that one frame. Margins are
// tried in order so a sticky Card header cannot hide the first target.
async function frameTargets(targets) {
  const failures = []
  for (const margin of [96, 160, 24]) {
    await targets[0][1].scrollIntoViewIfNeeded()
    await targets[0][1].evaluate((el, offset) => {
      let scroller = el.parentElement
      while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement
      if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset
    }, margin)
    const problems = []
    for (const [name, locator] of targets) {
      const problem = await visibilityProblem(locator)
      if (problem) problems.push(`${name}: ${problem}`)
    }
    if (problems.length === 0) return
    failures.push(`margin ${margin}: ${problems.join('; ')}`)
  }
  throw new Error(`Evidence targets are not all visible in one frame. ${failures.join(' | ')}`)
}

async function captureProfileMatchEvidence({ page, context, baseURL }, testInfo, viewport) {
  testInfo.setTimeout(90_000)
  const label = `${viewport.width}x${viewport.height}`
  let savedProfile = null
  let savedGoal = null
  let view = noReviewView('fp-1')
  let readMode = 'ok'
  const { unexpected } = await installBackend({
    context, baseURL, routes: {
      'GET /profile': (route) => route.fulfill({ json: savedProfile }),
      'GET /goal': (route) => route.fulfill({ json: savedGoal }),
      'PUT /profile': (route) => route.fulfill({ status: 422, json: { detail: 'DEMO rejection' } }),
      [`GET ${matchPath()}`]: (route) => readMode === 'fail'
        ? route.fulfill({ status: 500, json: { detail: 'DEMO failure' } })
        : route.fulfill({ json: view }),
      [`POST ${matchPath('/evaluate')}`]: (route) => { view = SHOWCASE_VIEW(); return route.fulfill({ json: view }) },
    },
  })
  const geometry = {
    source: 'Synthetic public DEMO fixtures under closed mocks; no real backend, database, keyring or supplier',
    viewport, states: {},
  }
  // `targets` are [name, locator] pairs naming what this picture is meant to show; all of
  // them must be inside the frame, so a green run cannot photograph unrelated content.
  async function capture(state, root, targets = []) {
    // The unchanged Home reference is only photographed; its own layout is not under test.
    const problems = root ? await layoutProblems(root) : []
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    geometry.states[state] = { documentOverflow: overflow, layoutProblems: problems, shown: targets.map(([name]) => name) }
    expect(overflow, `${state}: the page must not scroll horizontally`).toBeLessThanOrEqual(1)
    expect(problems, `${state}: nothing may leave the viewport or be clipped`).toEqual([])
    if (targets.length > 0) await frameTargets(targets)
    // Run artifacts on disk, not committed baselines, and never a visual approval.
    const file = testInfo.outputPath(`profile-match-${label}-${state}.png`)
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' })
    await testInfo.attach(`profile-match-${label}-${state}`, { path: file, contentType: 'image/png' })
  }

  await page.setViewportSize(viewport)
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo Student')
  await capture('home-reference', null)

  // Empty workspace, then the keyboard path: focus lands on the heading, Tab reaches Close.
  await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Open Profile and Goal', exact: true })
  await trigger.click()
  const workspace = page.getByRole('region', { name: 'Profile and Goal', exact: true })
  await expect(workspace.getByRole('heading', { name: 'Profile and Goal', level: 2 })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(workspace.getByRole('button', { name: 'Close workspace', exact: true })).toBeFocused()
  await expect(profileSection(page)).toContainText('Not recorded yet')
  await expect(goalSection(page)).toContainText('Not recorded yet')
  const profile = profileSection(page)
  const goal = goalSection(page)
  await capture('workspace-empty', workspace, [
    ['Profile heading', profile.getByRole('heading', { name: 'Confirmed evidence', level: 3 })],
    ['Profile "Not recorded yet"', profile.getByText('Not recorded yet', { exact: true })],
    ['Profile empty-state text', profile.getByText(/^No evidence recorded\./)],
    ['Add evidence', profile.getByRole('button', { name: 'Add evidence', exact: true })],
    ['Save Profile', profile.getByRole('button', { name: 'Save Profile', exact: true })],
  ])
  await capture('workspace-empty-goal', workspace, [
    ['Goal heading', goal.getByRole('heading', { name: 'Job-search goal', level: 3 })],
    ['Goal "Not recorded yet"', goal.getByText('Not recorded yet', { exact: true })],
    ['Goal objective field', goal.getByRole('textbox', { name: /^Objective/ })],
    ['Goal empty-state text', goal.getByText(/^No constraints recorded\./)],
    ['Add constraint', goal.getByRole('button', { name: 'Add constraint', exact: true })],
    ['Save Goal', goal.getByRole('button', { name: 'Save Goal', exact: true })],
  ])
  await page.keyboard.press('Escape')
  await expect(workspace).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // Long confirmed content, then a rejected save keeps it visible beside a clear error.
  savedProfile = longProfile()
  savedGoal = goalDoc(1)
  await trigger.click()
  await expect(profileSection(page)).toContainText('Saved revision 1')
  await expect(profileSection(page).getByRole('textbox', { name: 'Confirmed fact' })).toHaveCount(3)
  await expect(profileSection(page).getByRole('textbox', { name: 'Confirmed fact' }).first()).toHaveValue(NOT_ENROLLED)
  const facts = profile.getByRole('textbox', { name: 'Confirmed fact' })
  const explanations = profile.getByRole('textbox', { name: /^Evidence or explanation/ })
  await expect(goal).toContainText('Saved revision 1')
  await capture('workspace-filled', workspace, [
    ['Profile heading', profile.getByRole('heading', { name: 'Confirmed evidence', level: 3 })],
    ['Profile saved revision', profile.getByText('Saved revision 1', { exact: true })],
    ['First confirmed fact', facts.nth(0)],
    ['First evidence explanation', explanations.nth(0)],
  ])
  await capture('workspace-filled-long', workspace, [
    ['Third (long German) confirmed fact', facts.nth(2)],
    ['Third (long German) explanation', explanations.nth(2)],
  ])
  await capture('workspace-filled-goal', workspace, [
    ['Goal heading', goal.getByRole('heading', { name: 'Job-search goal', level: 3 })],
    ['Goal saved revision', goal.getByText('Saved revision 1', { exact: true })],
    ['Goal constraint', goal.getByRole('textbox', { name: /^Constraint$/ })],
  ])
  // At narrow widths the stacked Goal form is taller than one window, so its save action is
  // evidenced in its own frame together with the constraint it saves rather than with the heading.
  await capture('workspace-filled-goal-actions', workspace, [
    ['Goal constraint', goal.getByRole('textbox', { name: /^Constraint$/ })],
    ['Save Goal', goal.getByRole('button', { name: 'Save Goal', exact: true })],
  ])
  await profile.getByRole('checkbox', { name: /I confirm these facts and evidence/ }).check()
  await profile.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(profile.getByRole('alert')).toContainText('This change was rejected.')
  // The rejection stays beside the retained confirmed facts, not just somewhere in the DOM.
  await capture('workspace-save-error', workspace, [
    ['Profile heading', profile.getByRole('heading', { name: 'Confirmed evidence', level: 3 })],
    ['Save rejection alert', profile.getByRole('alert')],
    ['Retained first confirmed fact', facts.nth(0)],
  ])

  // Match review on the long German Card: empty, normal, editor, read error, stale.
  await mainNavigation(page).getByRole('button', { name: 'Card library', exact: true }).click()
  await page.getByRole('button', { name: `View details: ${LONG_TITLE} at ${LONG_COMPANY}` }).click()
  const dialog = page.getByRole('dialog')
  const entry = dialog.getByRole('button', { name: 'Review match', exact: true })
  await entry.click()
  const panel = dialog.getByRole('region', { name: 'Local match review', exact: true })
  await expect(panel.getByRole('heading', { name: 'Local match review' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Close match review', exact: true })).toBeFocused()
  await expect(panel).toContainText('No review recorded.')
  await capture('match-empty', panel)
  // Escape closes only the review, not the Card, and returns focus to its entry.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(entry).toBeFocused()

  await entry.click()
  await panel.getByRole('button', { name: 'Start local review', exact: true }).click()
  await expect(panel).toContainText('3 of 5 items linked to confirmed evidence')
  await expect(panel).toContainText('preference conflict, not lack of eligibility')
  // Normal state, photographed before any group is expanded: the picture must show the whole
  // four-part summary with its real content, with no error banner on the panel. The summary box
  // is itself a target, so frameTargets scrolls to it and proves it sits inside one frame.
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(panel).toContainText('Inputs current at last read.')
  const summary = panel.locator('.posting-match__summary')
  await expect(summary).toBeVisible()
  await capture('match-normal', panel, [
    ['Summary (all four parts)', summary],
    ['Advantages heading', summary.getByRole('heading', { name: 'Advantages', level: 4 })],
    ['Advantages content (confirmed ability)', summary.getByRole('listitem').filter({ hasText: 'requirement 1' })],
    ['Evidence to add heading', summary.getByRole('heading', { name: 'Evidence to add', level: 4 })],
    ['Evidence coverage counts', summary.getByText(/3 of 5 items linked to confirmed evidence/)],
    ['Explicit gaps heading', summary.getByRole('heading', { name: 'Explicit gaps', level: 4 })],
    ['Eligibility gate gap', summary.getByText(/required eligibility gate; abilities do not override it/)],
    ['Preference conflict gap', summary.getByText(/preference conflict, not lack of eligibility/)],
    ['Next steps heading', summary.getByRole('heading', { name: 'Next steps', level: 4 })],
  ])
  for (const text of ['Eligibility', 'requirement 1', 'requirement 2', 'Preferences']) await openGroup(page, panel, text)
  await groupIn(page, panel, 'Preferences').scrollIntoViewIfNeeded()
  await capture('match-groups', panel)

  await groupIn(page, panel, 'Eligibility').getByRole('button', { name: /^Confirm or correct/ }).click()
  const editor = panel.locator('form.posting-match__editor')
  await expect(editor).toBeVisible()
  await editor.scrollIntoViewIfNeeded()
  await capture('match-editor', panel)
  await editor.getByRole('button', { name: 'Cancel judgment changes', exact: true }).click()
  await expect(editor).toHaveCount(0)

  readMode = 'fail'
  await panel.getByRole('button', { name: 'Read saved review', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('Could not read the review.')
  await panel.scrollIntoViewIfNeeded()
  await capture('match-read-error', panel)

  readMode = 'ok'
  view = STALE_VIEW()
  await panel.getByRole('button', { name: 'Read saved review', exact: true }).click()
  await expect(panel).toContainText('Needs re-evaluation: profile.')
  await panel.scrollIntoViewIfNeeded()
  await capture('match-stale', panel)

  const geometryFile = testInfo.outputPath(`profile-match-${label}-geometry.json`)
  await writeFile(geometryFile, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach(`profile-match-${label}-geometry.json`, { path: geometryFile, contentType: 'application/json' })
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
}

test('profile and match evidence at 1440x1000 shows long German content, keyboard focus, normal, error and stale states', async ({ page, context, baseURL }, testInfo) => {
  await captureProfileMatchEvidence({ page, context, baseURL }, testInfo, { width: 1440, height: 1000 })
})

test('profile and match evidence at 900x1000 shows long German content, keyboard focus, normal, error and stale states', async ({ page, context, baseURL }, testInfo) => {
  await captureProfileMatchEvidence({ page, context, baseURL }, testInfo, { width: 900, height: 1000 })
})
