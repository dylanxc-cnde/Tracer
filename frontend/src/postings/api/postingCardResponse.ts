import type { PostingCard } from '../types/postingCard'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isId = (value: unknown): value is string => isText(value) && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const isTextList = (value: unknown) => Array.isArray(value) && value.every(isText)
const isNullableText = (value: unknown) => value === null || isText(value)
const isNullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const isOrigin = (value: unknown) => value === 'source' || value === 'user_defined'
const isFact = (value: unknown, validate: (value: unknown) => boolean) => isRecord(value) && isOrigin(value.origin) && validate(value.value)
const isOptionalFact = (value: unknown, validate: (value: unknown) => boolean) => value === null || isFact(value, validate)
const isFactList = (value: unknown) => Array.isArray(value) && value.every(item => isFact(item, isText))
export function isPostingCardResponse(value: unknown, cardKey: string): value is PostingCard {
  if (!isRecord(value) || !isId(value.card_key) || value.card_key !== cardKey || !isId(value.import_key)
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
