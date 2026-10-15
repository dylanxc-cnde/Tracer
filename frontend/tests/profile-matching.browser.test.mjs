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
export const CARD = {
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
    // Home is only entered here as the display-name page or the unchanged visual reference, so it
    // gets an empty, valid projection. Home record behavior is covered by home-records.browser.test.mjs.
    'GET /home/overview': (route) => route.fulfill({ json: {
      today: { tasks: [], completed_tasks: [], completed_count: 0, events: [] },
      upcoming: { events: [], tasks: [] },
      your_search: { active: 0, awaiting_reply: 0, interviews: 0 },
      applications: [], recent_jobs: [], recent_activity: [],
      ai_usage: { status: 'not_recorded', tokens: null, estimated_cost_usd: null, providers: [] },
    } }),
    'GET /home/activity': (route) => route.fulfill({ json: { events: [], recording_started_at: null } }),
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

const settingsSections = (page) => page.getByRole('navigation', { name: 'Settings sections' })
const userSection = (page) => page.getByRole('region', { name: 'User information', exact: true })
const profileSection = (page) => page.getByRole('region', { name: 'Background and skills', exact: true })
const goalSection = (page) => page.getByRole('region', { name: 'Job preferences', exact: true })

// Settings opens on its Profile category: the personal domains load on arrival, with no
// intermediate "open" step. Returns once both domain regions are on screen.
async function openProfile(page) {
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(profileSection(page)).toBeVisible()
  await expect(goalSection(page)).toBeVisible()
}

const SAVE_PROFILE = 'Save background and skills'
const SAVE_GOAL = 'Save job preferences'
const CONFIRM_PROFILE = /I confirm these facts and supporting details/
const CONFIRM_GOAL = /I confirm these goals and preferences/

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

  await openProfile(page)
  const profile = profileSection(page)
  const goal = goalSection(page)
  // Entering Profile is the only thing that reads the two domains; nothing is written.
  await expect.poll(() => count(calls, 'GET /goal')).toBe(1)
  expect(count(calls, 'GET /profile')).toBe(1)
  // Nothing was ever saved: each region explains its purpose and offers the start action.
  // Unfilled information is unknown and never presented as a gap.
  await expect(profile).toContainText('No background or skills added yet.')
  await expect(profile).toContainText('Unfilled information stays unknown.')
  await expect(goal).toContainText('No preferences added yet.')
  await expect(goal).toContainText('Unfilled information stays unknown.')
  await expect(profile.getByRole('textbox')).toHaveCount(0)
  await expect(profile.getByRole('button', { name: SAVE_PROFILE, exact: true })).toHaveCount(0)
  expect(puts.profile).toHaveLength(0)
  expect(puts.goal).toHaveLength(0)

  // A cancelled draft sends no write and leaves the region unrecorded.
  const startProfile = profile.getByRole('button', { name: 'Add background and skills', exact: true })
  await startProfile.click()
  await expect(profile.locator('legend')).toBeFocused()
  await profile.getByRole('button', { name: 'Add background or skill', exact: true }).click()
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).fill('Unbestätigter Entwurf (DEMO)')
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(profile).toContainText('Draft cancelled. No write was sent.')
  await expect(profile).toContainText('No background or skills added yet.')
  await expect(profile.getByRole('textbox')).toHaveCount(0)
  await expect(startProfile).toBeFocused()
  expect(puts.profile).toHaveLength(0)

  // Two entries; the optional description of the second one is skipped (unknown).
  await startProfile.click()
  const add = profile.getByRole('button', { name: 'Add background or skill', exact: true })
  await add.click()
  await add.click()
  const saveProfile = profile.getByRole('button', { name: SAVE_PROFILE, exact: true })
  await profile.getByRole('combobox', { name: /^Type/ }).first().selectOption({ label: 'qualification' })
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).nth(0).fill(NOT_ENROLLED)
  await profile.getByRole('textbox', { name: /^Supporting details/ }).nth(0).fill('Exmatrikulation zum 31.03.2025 (DEMO)')
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).nth(1).fill('Python')
  // Nothing is written without an explicit confirmation.
  await expect(saveProfile).toBeDisabled()
  await profile.getByRole('checkbox', { name: CONFIRM_PROFILE }).check()
  await expect(saveProfile).toBeEnabled()
  await saveProfile.click()

  // Success returns this region to reading mode with the server's confirmed document.
  await expect(profile).toContainText('Background and skills saved and confirmed.')
  await expect(profile.getByRole('textbox')).toHaveCount(0)
  await expect(profile).toContainText('Saved · confirmed by you')
  await expect(profile).toContainText(NOT_ENROLLED)
  await expect(profile).toContainText('Exmatrikulation zum 31.03.2025 (DEMO)')
  // The skipped description was sent as unknown; the server text is what is shown.
  await expect(profile).toContainText(SKILL_DETAIL)
  expect(puts.profile).toEqual([{
    expected_revision: 0,
    evidence: [
      { evidence_id: null, kind: 'qualification', label: NOT_ENROLLED, description: 'Exmatrikulation zum 31.03.2025 (DEMO)' },
      { evidence_id: null, kind: 'skill', label: 'Python', description: null },
    ],
  }])
  // Saving background and skills confirms nothing about job preferences.
  await expect(goal).toContainText('No preferences added yet.')
  expect(puts.goal).toHaveLength(0)

  // The Goal is confirmed on its own, using only the keyboard: objective skipped, one required
  // preference. Focus lands in the opened form and Tab reaches its first field.
  const editGoal = goal.getByRole('button', { name: 'Set job preferences', exact: true })
  await editGoal.focus()
  await page.keyboard.press('Enter')
  await expect(goal.locator('legend')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(goal.getByRole('textbox', { name: /^Objective/ })).toBeFocused()
  await goal.getByRole('button', { name: 'Add preference', exact: true }).focus()
  await page.keyboard.press('Enter')
  await goal.getByRole('textbox', { name: /^Preference/ }).focus()
  await page.keyboard.type('Nur Berlin')
  await goal.getByRole('combobox', { name: /^Priority/ }).selectOption({ label: 'Required' })
  const saveGoal = goal.getByRole('button', { name: SAVE_GOAL, exact: true })
  await expect(saveGoal).toBeDisabled()
  await goal.getByRole('checkbox', { name: CONFIRM_GOAL }).focus()
  await page.keyboard.press('Space')
  await expect(saveGoal).toBeEnabled()

  // While the Goal draft is open, saving the Profile (a re-render of the other region with a
  // new server baseline) must neither clear nor write the Goal draft.
  const editProfile = profile.getByRole('button', { name: 'Edit', exact: true })
  await editProfile.click()
  await profile.getByRole('textbox', { name: /^Supporting details/ }).nth(1).fill('Vier Kursprojekte (DEMO)')
  await profile.getByRole('checkbox', { name: CONFIRM_PROFILE }).check()
  await saveProfile.click()
  await expect(profile.getByRole('textbox')).toHaveCount(0)
  // The server's document is adopted over the local text, with its stable ids and revision.
  await expect(profile).toContainText(SKILL_DETAIL)
  await expect(profile).not.toContainText('Vier Kursprojekte (DEMO)')
  expect(puts.profile).toHaveLength(2)
  expect(puts.profile[1]).toEqual({
    expected_revision: 1,
    evidence: [
      { evidence_id: E_QUAL, kind: 'qualification', label: NOT_ENROLLED, description: 'Exmatrikulation zum 31.03.2025 (DEMO)' },
      { evidence_id: E_SKILL, kind: 'skill', label: 'Python', description: 'Vier Kursprojekte (DEMO)' },
    ],
  })
  expect(puts.goal).toHaveLength(0)
  await expect(goal.getByRole('textbox', { name: /^Preference/ })).toHaveValue('Nur Berlin')
  await expect(saveGoal).toBeEnabled()

  await saveGoal.focus()
  await page.keyboard.press('Enter')
  await expect(goal).toContainText('Job preferences saved and confirmed.')
  await expect(goal.getByRole('textbox')).toHaveCount(0)
  await expect(goal).toContainText('Nur Berlin')
  // Closing the form after a save returns keyboard focus to its Edit action.
  await expect(goal.getByRole('button', { name: 'Edit', exact: true })).toBeFocused()
  expect(puts.goal).toEqual([{
    expected_revision: 0, objective: null,
    constraints: [{ constraint_id: null, kind: 'location', label: 'Nur Berlin', description: null, importance: 'required' }],
  }])
  expect(puts.profile).toHaveLength(2)

  // Leaving Settings and returning reads what the server saved; nothing is written again.
  await settingsSections(page).getByRole('button', { name: 'API', exact: true }).click()
  await settingsSections(page).getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(profileSection(page)).toContainText(NOT_ENROLLED)
  await expect(goalSection(page)).toContainText('Nur Berlin')
  await expect(profileSection(page).getByRole('textbox')).toHaveCount(0)
  await settle(page)
  expect(count(calls, 'GET /profile')).toBe(2)
  expect(count(calls, 'GET /goal')).toBe(2)
  expect(count(calls, 'PUT /profile')).toBe(2)
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

  await openProfile(page)
  const profile = profileSection(page)
  const goal = goalSection(page)
  // A failed read is not an empty Profile: no "nothing added yet" text and no start action,
  // only the failure and an explicit retry. The other region's genuinely empty state is unaffected.
  await expect(profile.getByRole('alert')).toHaveText('Could not load local data. Try reading again.')
  await expect(profile).not.toContainText('No background or skills added yet')
  await expect(profile.getByRole('button', { name: 'Add background and skills', exact: true })).toHaveCount(0)
  await expect(goal.getByRole('alert')).toHaveCount(0)
  await expect(goal).toContainText('No preferences added yet.')
  await expect(profile.getByRole('textbox')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain(private_detail)
  await settle(page)
  // A failed read is never retried automatically.
  expect(count(calls, 'GET /profile')).toBe(1)
  await profile.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(profile).toContainText('Saved data read.')
  await expect(profile.getByRole('alert')).toHaveCount(0)
  expect(count(calls, 'GET /profile')).toBe(2)
  // Only now that the read succeeded is nothing-saved shown, with its start action.
  await expect(profile).toContainText('No background or skills added yet.')

  await profile.getByRole('button', { name: 'Add background and skills', exact: true }).click()
  await profile.getByRole('button', { name: 'Add background or skill', exact: true }).click()
  await profile.getByRole('textbox', { name: 'Confirmed fact' }).fill('Python')
  await profile.getByRole('textbox', { name: /^Supporting details/ }).fill(SKILL_DETAIL)
  await profile.getByRole('checkbox', { name: CONFIRM_PROFILE }).check()
  const save = profile.getByRole('button', { name: SAVE_PROFILE, exact: true })
  const cancel = profile.getByRole('button', { name: 'Cancel', exact: true })
  await save.click()

  // While the request is pending the region is busy and nothing else can be sent.
  await expect(profile).toContainText('Working…')
  await expect(save).toBeDisabled()
  await expect(cancel).toBeDisabled()
  await settle(page)
  expect(puts).toHaveLength(1)
  hold.resolve()

  // A rejected save keeps the draft, shows a safe message beside it and allows another attempt.
  await expect(profile.getByRole('alert')).toHaveText('Check the entries and confirmed evidence. This change was rejected.')
  await expect(profile).toContainText('Your draft is still here.')
  expect(await page.locator('body').innerText()).not.toContain(private_detail)
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveValue('Python')
  await expect(profile.getByRole('button', { name: /^Read saved Profile/ })).toHaveCount(0)
  await expect(save).toBeEnabled()
  await save.click()

  // Unknown outcome: no automatic replay, writes are locked until the user reads.
  await expect(profile.getByRole('alert')).toHaveText('Save outcome unknown. Read saved data before another write.')
  await expect(profile).toContainText('do not repeat a save whose result is uncertain')
  await expect(save).toBeDisabled()
  await expect(cancel).toBeDisabled()
  await settle(page)
  expect(puts).toHaveLength(2)
  expect(puts[0]).toEqual(puts[1])
  expect(count(calls, 'GET /profile')).toBe(2)
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveValue('Python')
  // The recovery action sits in the same region as the failure it resolves.
  await profile.getByRole('button', { name: 'Read saved Profile', exact: true }).click()
  await expect(profile).toContainText('Saved version for comparison')
  await expect(profile).toContainText('Revision 1')
  // The server's saved content is shown for comparison while the retained draft stays below.
  await expect(profile).toContainText(NOT_ENROLLED)
  await expect(profile).toContainText('Further writes stay locked.')
  await expect(save).toBeDisabled()
  expect(puts).toHaveLength(2)
  // The draft is kept until the user explicitly adopts the saved version.
  await expect(profile.getByRole('textbox', { name: 'Confirmed fact' })).toHaveValue('Python')
  await profile.getByRole('button', { name: 'Use saved version', exact: true }).click()
  await expect(profile).toContainText('Saved version adopted.')
  await expect(profile.getByRole('textbox')).toHaveCount(0)
  await expect(profile).toContainText(NOT_ENROLLED)
  await expect(profile).toContainText(profileDoc(1).evidence[0].description)
  // Adopting the saved version re-requires confirmation; the lost save was never replayed.
  await profile.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(save).toBeDisabled()
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click()
  await settle(page)
  expect(puts).toHaveLength(2)
  expect(count(calls, 'GET /profile')).toBe(3)
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

// --------------------------------------------------------------- PUX_ENTRY / PUX_CONFLICT / PUX_NAV

const GOAL_OBJECTIVE = 'Werkstudentenstelle in Datenanalyse mit Bezug zur Energiewirtschaft (DEMO)'

test('Settings opens straight on saved Background and skills and Job preferences without a nested workspace entry', async ({ page, context, baseURL }) => {
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      'GET /profile': (route) => route.fulfill({ json: longProfile() }),
      'GET /goal': (route) => route.fulfill({ json: { ...goalDoc(1), objective: GOAL_OBJECTIVE } }),
    },
  })

  // No other page reads personal data.
  await page.goto('/')
  await mainNavigation(page).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo Student')
  await settle(page)
  expect(count(calls, 'GET /profile') + count(calls, 'GET /goal')).toBe(0)

  // Arriving on Settings shows content at once; the Profile category is the default.
  await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  const profile = profileSection(page)
  const goal = goalSection(page)
  await expect(settingsSections(page).getByRole('button', { name: 'Profile', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(userSection(page).getByLabel('Display name', { exact: true })).toHaveValue('Demo Student')
  await expect(page.getByRole('button', { name: 'Open Profile and Goal' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Close workspace' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Profile and Goal' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Profile and Goal' })).toHaveCount(0)

  // Saved content is read-only until the user asks to edit that region.
  await expect(profile).toContainText('Saved · confirmed by you')
  await expect(profile).toContainText(NOT_ENROLLED)
  await expect(profile).toContainText(SKILL_DETAIL)
  await expect(profile).toContainText('Werkstudententätigkeit in der Netzentgeltabrechnung eines Verteilnetzbetreibers (DEMO)')
  await expect(profile.getByRole('listitem')).toHaveCount(3)
  await expect(goal).toContainText(GOAL_OBJECTIVE)
  await expect(goal).toContainText('Nur Berlin')
  for (const region of [profile, goal]) {
    await expect(region.getByRole('textbox')).toHaveCount(0)
    await expect(region.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  }
  await expect(profile.getByRole('button', { name: SAVE_PROFILE, exact: true })).toHaveCount(0)
  await expect(goal.getByRole('button', { name: SAVE_GOAL, exact: true })).toHaveCount(0)
  // Internal vocabulary is not needed to read the page.
  const pageText = await page.getByRole('region', { name: 'Profile', exact: true }).innerText()
  expect(pageText).not.toMatch(/\b(evidence|constraint|revision|workspace)\b/i)

  // Each domain was read exactly once; the other Settings category does not add reads.
  await expect.poll(() => count(calls, 'GET /goal')).toBe(1)
  expect(count(calls, 'GET /profile')).toBe(1)
  await settingsSections(page).getByRole('button', { name: 'API', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Posting parsing', exact: true })).toBeVisible()
  await settle(page)
  expect(count(calls, 'GET /profile')).toBe(1)
  expect(count(calls, 'GET /goal')).toBe(1)
  expect(calls.filter((call) => !call.startsWith('GET'))).toEqual([])
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('a version conflict keeps the Goal draft beside its recovery, never overwrites newer data and adopts it only on request', async ({ page, context, baseURL }) => {
  const NEWER_LABEL = 'Berlin oder Remote (DEMO)'
  const OLD_DRAFT = 'Nur München (DEMO)'
  const newerGoal = (revision, label) => {
    const doc = goalDoc(revision)
    return { ...doc, constraints: [{ ...doc.constraints[0], label }] }
  }
  let server = goalDoc(1)
  const puts = []
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      'GET /profile': (route) => route.fulfill({ json: null }),
      'GET /goal': (route) => route.fulfill({ json: server }),
      'PUT /goal': (route, request) => {
        const body = request.postDataJSON()
        puts.push(body)
        if (puts.length === 1) {
          // Someone else saved revision 2 first; the stale write is rejected.
          server = newerGoal(2, NEWER_LABEL)
          return route.fulfill({ status: 409, json: { detail: 'PRIVATE-CONFLICT-DETAIL' } })
        }
        server = newerGoal(3, body.constraints[0].label)
        return route.fulfill({ json: server })
      },
    },
  })

  await openProfile(page)
  const goal = goalSection(page)
  await expect(goal).toContainText('Nur Berlin')
  await goal.getByRole('button', { name: 'Edit', exact: true }).click()
  const preference = goal.getByRole('textbox', { name: /^Preference/ })
  await preference.fill(OLD_DRAFT)
  await goal.getByRole('checkbox', { name: CONFIRM_GOAL }).check()
  const save = goal.getByRole('button', { name: SAVE_GOAL, exact: true })
  await save.click()

  // The conflict is explained next to the draft; the stale draft is kept but cannot be re-sent.
  await expect(goal.getByRole('alert')).toHaveText('Inputs changed. Read saved data and compare before confirming again.')
  expect(await page.locator('body').innerText()).not.toContain('PRIVATE-CONFLICT-DETAIL')
  await expect(preference).toHaveValue(OLD_DRAFT)
  await expect(save).toBeDisabled()
  await settle(page)
  expect(puts).toEqual([{
    expected_revision: 1, objective: null,
    constraints: [{ constraint_id: C_LOC, kind: 'location', label: OLD_DRAFT, description: null, importance: 'required' }],
  }])
  // Nothing is re-read or re-sent on its own.
  expect(count(calls, 'GET /goal')).toBe(1)

  await goal.getByRole('button', { name: 'Read saved Goal', exact: true }).click()
  await expect(goal).toContainText('Saved version for comparison')
  await expect(goal).toContainText('Revision 2')
  await expect(goal).toContainText(NEWER_LABEL)
  await expect(preference).toHaveValue(OLD_DRAFT)
  await expect(save).toBeDisabled()
  expect(puts).toHaveLength(1)

  // Only the explicit action replaces the retained draft with the newer saved content.
  await goal.getByRole('button', { name: 'Use saved version', exact: true }).click()
  await expect(goal).toContainText(NEWER_LABEL)
  await expect(goal).not.toContainText(OLD_DRAFT)
  await goal.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(preference).toHaveValue(NEWER_LABEL)
  await expect(save).toBeDisabled()
  await goal.getByRole('checkbox', { name: CONFIRM_GOAL }).check()
  await save.click()
  await expect(goal).toContainText('Job preferences saved and confirmed.')
  // The new write is built on the newer revision and its identity, never on the old draft.
  expect(puts).toHaveLength(2)
  expect(puts[1]).toEqual({
    expected_revision: 2, objective: null,
    constraints: [{ constraint_id: C_LOC, kind: 'location', label: NEWER_LABEL, description: null, importance: 'required' }],
  })
  await expect(goal).not.toContainText(OLD_DRAFT)
  expect(calls.filter((call) => call.startsWith('PUT /profile'))).toEqual([])
  expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('leaving Settings during a pending save drops local drafts without cancelling the write, and the late response cannot reach the re-entered page', async ({ page, context, baseURL }) => {
  const COMMITTED = 'Vier Kursprojekte (DEMO)'
  const LOCAL_ONLY = 'Entwurf nur lokal (DEMO)'
  let server = profileDoc(1)
  const hold = deferred()
  const puts = []
  const { calls, unexpected } = await installBackend({
    context, baseURL, routes: {
      'GET /profile': (route) => route.fulfill({ json: server }),
      'GET /goal': (route) => route.fulfill({ json: goalDoc(1) }),
      'PUT /profile': async (route, request) => {
        puts.push(request.postDataJSON())
        await hold.promise
        const doc = profileDoc(2)
        server = { ...doc, evidence: doc.evidence.map((entry) => entry.evidence_id === E_SKILL ? { ...entry, description: COMMITTED } : entry) }
        await route.fulfill({ json: server })
      },
    },
  })

  try {
    await openProfile(page)
    const profile = profileSection(page)
    const goal = goalSection(page)
    // An unsaved Goal draft and a Profile save that is still in flight.
    await goal.getByRole('button', { name: 'Edit', exact: true }).click()
    await goal.getByRole('textbox', { name: /^Preference/ }).fill(LOCAL_ONLY)
    await profile.getByRole('button', { name: 'Edit', exact: true }).click()
    await profile.getByRole('textbox', { name: /^Supporting details/ }).nth(1).fill(COMMITTED)
    await profile.getByRole('checkbox', { name: CONFIRM_PROFILE }).check()
    await profile.getByRole('button', { name: SAVE_PROFILE, exact: true }).click()
    await expect.poll(() => puts.length).toBe(1)
    await expect(profile).toContainText('Working…')

    // Leaving and coming back reads the server again; the local drafts are gone.
    await settingsSections(page).getByRole('button', { name: 'API', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Posting parsing', exact: true })).toBeVisible()
    await settingsSections(page).getByRole('button', { name: 'Profile', exact: true }).click()
    await expect(profileSection(page)).toContainText(SKILL_DETAIL)
    await expect(goalSection(page)).toContainText('Nur Berlin')
    await expect(goalSection(page)).not.toContainText(LOCAL_ONLY)
    await expect(page.getByRole('region', { name: 'Profile', exact: true }).getByRole('textbox', { name: /^(Confirmed fact|Preference|Supporting|Objective)/ })).toHaveCount(0)
    expect(count(calls, 'GET /profile')).toBe(2)
    expect(count(calls, 'GET /goal')).toBe(2)

    // The abandoned request finishes after re-entry: its response belongs to the old page.
    hold.resolve()
    await settle(page)
    await expect(profileSection(page)).toContainText(SKILL_DETAIL)
    await expect(profileSection(page)).not.toContainText(COMMITTED)
    await expect(profileSection(page)).not.toContainText('saved and confirmed')
    await expect(profileSection(page).getByRole('alert')).toHaveCount(0)

    // Leaving did not undo the write: an explicit read now shows what the server committed.
    await profileSection(page).getByRole('button', { name: 'Refresh saved background and skills', exact: true }).click()
    await expect(profileSection(page)).toContainText(COMMITTED)
    expect(puts).toHaveLength(1)
    expect(count(calls, 'PUT /goal')).toBe(0)
    expect(count(calls, 'GET /profile')).toBe(3)
    expect(unexpected, 'All non-Vite requests must be explicitly mocked').toEqual([])
  } finally {
    hold.resolve()
  }
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
export function visibilityProblem(locator) {
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
    // An inline element that wraps (long German text in a narrow window) has a bounding box that
    // also spans empty space beside its lines, so probing the box centre would hit the parent.
    // Probe the centre of each real line box instead; the target must still be what is hit there.
    const lineBoxes = [...el.getClientRects()].filter((box) => box.width > 0 && box.height > 0)
    const points = lineBoxes.length > 1
      ? lineBoxes.map((box) => [box.left + box.width / 2, box.top + box.height / 2])
      : [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + inset, rect.top + inset]]
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y)
      if (!hit || !el.contains(hit)) return `covered by ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 40)}` : 'nothing'}`
    }
    return null
  })
}

// Scroll the nearest real scroll container so the first target sits a little below its top,
// then require every named target to be demonstrably visible in that one frame. Margins are
// tried in order so a sticky Card header cannot hide the first target.
export async function frameTargets(targets) {
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

// Every scrolled container (and the window) at the moment of a first-screen capture.
export function scrollOffsets(page) {
  return page.evaluate(() => {
    const moved = []
    if (window.scrollY > 0) moved.push(`window ${window.scrollY}`)
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollTop > 0) moved.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)} ${element.scrollTop}`)
    }
    return moved
  })
}

// A field row has no unused column: it declares no more grid columns than it has fields, and
// the fields reach its right edge without leaving it. Narrow stacked rows satisfy this too.
async function expectFilledRow(row, fields, what) {
  const measured = await row.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const boxes = [...element.children].map((child) => child.getBoundingClientRect())
    return {
      children: boxes.length,
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length,
      rowRight: rect.right, maxRight: Math.max(...boxes.map((box) => box.right)),
    }
  })
  expect(measured.children, `${what}: expected ${fields} fields in the row`).toBe(fields)
  expect(measured.columns, `${what}: no column without a field`).toBeLessThanOrEqual(fields)
  expect(measured.maxRight, `${what}: fields reach the row's right edge`).toBeGreaterThanOrEqual(measured.rowRight - 2)
  expect(measured.maxRight, `${what}: fields stay inside the row`).toBeLessThanOrEqual(measured.rowRight + 1)
  return measured
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
      // A newer revision exists on the server, so the Goal write is rejected as a conflict.
      'PUT /goal': (route) => {
        const newer = goalDoc(2)
        savedGoal = { ...newer, constraints: [{ ...newer.constraints[0], label: 'Berlin oder Remote (DEMO)' }] }
        return route.fulfill({ status: 409, json: { detail: 'DEMO conflict' } })
      },
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
  // `firstScreen` marks the untouched arrival view: nothing may be scrolled into place, so
  // every scroll offset must be zero and every target must already sit inside the window.
  // `image: false` still asserts geometry and targets but adds no picture (the unchanged Match
  // states keep their earlier pictures only as historical references).
  async function capture(state, root, targets = [], { firstScreen = false, image = true } = {}) {
    // The unchanged Home reference is only photographed; its own layout is not under test.
    const problems = root ? await layoutProblems(root) : []
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    geometry.states[state] = { documentOverflow: overflow, layoutProblems: problems, shown: targets.map(([name]) => name), firstScreen }
    expect(overflow, `${state}: the page must not scroll horizontally`).toBeLessThanOrEqual(1)
    expect(problems, `${state}: nothing may leave the viewport or be clipped`).toEqual([])
    if (firstScreen) {
      const scrolled = await scrollOffsets(page)
      geometry.states[state].scrollOffsets = scrolled
      expect(scrolled, `${state}: the first screen must be captured unscrolled`).toEqual([])
      const hidden = []
      for (const [name, locator] of targets) {
        const problem = await visibilityProblem(locator)
        if (problem) hidden.push(`${name}: ${problem}`)
      }
      expect(hidden, `${state}: every named target must be visible without scrolling`).toEqual([])
    } else if (targets.length > 0) await frameTargets(targets)
    geometry.states[state].boxes = Object.fromEntries(await Promise.all(targets.map(async ([name, locator]) => [name, await locator.boundingBox()])))
    if (!image) return
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

  const profile = profileSection(page)
  const goal = goalSection(page)
  const user = userSection(page)
  const sections = settingsSections(page)
  const workspace = page.getByRole('region', { name: 'Profile', exact: true })
  const enterSettings = async () => {
    // Always from the real main navigation: Settings re-opens on Profile at scroll position zero.
    await mainNavigation(page).getByRole('button', { name: 'Home', exact: true }).click()
    await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  }
  const arrival = (extra) => [
    ['Settings sections navigation', sections],
    ['User information heading', user.getByRole('heading', { name: 'User information', level: 2 })],
    ['Display name field', user.getByLabel('Display name', { exact: true })],
    ['Background and skills heading', profile.getByRole('heading', { name: 'Background and skills', level: 2 })],
    ...extra,
  ]

  // First entry with nothing saved: the very first screen, never scrolled, shows the page
  // frame, the display name and the start of Background and skills with its start action.
  await mainNavigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(profile).toContainText('No background or skills added yet.')
  await expect(goal).toContainText('No preferences added yet.')
  await capture('first-entry-empty', workspace, arrival([
    ['Background and skills empty text', profile.getByText(/^No background or skills added yet\./)],
    ['Add background and skills', profile.getByRole('button', { name: 'Add background and skills', exact: true })],
  ]), { firstScreen: true })

  // First entry with long saved German content.
  savedProfile = longProfile()
  savedGoal = goalDoc(1)
  await enterSettings()
  await expect(profile.getByRole('listitem')).toHaveCount(3)
  await expect(goal).toContainText('Nur Berlin')
  await capture('first-entry-saved', workspace, arrival([
    ['Background and skills Edit', profile.getByRole('button', { name: 'Edit', exact: true })],
    ['First saved fact', profile.getByText(NOT_ENROLLED, { exact: true })],
  ]), { firstScreen: true })
  // Additional frames below: scrolled on purpose, to show the rest of the saved content.
  await capture('saved-long-scrolled', workspace, [
    ['Third (long German) saved fact', profile.getByText('Werkstudententätigkeit in der Netzentgeltabrechnung eines Verteilnetzbetreibers (DEMO)', { exact: true })],
    ['Third (long German) details', profile.getByText(/^Monatliche Plausibilitätsprüfungen/)],
  ])
  await capture('saved-goal-scrolled', workspace, [
    ['Job preferences heading', goal.getByRole('heading', { name: 'Job preferences', level: 2 })],
    ['Job preferences Edit', goal.getByRole('button', { name: 'Edit', exact: true })],
    ['Saved preference', goal.getByText('Nur Berlin', { exact: true })],
  ])

  // Editing Background and skills: a two-field row, and Save/Cancel kept together.
  await profile.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(profile.locator('legend')).toBeFocused()
  const facts = profile.getByRole('textbox', { name: 'Confirmed fact' })
  const details = profile.getByRole('textbox', { name: /^Supporting details/ })
  await expect(facts).toHaveCount(3)
  await capture('profile-edit', workspace, [
    ['Edit form legend', profile.locator('legend')],
    ['First fact field', facts.nth(0)],
    ['First details field', details.nth(0)],
  ])
  geometry.states['profile-edit'].row = await expectFilledRow(profile.locator('[class*="candidate-workspace__row"]').first(), 2, 'Profile field row')
  const confirmProfile = profile.getByRole('checkbox', { name: CONFIRM_PROFILE })
  const saveProfile = profile.getByRole('button', { name: SAVE_PROFILE, exact: true })
  const cancelProfile = profile.getByRole('button', { name: 'Cancel', exact: true })
  await capture('profile-edit-actions-scrolled', workspace, [
    ['Confirmation checkbox', confirmProfile],
    ['Save background and skills', saveProfile],
    ['Cancel', cancelProfile],
  ])
  const saveBox = await saveProfile.boundingBox()
  const cancelBox = await cancelProfile.boundingBox()
  expect(Math.abs(saveBox.y - cancelBox.y), 'Save and Cancel share one row').toBeLessThanOrEqual(2)
  expect(cancelBox.x, 'Cancel follows Save').toBeGreaterThan(saveBox.x)

  // A rejected save stays beside the retained draft, with its next step.
  await confirmProfile.check()
  await saveProfile.click()
  await expect(profile.getByRole('alert')).toContainText('This change was rejected.')
  await capture('profile-save-error', workspace, [
    ['Background and skills heading', profile.getByRole('heading', { name: 'Background and skills', level: 2 })],
    ['Save rejection alert', profile.getByRole('alert')],
    ['Draft kept notice', profile.getByText(/^Your draft is still here\./)],
    ['Retained first fact', facts.nth(0)],
  ])
  await capture('profile-save-error-actions-scrolled', workspace, [
    ['Confirmation checkbox', confirmProfile],
    ['Save background and skills', saveProfile],
    ['Cancel', cancelProfile],
  ])
  await cancelProfile.click()
  await expect(profile).toContainText('Draft cancelled. No write was sent.')

  // Job preferences: a three-field row, then a version conflict with its recovery action.
  await goal.getByRole('button', { name: 'Edit', exact: true }).click()
  const preference = goal.getByRole('textbox', { name: /^Preference/ })
  await capture('goal-edit', workspace, [
    ['Edit form legend', goal.locator('legend')],
    ['Type field', goal.getByRole('combobox', { name: /^Type/ })],
    ['Preference field', preference],
    ['Priority field', goal.getByRole('combobox', { name: /^Priority/ })],
  ])
  geometry.states['goal-edit'].row = await expectFilledRow(goal.locator('[class*="candidate-workspace__row"]').first(), 3, 'Goal field row')
  await preference.fill('Nur München (DEMO)')
  await goal.getByRole('checkbox', { name: CONFIRM_GOAL }).check()
  await goal.getByRole('button', { name: SAVE_GOAL, exact: true }).click()
  await expect(goal.getByRole('alert')).toContainText('Inputs changed.')
  await capture('goal-conflict', workspace, [
    ['Job preferences heading', goal.getByRole('heading', { name: 'Job preferences', level: 2 })],
    ['Conflict alert', goal.getByRole('alert')],
    ['Read saved Goal', goal.getByRole('button', { name: 'Read saved Goal', exact: true })],
  ])
  await goal.getByRole('button', { name: 'Read saved Goal', exact: true }).click()
  await expect(goal).toContainText('Saved version for comparison')
  await capture('goal-conflict-compare', workspace, [
    ['Comparison heading', goal.getByRole('heading', { name: 'Saved version for comparison' })],
    ['Newer saved preference', goal.getByText('Berlin oder Remote (DEMO)', { exact: true })],
    ['Use saved version', goal.getByRole('button', { name: 'Use saved version', exact: true })],
  ])
  await goal.getByRole('button', { name: 'Use saved version', exact: true }).click()
  await expect(goal).toContainText('Saved version adopted.')

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
  await capture('match-empty', panel, [], { image: false })
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
  ], { image: false })
  for (const text of ['Eligibility', 'requirement 1', 'requirement 2', 'Preferences']) await openGroup(page, panel, text)
  await groupIn(page, panel, 'Preferences').scrollIntoViewIfNeeded()
  await capture('match-groups', panel, [], { image: false })

  await groupIn(page, panel, 'Eligibility').getByRole('button', { name: /^Confirm or correct/ }).click()
  const editor = panel.locator('form.posting-match__editor')
  await expect(editor).toBeVisible()
  await editor.scrollIntoViewIfNeeded()
  await capture('match-editor', panel, [], { image: false })
  await editor.getByRole('button', { name: 'Cancel judgment changes', exact: true }).click()
  await expect(editor).toHaveCount(0)

  readMode = 'fail'
  await panel.getByRole('button', { name: 'Read saved review', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('Could not read the review.')
  await panel.scrollIntoViewIfNeeded()
  await capture('match-read-error', panel, [], { image: false })

  readMode = 'ok'
  view = STALE_VIEW()
  await panel.getByRole('button', { name: 'Read saved review', exact: true }).click()
  await expect(panel).toContainText('Needs re-evaluation: profile.')
  await panel.scrollIntoViewIfNeeded()
  await capture('match-stale', panel, [], { image: false })

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
