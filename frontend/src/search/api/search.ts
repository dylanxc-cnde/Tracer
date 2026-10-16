import type { PostingCard } from '../../postings/types/postingCard'
import type { SearchRecord, SearchResults, SearchTarget } from '../types/search'

const API_BASE_URL = 'http://127.0.0.1:8000'
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isId = (value: unknown): value is string => isText(value) && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const homeTypes = ['task', 'event', 'application']
const isTextList = (value: unknown) => Array.isArray(value) && value.every(isText)
const isNullableText = (value: unknown) => value === null || isText(value)
const isNullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const isOrigin = (value: unknown) => value === 'source' || value === 'user_defined'
const isFact = (value: unknown, validate: (value: unknown) => boolean) => isRecord(value) && isOrigin(value.origin) && validate(value.value)
const isOptionalFact = (value: unknown, validate: (value: unknown) => boolean) => value === null || isFact(value, validate)
const isFactList = (value: unknown) => Array.isArray(value) && value.every(item => isFact(item, isText))
function isTarget(value: unknown): boolean {
  return isRecord(value) && ['card', ...homeTypes].includes(String(value.kind)) && isId(value.id)
}
function isResults(value: unknown): boolean {
  return isRecord(value) && typeof value.has_more === 'boolean' && Array.isArray(value.results) && value.results.length <= 50 && value.results.every(result =>
    isRecord(result) && ['job', 'company', 'note', ...homeTypes].includes(String(result.type))
    && isText(result.source) && isText(result.title) && isText(result.snippet)
    && typeof result.card_missing === 'boolean' && isTarget(result.target)
    && isRecord(result.target) && result.target.kind === (homeTypes.includes(String(result.type)) ? result.type : 'card'))
}
function isHomeRecord(value: unknown): boolean {
  return isRecord(value) && homeTypes.includes(String(value.type)) && isId(value.id)
    && isText(value.title) && isText(value.source) && typeof value.card_missing === 'boolean'
    && (value.card_key === null || isId(value.card_key)) && Array.isArray(value.fields)
    && value.fields.every(field => isRecord(field) && isText(field.label) && isText(field.value))
}
function isCard(value: unknown): boolean {
  if (!isRecord(value) || !isId(value.card_key) || !isId(value.import_key)
    || typeof value.schema_version !== 'number' || !Number.isInteger(value.schema_version) || !isText(value.created_at)
    || !isNullableText(value.posting_alias) || !isNullableText(value.user_notes)
    || !isTextList(value.tags) || !isRecord(value.posting)) return false
  const posting = value.posting
  // The existing detail reader dereferences nested sources and lists immediately.
  // Validate their shape before mounting it; an unreadable response stays retryable.
  const sections = ['identity', 'company', 'classification', 'work_conditions', 'role_content', 'requirements', 'compensation', 'application_instructions']
  if (!sections.every(key => {
    const section = posting[key]
    return isRecord(section) && isRecord(section.source)
      && isTextList(section.source.excerpts) && isTextList(section.source.source_urls)
  })) return false
  const identity = posting.identity as Record<string, unknown>
  const company = posting.company as Record<string, unknown>
  const classification = posting.classification as Record<string, unknown>
  const work = posting.work_conditions as Record<string, unknown>
  const role = posting.role_content as Record<string, unknown>
  const requirements = posting.requirements as Record<string, unknown>
  const compensation = posting.compensation as Record<string, unknown>
  const application = posting.application_instructions as Record<string, unknown>
  return ['company_name', 'department_name', 'position_title', 'external_job_id', 'canonical_posting_url', 'source_platform', 'published_on', 'posting_language'].every(key => isOptionalFact(identity[key], isText))
    && isFactList(company.industry_tags) && ['employee_range', 'company_summary'].every(key => isOptionalFact(company[key], isText))
    && isOptionalFact(classification.role_families, isTextList)
    && ['workload_type', 'contract_type', 'seniority', 'internship_requirement', 'eligibility'].every(key => isOptionalFact(classification[key], isText))
    && ['primary_address', 'schedule', 'travel_requirement', 'start_on', 'duration'].every(key => isOptionalFact(work[key], isText))
    && isTextList(work.address_candidates) && isOptionalFact(work.work_modes, isTextList)
    && (work.weekly_hours === null || (isRecord(work.weekly_hours) && isOrigin(work.weekly_hours.origin)
      && isNullableNumber(work.weekly_hours.minimum) && isNullableNumber(work.weekly_hours.maximum)))
    && isOptionalFact(role.role_summary, isText) && isFactList(role.responsibilities) && isFactList(role.domains)
    && Array.isArray(requirements.groups) && requirements.groups.every(group => isRecord(group)
      && isOrigin(group.origin) && isText(group.importance) && isText(group.item_rule)
      && Array.isArray(group.items) && group.items.every(item => isRecord(item)
        && isText(item.name) && isText(item.category) && typeof item.is_example === 'boolean'))
    && Array.isArray(compensation.entries) && compensation.entries.every(entry => isRecord(entry)
      && isOrigin(entry.origin) && isText(entry.compensation_type) && isText(entry.pay_basis)
      && isNullableNumber(entry.minimum_amount) && isNullableNumber(entry.maximum_amount)
      && isNullableText(entry.currency) && isNullableText(entry.period)
      && isTextList(entry.applicable_groups) && isNullableText(entry.payment_conditions))
    && isFactList(compensation.benefits) && isOptionalFact(compensation.vacation_days, isNullableNumber)
    && isOptionalFact(application.channels, isTextList)
    && ['application_url', 'required_email_subject', 'application_deadline'].every(key => isOptionalFact(application[key], isText))
    && isFactList(application.required_documents) && isFactList(application.special_instructions)
    && (posting.contact === null || (isRecord(posting.contact) && isOrigin(posting.contact.origin)
      && ['name', 'role', 'email', 'phone'].every(key => isRecord(posting.contact) && isNullableText(posting.contact[key]))
      && isRecord(posting.contact.source) && isTextList(posting.contact.source.excerpts) && isTextList(posting.contact.source.source_urls)))
}

async function read<T>(path: string, signal: AbortSignal, validate: (value: unknown) => boolean): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal })
  if (!response.ok) {
    if (response.status === 404) throw new Error('This record is no longer available. Search again to refresh the results.')
    throw new Error('Local search is unavailable. Please try again.')
  }
  const value: unknown = await response.json()
  if (!validate(value)) throw new Error('Search returned unreadable data. Please try again.')
  return value as T
}
export const getSearchResults = (query: string, signal: AbortSignal) => read<SearchResults>(
  `/search?${new URLSearchParams({ q: query, limit: '20' })}`, signal, isResults,
)
export const getSearchRecord = (target: SearchTarget, signal: AbortSignal) => read<SearchRecord>(
  `/search/records/${encodeURIComponent(target.kind)}/${encodeURIComponent(target.id)}`, signal,
  value => isHomeRecord(value) && isRecord(value) && value.id === target.id && value.type === target.kind,
)
export const getSearchCard = (id: string, signal: AbortSignal) => read<PostingCard>(
  `/posting/card/${encodeURIComponent(id)}`, signal, value => isCard(value) && isRecord(value) && value.card_key === id,
)
