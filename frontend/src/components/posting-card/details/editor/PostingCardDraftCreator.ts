import type { PostingCard } from '../../../../postings/types/postingCard'
import type { CompensationEntry, Requirement } from '../../../../postings/types/postingDetails'
import type {
  CompensationEntryFields,
  PostingCardUserDraft,
  RequirementSectionDraft,
} from './PostingCardDraft'

// Group saved data by importance and give each editable box/pill its own ID.
function createRequirementSections(groups: Requirement[]): RequirementSectionDraft[] {
  const sections: RequirementSectionDraft[] = []

  for (const group of groups) {
    let section = sections.find((section) => section.importance === group.importance)
    if (section === undefined) {
      section = { importance: group.importance, groups: [] }
      sections.push(section)
    }
    // Generate IDs when building the draft, not on every keystroke or render.
    section.groups.push({
      id: crypto.randomUUID(),
      itemRule: group.item_rule,
      items: group.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    })
  }

  return sections
}

export function createCompensationEntryFields(
  entry: CompensationEntry,
  id: string,
): CompensationEntryFields {
  return {
    id,
    compensationType: entry.compensation_type,
    minimumAmount: entry.minimum_amount?.toString() ?? '',
    maximumAmount: entry.maximum_amount?.toString() ?? '',
    currency: entry.currency ?? '',
    period: entry.period,
    payBasis: entry.pay_basis,
    applicableGroups: entry.applicable_groups.map((value, index) => ({
      id: `${id}-group-${index}`,
      value,
    })),
    paymentConditions: entry.payment_conditions ?? '',
  }
}

export function createCardUserDraft(card: PostingCard): PostingCardUserDraft {
  const identity = card.posting.identity
  const classification = card.posting.classification
  const workConditions = card.posting.work_conditions
  const weeklyHours = workConditions.weekly_hours
  const application = card.posting.application_instructions

  return {
    postingInfo: {
      canonicalPostingUrl: identity.canonical_posting_url?.value ?? '',
      sourcePlatform: identity.source_platform?.value ?? '',
      publishedOn: identity.published_on?.value ?? '',
      postingLanguage: identity.posting_language?.value ?? '',
    },
    roleSummary: card.posting.role_content.role_summary?.value ?? '',
    responsibilities: card.posting.role_content.responsibilities.map(
      (responsibility) => ({
        id: crypto.randomUUID(),
        value: responsibility.value,
      }),
    ),
    roleDomains: card.posting.role_content.domains.map((domain) => ({
      id: crypto.randomUUID(),
      value: domain.value,
    })),
    requirements: createRequirementSections(card.posting.requirements.groups),
    jobDetails: {
      positionTitle: identity.position_title?.value ?? '',
      companyName: identity.company_name?.value ?? '',
      departmentName: identity.department_name?.value ?? '',
      externalJobId: identity.external_job_id?.value ?? '',
      workloadType: classification.workload_type?.value ?? null,
      roleFamilies: [...new Set(classification.role_families?.value ?? [])],
      contractType: classification.contract_type?.value ?? null,
      seniority: classification.seniority?.value ?? null,
      workModes: [...new Set(workConditions.work_modes?.value ?? [])],
      primaryAddress: workConditions.primary_address?.value ?? '',
      addressCandidates: workConditions.address_candidates.map((address) => ({
        id: crypto.randomUUID(),
        value: address,
      })),
      internshipRequirement: classification.internship_requirement?.value ?? null,
      eligibility: classification.eligibility?.value ?? '',
    },
    workConditions: {
      weeklyHours: weeklyHours === null || (
        weeklyHours.minimum === null && weeklyHours.maximum === null
      )
        ? null
        : {
            minimum: weeklyHours.minimum?.toString() ?? '',
            maximum: weeklyHours.maximum?.toString() ?? '',
          },
      schedule: workConditions.schedule?.value ?? null,
      travelRequirement: workConditions.travel_requirement?.value ?? null,
      startOn: workConditions.start_on?.value ?? null,
      duration: workConditions.duration?.value ?? null,
    },
    compensationEntries: card.posting.compensation.entries.map((entry) =>
      createCompensationEntryFields(entry, crypto.randomUUID()),
    ),
    benefits: card.posting.compensation.benefits.map((benefit) => ({
      id: crypto.randomUUID(),
      value: benefit.value,
    })),
    vacationDays: card.posting.compensation.vacation_days?.value.toString() ?? '',
    applicationFacts: {
      channels: [...new Set(application.channels?.value ?? [])],
      applicationUrl: application.application_url?.value ?? '',
      applicationDeadline: application.application_deadline?.value ?? '',
      requiredEmailSubject: application.required_email_subject?.value ?? '',
    },
    requiredDocuments: card.posting.application_instructions.required_documents.map(
      (document) => ({
        id: crypto.randomUUID(),
        value: document.value,
      }),
    ),
    specialInstructions: card.posting.application_instructions.special_instructions.map(
      (instruction) => ({
        id: crypto.randomUUID(),
        value: instruction.value,
      }),
    ),
    contactName: card.posting.contact?.name ?? '',
    contactRole: card.posting.contact?.role ?? '',
    contactEmail: card.posting.contact?.email ?? '',
    contactPhone: card.posting.contact?.phone ?? '',
    companySummary: card.posting.company.company_summary?.value ?? '',
    industryTags: card.posting.company.industry_tags.map((industry) => ({
      id: crypto.randomUUID(),
      value: industry.value,
    })),
    employeeRange: card.posting.company.employee_range?.value ?? '',
    postingAlias: card.posting_alias ?? '',
    tags: card.tags.map((tag) => ({
      id: crypto.randomUUID(),
      value: tag,
    })),
    userNotes: card.user_notes ?? '',
  }
}
