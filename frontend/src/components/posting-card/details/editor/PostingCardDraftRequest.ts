import type {
  UpdateCompensationEntryRequest,
  UpdatePostingCardRequest,
  UpdateRequirementGroupRequest,
} from '../../../../postings/types/postingCard'
import type {
  CompensationEntryFields,
  PostingCardUserDraft,
  RequirementSectionDraft,
  TextItemDraft,
} from './PostingCardDraft'

// Normalize Text: trim, decide if the value is null.
function normalizeOptionalText(value: string) {
  const normalizedValue = value.trim()

  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizeOptionalNumber(value: string): number | null {
  const normalizedValue = value.trim()

  return normalizedValue.length > 0 ? Number(normalizedValue) : null
}

function normalizeTextItems(items: TextItemDraft[]): string[] {
  return items
    .map((item) => item.value.trim())
    .filter((value) => value.length > 0)
}

// Turn section/group drafts into the API's flat group list; no state or HTTP changes here.
function normalizeRequirementGroups(
  sections: RequirementSectionDraft[],
): UpdateRequirementGroupRequest[] {
  const groups: UpdateRequirementGroupRequest[] = []

  for (const section of sections) {
    for (const group of section.groups) {
      // Only keep API fields: trim names, drop blank pills, and leave draft IDs behind.
      const items = group.items
        .map((item) => ({
          name: item.name.trim(),
          category: item.category,
          is_example: item.is_example,
        }))
        .filter((item) => item.name.length > 0)
      if (items.length === 0) {
        // Clearing the last pill also removes the empty box from the saved card.
        continue
      }
      groups.push({
        importance: section.importance,
        item_rule: group.itemRule,
        items,
      })
    }
  }

  return groups
}

function normalizeCompensationAmount(value: string): number | null {
  const amount = value.trim().replace(',', '.')
  if (amount.length === 0) {
    return null
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)) {
    return Number.NaN
  }
  return Number(amount)
}

function normalizeCompensationEntries(
  entries: CompensationEntryFields[],
): UpdateCompensationEntryRequest[] {
  return entries.map((entry) => ({
    compensation_type: entry.compensationType,
    minimum_amount: normalizeCompensationAmount(entry.minimumAmount),
    maximum_amount: normalizeCompensationAmount(entry.maximumAmount),
    currency: normalizeOptionalText(entry.currency),
    period: entry.period,
    pay_basis: entry.payBasis,
    applicable_groups: normalizeTextItems(entry.applicableGroups),
    payment_conditions: normalizeOptionalText(entry.paymentConditions),
  }))
}

// Create Update Card Request using one draft.
export function createPostingCardUpdateRequest(
  draft: PostingCardUserDraft,
): UpdatePostingCardRequest {
  return {
    role_summary: normalizeOptionalText(draft.roleSummary),
    responsibilities: normalizeTextItems(draft.responsibilities),
    role_domains: normalizeTextItems(draft.roleDomains),
    requirement_groups: normalizeRequirementGroups(draft.requirements),
    workload_type: draft.jobDetails.workloadType,
    role_families: draft.jobDetails.roleFamilies,
    contract_type: draft.jobDetails.contractType,
    seniority: draft.jobDetails.seniority,
    work_modes: draft.jobDetails.workModes,
    primary_address: normalizeOptionalText(draft.jobDetails.primaryAddress),
    address_candidates: normalizeTextItems(draft.jobDetails.addressCandidates),
    internship_requirement: draft.jobDetails.internshipRequirement,
    eligibility: normalizeOptionalText(draft.jobDetails.eligibility),
    weekly_hours_minimum: normalizeOptionalNumber(draft.workConditions.weeklyHours?.minimum ?? ''),
    weekly_hours_maximum: normalizeOptionalNumber(draft.workConditions.weeklyHours?.maximum ?? ''),
    schedule: normalizeOptionalText(draft.workConditions.schedule ?? ''),
    travel_requirement: normalizeOptionalText(draft.workConditions.travelRequirement ?? ''),
    start_on: normalizeOptionalText(draft.workConditions.startOn ?? ''),
    duration: normalizeOptionalText(draft.workConditions.duration ?? ''),
    compensation_entries: normalizeCompensationEntries(draft.compensationEntries),
    benefits: normalizeTextItems(draft.benefits),
    vacation_days: normalizeOptionalNumber(draft.vacationDays),
    application_channels: draft.applicationFacts.channels,
    application_url: normalizeOptionalText(draft.applicationFacts.applicationUrl),
    application_deadline: normalizeOptionalText(draft.applicationFacts.applicationDeadline),
    required_email_subject: normalizeOptionalText(draft.applicationFacts.requiredEmailSubject),
    required_documents: normalizeTextItems(draft.requiredDocuments),
    special_instructions: normalizeTextItems(draft.specialInstructions),
    contact_name: normalizeOptionalText(draft.contactName),
    contact_role: normalizeOptionalText(draft.contactRole),
    contact_email: normalizeOptionalText(draft.contactEmail),
    contact_phone: normalizeOptionalText(draft.contactPhone),
    company_summary: normalizeOptionalText(draft.companySummary),
    industry_tags: normalizeTextItems(draft.industryTags),
    employee_range: normalizeOptionalText(draft.employeeRange),
    posting_alias: normalizeOptionalText(draft.postingAlias),
    user_notes: normalizeOptionalText(draft.userNotes),
    tags: normalizeTextItems(draft.tags),
  }
}
