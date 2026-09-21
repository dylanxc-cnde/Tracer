import type {
  PostingCard,
  UpdateCompensationEntryRequest,
  UpdatePostingCardRequest,
} from '../../../../postings/types/postingCard'
import type { CompensationEntry } from '../../../../postings/types/postingDetails'

function hasCompensationChanges(
  entries: UpdateCompensationEntryRequest[],
  savedEntries: CompensationEntry[],
): boolean {
  if (entries.length !== savedEntries.length) {
    return true
  }
  return entries.some((entry, index) => {
    const saved = savedEntries[index]
    return entry.compensation_type !== saved.compensation_type ||
      entry.minimum_amount !== saved.minimum_amount ||
      entry.maximum_amount !== saved.maximum_amount ||
      entry.currency !== saved.currency ||
      entry.period !== saved.period ||
      entry.pay_basis !== saved.pay_basis ||
      entry.payment_conditions !== saved.payment_conditions ||
      entry.applicable_groups.length !== saved.applicable_groups.length ||
      entry.applicable_groups.some((group, groupIndex) =>
        group !== saved.applicable_groups[groupIndex],
      )
  })
}

export function hasPostingCardDraftChanges(
  updateRequest: UpdatePostingCardRequest,
  card: PostingCard,
): boolean {
  const classification = card.posting.classification
  const savedRoleFamilies = new Set(classification.role_families?.value ?? [])
  const savedWorkModes = new Set(card.posting.work_conditions.work_modes?.value ?? [])
  const application = card.posting.application_instructions
  const savedChannels = new Set(application.channels?.value ?? [])

  return (
    updateRequest.role_summary !==
      (card.posting.role_content.role_summary?.value ?? null) ||
    updateRequest.responsibilities.length !==
      card.posting.role_content.responsibilities.length ||
    updateRequest.responsibilities.some(
      (value, index) =>
        value !== card.posting.role_content.responsibilities[index]?.value,
    ) ||
    updateRequest.role_domains.length !== card.posting.role_content.domains.length ||
    updateRequest.role_domains.some(
      (value, index) => value !== card.posting.role_content.domains[index]?.value,
    ) ||
    updateRequest.workload_type !== (classification.workload_type?.value ?? null) ||
    updateRequest.role_families.length !== savedRoleFamilies.size ||
    updateRequest.role_families.some((value) => !savedRoleFamilies.has(value)) ||
    updateRequest.contract_type !== (classification.contract_type?.value ?? null) ||
    updateRequest.seniority !== (classification.seniority?.value ?? null) ||
    updateRequest.work_modes.length !== savedWorkModes.size ||
    updateRequest.work_modes.some((value) => !savedWorkModes.has(value)) ||
    updateRequest.primary_address !== (card.posting.work_conditions.primary_address?.value ?? null) ||
    updateRequest.address_candidates.length !== card.posting.work_conditions.address_candidates.length ||
    updateRequest.address_candidates.some(
      (value, index) => value !== card.posting.work_conditions.address_candidates[index],
    ) ||
    updateRequest.internship_requirement !== (classification.internship_requirement?.value ?? null) ||
    updateRequest.eligibility !== (classification.eligibility?.value ?? null) ||
    updateRequest.weekly_hours_minimum !==
      (card.posting.work_conditions.weekly_hours?.minimum ?? null) ||
    updateRequest.weekly_hours_maximum !==
      (card.posting.work_conditions.weekly_hours?.maximum ?? null) ||
    updateRequest.schedule !== (card.posting.work_conditions.schedule?.value ?? null) ||
    updateRequest.travel_requirement !==
      (card.posting.work_conditions.travel_requirement?.value ?? null) ||
    updateRequest.start_on !== (card.posting.work_conditions.start_on?.value ?? null) ||
    updateRequest.duration !== (card.posting.work_conditions.duration?.value ?? null) ||
    hasCompensationChanges(updateRequest.compensation_entries, card.posting.compensation.entries) ||
    updateRequest.benefits.length !== card.posting.compensation.benefits.length ||
    updateRequest.benefits.some(
      (value, index) => value !== card.posting.compensation.benefits[index]?.value,
    ) ||
    updateRequest.vacation_days !==
      (card.posting.compensation.vacation_days?.value ?? null) ||
    updateRequest.application_channels.length !== savedChannels.size ||
    updateRequest.application_channels.some((channel) => !savedChannels.has(channel)) ||
    updateRequest.application_url !== (application.application_url?.value ?? null) ||
    updateRequest.application_deadline !== (application.application_deadline?.value ?? null) ||
    updateRequest.required_email_subject !== (application.required_email_subject?.value ?? null) ||
    updateRequest.required_documents.length !==
      card.posting.application_instructions.required_documents.length ||
    updateRequest.required_documents.some(
      (value, index) =>
        value !== card.posting.application_instructions.required_documents[index]?.value,
    ) ||
    updateRequest.special_instructions.length !==
      card.posting.application_instructions.special_instructions.length ||
    updateRequest.special_instructions.some(
      (value, index) =>
        value !== card.posting.application_instructions.special_instructions[index]?.value,
    ) ||
    updateRequest.contact_name !== (card.posting.contact?.name ?? null) ||
    updateRequest.contact_role !== (card.posting.contact?.role ?? null) ||
    updateRequest.contact_email !== (card.posting.contact?.email ?? null) ||
    updateRequest.contact_phone !== (card.posting.contact?.phone ?? null) ||
    updateRequest.company_summary !==
      (card.posting.company.company_summary?.value ?? null) ||
    updateRequest.industry_tags.length !== card.posting.company.industry_tags.length ||
    updateRequest.industry_tags.some(
      (value, index) => value !== card.posting.company.industry_tags[index]?.value,
    ) ||
    updateRequest.employee_range !==
      (card.posting.company.employee_range?.value ?? null) ||
    updateRequest.posting_alias !== card.posting_alias ||
    updateRequest.user_notes !== card.user_notes ||
    updateRequest.tags.length !== card.tags.length ||
    updateRequest.tags.some((tag, index) => tag !== card.tags[index])
  )
}
