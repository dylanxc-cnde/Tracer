import type { CandidateProfile, JobSearchGoal, MatchView, SaveGoalRequest, SaveJudgmentRequest, SaveProfileRequest } from '../types/profileMatch'
import { constraintKinds, evidenceKinds, statusLabels } from '../types/profileMatch'

const API_BASE_URL = 'http://127.0.0.1:8000'
export class PersonalApiError extends Error {
  readonly reconcile: boolean
  constructor(message: string, reconcile = false) { super(message); this.reconcile = reconcile }
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const optionalText = (v: unknown) => v === null || typeof v === 'string'
const revision = (v: unknown) => Number.isInteger(v) && Number(v) >= 0
const importance = (v: unknown) => ['required', 'preferred', 'unknown'].includes(String(v))
function profile(v: unknown): boolean {
  return v === null || (record(v) && text(v.profile_id) && revision(v.revision) && text(v.confirmed_at)
    && Array.isArray(v.evidence) && v.evidence.every(e => record(e) && text(e.evidence_id)
      && evidenceKinds.some(kind => kind === e.kind) && text(e.label) && optionalText(e.description)))
}
function goal(v: unknown): boolean {
  return v === null || (record(v) && text(v.goal_id) && revision(v.revision) && text(v.confirmed_at)
    && optionalText(v.objective) && Array.isArray(v.constraints) && v.constraints.every(e => record(e)
      && text(e.constraint_id) && constraintKinds.some(kind => kind === e.kind) && text(e.label)
      && optionalText(e.description) && importance(e.importance)))
}
function inputs(v: unknown): boolean {
  return record(v) && text(v.fingerprint) && text(v.posting_revision) && revision(v.profile_revision)
    && revision(v.goal_revision) && text(v.rule_revision)
}
function source(v: unknown): boolean {
  return record(v) && Array.isArray(v.excerpts) && v.excerpts.every(e => typeof e === 'string')
    && Array.isArray(v.source_urls) && v.source_urls.every(e => typeof e === 'string')
}
function parsed(v: unknown, array = false): boolean {
  return v === null || (record(v) && (array ? Array.isArray(v.value) && v.value.every(e => typeof e === 'string') : typeof v.value === 'string'))
}
function postingContext(v: unknown): boolean {
  if (!record(v) || !record(v.classification) || !record(v.requirements)
    || !record(v.work_conditions) || !record(v.compensation)) return false
  const c = v.classification, w = v.work_conditions, salary = v.compensation, weekly = w.weekly_hours
  return source(c.source) && source(v.requirements.source) && source(w.source) && source(salary.source)
    && parsed(c.role_families, true) && parsed(c.workload_type) && parsed(w.work_modes, true)
    && ['primary_address', 'schedule', 'start_on', 'duration'].every(k => parsed(w[k]))
    && Array.isArray(w.address_candidates) && w.address_candidates.every(e => typeof e === 'string')
    && (weekly === null || (record(weekly) && ['minimum', 'maximum'].every(k => weekly[k] === null || typeof weekly[k] === 'number')))
    && Array.isArray(salary.entries) && salary.entries.every(e => record(e) && text(e.compensation_type)
      && (e.minimum_amount === null || typeof e.minimum_amount === 'number')
      && (e.maximum_amount === null || typeof e.maximum_amount === 'number')
      && optionalText(e.currency) && optionalText(e.period) && text(e.pay_basis)
      && optionalText(e.payment_conditions) && Array.isArray(e.applicable_groups) && e.applicable_groups.every(g => typeof g === 'string'))
}
function match(v: unknown): boolean {
  if (!record(v) || typeof v.stale !== 'boolean' || !Array.isArray(v.stale_reasons)
    || !v.stale_reasons.every(r => ['posting', 'profile', 'goal', 'rules', 'card_missing'].includes(r))
    || !(v.current_inputs === null || inputs(v.current_inputs))) return false
  const m = v.match
  if (m === null) return true
  if (!record(m) || !text(m.match_id) || !text(m.card_key) || !revision(m.version) || !revision(m.revision)
    || m.mode !== 'local_review' || !inputs(m.inputs) || !profile(m.profile_snapshot) || !goal(m.goal_snapshot)
    || !postingContext(m.posting_snapshot)
    || !Array.isArray(m.groups) || !Array.isArray(m.judgments) || !record(m.summary)) return false
  const s = m.summary, coverage = s.evidence_coverage
  return m.groups.every(g => record(g) && text(g.group_id) && text(g.label)
    && ['qualification', 'capability', 'preference'].includes(String(g.dimension)) && importance(g.importance)
    && ['all_of', 'any_of', 'unknown'].includes(String(g.item_rule)) && Array.isArray(g.targets)
    && g.targets.every(t => record(t) && text(t.target_id) && text(t.label) && typeof t.is_example === 'boolean'
      && typeof t.posting_available === 'boolean' && optionalText(t.constraint_id)))
    && m.judgments.every(j => record(j) && text(j.judgment_id) && text(j.target_id)
      && Object.hasOwn(statusLabels, String(j.status)) && optionalText(j.reason) && optionalText(j.confirmed_at)
      && (j.confirmed_importance === null || importance(j.confirmed_importance)) && Array.isArray(j.evidence)
      && j.evidence.every(e => record(e) && ['profile', 'goal'].includes(String(e.kind)) && text(e.entry_id)))
    && Array.isArray(s.groups) && s.groups.every(g => record(g) && text(g.group_id) && importance(g.importance)
      && ['qualification', 'capability', 'preference'].includes(String(g.dimension)) && Object.hasOwn(statusLabels, String(g.status)))
    && ['qualification_warnings', 'capability_gaps', 'preference_conflicts'].every(k => Array.isArray(s[k]) && s[k].every(text))
    && record(coverage) && ['total', 'linked', 'unknown', 'explicitly_not_applicable'].every(k => revision(coverage[k]))
}

async function request<T>(path: string, method: 'GET' | 'PUT' | 'POST', validate: (v: unknown) => boolean, body?: object): Promise<T> {
  const writing = method !== 'GET'
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method, ...(body ? {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {}) })
  } catch {
    throw new PersonalApiError(writing ? 'Save outcome unknown. Read saved data before another write.' : 'Could not load local data. Try again.', writing)
  }
  if (!response.ok) {
    // Never display response bodies, personal values or storage exception text.
    if (response.status === 409) throw new PersonalApiError('Inputs changed. Read saved data and compare before confirming again.', true)
    if (response.status === 422) throw new PersonalApiError('Check the entries and confirmed evidence. This change was rejected.')
    if (response.status === 404) throw new PersonalApiError('This Card is unavailable. Close the review and refresh your library.')
    throw new PersonalApiError(writing ? 'Could not confirm the save. Read saved data before another write.' : 'Local storage is unavailable. Try reading again.', writing)
  }
  const value: unknown = await response.json().catch(() => undefined)
  if (!validate(value)) throw new PersonalApiError(writing ? 'Save response unreadable. Read saved data before another write.' : 'Could not read valid local data. Try again.', writing)
  return value as T
}
export const getCandidateProfile = () => request<CandidateProfile | null>('/profile', 'GET', profile)
export const getJobSearchGoal = () => request<JobSearchGoal | null>('/goal', 'GET', goal)
export const saveCandidateProfile = (body: SaveProfileRequest) => request<CandidateProfile>('/profile', 'PUT', v => v !== null && profile(v), body)
export const saveJobSearchGoal = (body: SaveGoalRequest) => request<JobSearchGoal>('/goal', 'PUT', v => v !== null && goal(v), body)
const base = (key: string) => `/matching/card/${encodeURIComponent(key)}`
export const getPostingMatch = (key: string) => request<MatchView>(base(key), 'GET', match)
export const evaluatePostingMatch = (key: string, fingerprint: string) => request<MatchView>(`${base(key)}/evaluate`, 'POST', match, { expected_inputs: fingerprint })
export const savePostingJudgment = (key: string, matchId: string, targetId: string, body: SaveJudgmentRequest) => request<MatchView>(`${base(key)}/${encodeURIComponent(matchId)}/judgment/${encodeURIComponent(targetId)}`, 'PUT', match, body)
