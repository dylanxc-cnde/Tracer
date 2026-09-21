import { useState } from 'react'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../../postings/types/postingCard'
import type {
  ApplicationChannel,
  CompensationEntry,
  CompensationType,
} from '../../../../postings/types/postingDetails'
import type {
  ApplicationTextField,
  CompensationEntryFields,
  JobDetailsDraft,
  PostingCardUserDraft,
  TextItemDraft,
  WorkConditionField,
  WorkConditionTextField,
} from './PostingCardDraft'
import {
  getCompensationValidationError,
  hasDuplicateTags,
  isValidIsoDate,
} from './PostingCardDraftValidators'
import { createPostingCardUpdateRequest } from './PostingCardDraftRequest'
import { hasPostingCardDraftChanges } from './PostingCardDraftChanges'
import { getSafeHttpUrl } from '../PostingCardSanitizers'

// Card key and Update Request
type PostingCardUpdateCallback = (
  cardKey: string,
  request: UpdatePostingCardRequest,
) => Promise<PostingCard>

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

function createCardUserDraft(card: PostingCard): PostingCardUserDraft {
  const classification = card.posting.classification
  const workConditions = card.posting.work_conditions
  const weeklyHours = workConditions.weekly_hours
  const application = card.posting.application_instructions

  return {
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
    jobDetails: {
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

// Editor which serves card detail component.
export function usePostingCardEditor(
  card: PostingCard,
  updateCard: PostingCardUpdateCallback,
  isReadOnly: boolean,
) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSavingCardChanges, setIsSavingCardChanges] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PostingCardUserDraft>(() => createCardUserDraft(card))
  const updateRequest = createPostingCardUpdateRequest(draft)
  const originalTitle = card.posting.identity.position_title?.value ?? null
  const displayedAlias = isEditing
    ? updateRequest.posting_alias
    : card.posting_alias
  const displayedTitle =
    displayedAlias ?? originalTitle ?? 'Unknown Position'
  const hasChanges = hasPostingCardDraftChanges(updateRequest, card)

  function startEditing() {
    if (isReadOnly) {
      return
    }
    setDraft(createCardUserDraft(card))
    setSaveError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    if (isSavingCardChanges) {
      return
    }

    setDraft(createCardUserDraft(card))
    setSaveError(null)
    setIsEditing(false)
  }

  function dismissSaveError() {
    setSaveError(null)
  }

  async function saveCardChanges() {
    if (isReadOnly) {
      return
    }

    if (hasDuplicateTags(updateRequest.role_domains)) {
      setSaveError('Role domains must be unique, ignoring uppercase and lowercase.')
      return
    }

    const minimumHours = updateRequest.weekly_hours_minimum
    const maximumHours = updateRequest.weekly_hours_maximum
    if (
      (minimumHours !== null && (!Number.isFinite(minimumHours) || minimumHours < 0)) ||
      (maximumHours !== null && (!Number.isFinite(maximumHours) || maximumHours < 0))
    ) {
      setSaveError('Weekly hours must be non-negative numbers, or empty.')
      return
    }
    if (minimumHours !== null && maximumHours !== null && minimumHours > maximumHours) {
      setSaveError('Weekly hours minimum must not exceed maximum.')
      return
    }

    if (updateRequest.start_on !== null && !isValidIsoDate(updateRequest.start_on)) {
      setSaveError('Start date must be a real date in YYYY-MM-DD format. Please check the year, month and day.')
      return
    }

    const compensationError = getCompensationValidationError(updateRequest.compensation_entries)
    if (compensationError !== null) {
      setSaveError(compensationError)
      return
    }

    const vacationDays = updateRequest.vacation_days
    if (
      vacationDays !== null &&
      (!Number.isSafeInteger(vacationDays) || vacationDays < 0)
    ) {
      setSaveError('Vacation days must be a non-negative whole number, or empty.')
      return
    }

    if (updateRequest.application_url !== null && getSafeHttpUrl(updateRequest.application_url) === null) {
      setSaveError('Application URL must be a valid http:// or https:// address, or empty.')
      return
    }
    if (updateRequest.application_deadline !== null && !isValidIsoDate(updateRequest.application_deadline)) {
      setSaveError('Application deadline must be a real date in YYYY-MM-DD format. Please check the year, month and day.')
      return
    }

    if (hasDuplicateTags(updateRequest.industry_tags)) {
      setSaveError('Industries must be unique, ignoring uppercase and lowercase.')
      return
    }

    if (hasDuplicateTags(updateRequest.tags)) {
      setSaveError('Tags must be unique, ignoring uppercase and lowercase.')
      return
    }

    setIsSavingCardChanges(true)
    setSaveError(null)

    try {
      const updatedCard = await updateCard(card.card_key, updateRequest)
      setDraft(createCardUserDraft(updatedCard))
      setIsEditing(false)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message)
      } else {
        setSaveError('Something went wrong while saving the card.')
      }
    } finally {
      setIsSavingCardChanges(false)
    }
  }

  function updateDraftRoleSummary(roleSummary: string) {
    setDraft((currentDraft) => ({ ...currentDraft, roleSummary }))
  }

  function addDraftResponsibility() {
    const responsibility: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      responsibilities: [...currentDraft.responsibilities, responsibility],
    }))
  }

  function updateDraftResponsibility(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      responsibilities: currentDraft.responsibilities.map((responsibility) =>
        responsibility.id === id
          ? { ...responsibility, value }
          : responsibility,
      ),
    }))
  }

  function deleteDraftResponsibility(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      responsibilities: currentDraft.responsibilities.filter(
        (responsibility) => responsibility.id !== id,
      ),
    }))
  }

  function addDraftRoleDomain() {
    const domain: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      roleDomains: [...currentDraft.roleDomains, domain],
    }))
  }

  function updateDraftRoleDomain(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      roleDomains: currentDraft.roleDomains.map((domain) =>
        domain.id === id ? { ...domain, value } : domain,
      ),
    }))
  }

  function deleteDraftRoleDomain(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      roleDomains: currentDraft.roleDomains.filter((domain) => domain.id !== id),
    }))
  }

  function updateDraftJobDetails(jobDetails: JobDetailsDraft) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({ ...currentDraft, jobDetails }))
  }

  function addDraftAddressCandidate() {
    if (isSavingCardChanges) {
      return
    }
    const address: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      jobDetails: {
        ...currentDraft.jobDetails,
        addressCandidates: [...currentDraft.jobDetails.addressCandidates, address],
      },
    }))
  }

  function updateDraftAddressCandidate(id: string, value: string) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      jobDetails: {
        ...currentDraft.jobDetails,
        addressCandidates: currentDraft.jobDetails.addressCandidates.map((address) =>
          address.id === id ? { ...address, value } : address,
        ),
      },
    }))
  }

  function deleteDraftAddressCandidate(id: string) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      jobDetails: {
        ...currentDraft.jobDetails,
        addressCandidates: currentDraft.jobDetails.addressCandidates.filter(
          (address) => address.id !== id,
        ),
      },
    }))
  }

  function addDraftWorkCondition(field: WorkConditionField) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => {
      if (currentDraft.workConditions[field] !== null) {
        return currentDraft
      }
      return {
        ...currentDraft,
        workConditions: {
          ...currentDraft.workConditions,
          [field]: field === 'weeklyHours' ? { minimum: '', maximum: '' } : '',
        },
      }
    })
  }

  function updateDraftWorkConditionText(field: WorkConditionTextField, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      workConditions: { ...currentDraft.workConditions, [field]: value },
    }))
  }

  function updateDraftWeeklyHours(bound: 'minimum' | 'maximum', value: string) {
    setDraft((currentDraft) => {
      if (currentDraft.workConditions.weeklyHours === null) {
        return currentDraft
      }
      return {
        ...currentDraft,
        workConditions: {
          ...currentDraft.workConditions,
          weeklyHours: { ...currentDraft.workConditions.weeklyHours, [bound]: value },
        },
      }
    })
  }

  function deleteDraftWorkCondition(field: WorkConditionField) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      workConditions: { ...currentDraft.workConditions, [field]: null },
    }))
  }

  function addDraftCompensationEntry(compensationType: CompensationType) {
    if (isSavingCardChanges) {
      return
    }
    const entry: CompensationEntryFields = {
      id: crypto.randomUUID(),
      compensationType,
      minimumAmount: '',
      maximumAmount: '',
      currency: '',
      period: null,
      payBasis: 'unknown',
      applicableGroups: [],
      paymentConditions: '',
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      compensationEntries: [...currentDraft.compensationEntries, entry],
    }))
  }

  function updateDraftCompensationEntry(updatedEntry: CompensationEntryFields) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      compensationEntries: currentDraft.compensationEntries.map((entry) =>
        entry.id === updatedEntry.id ? updatedEntry : entry,
      ),
    }))
  }

  function deleteDraftCompensationEntry(id: string) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      compensationEntries: currentDraft.compensationEntries.filter((entry) => entry.id !== id),
    }))
  }

  function addDraftBenefit() {
    const benefit: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      benefits: [...currentDraft.benefits, benefit],
    }))
  }

  function updateDraftBenefit(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      benefits: currentDraft.benefits.map((benefit) =>
        benefit.id === id ? { ...benefit, value } : benefit,
      ),
    }))
  }

  function deleteDraftBenefit(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      benefits: currentDraft.benefits.filter((benefit) => benefit.id !== id),
    }))
  }

  function updateDraftVacationDays(vacationDays: string) {
    setDraft((currentDraft) => ({ ...currentDraft, vacationDays }))
  }

  function updateDraftApplicationChannel(channel: ApplicationChannel, isSelected: boolean) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => {
      const channels = currentDraft.applicationFacts.channels.filter((value) => value !== channel)
      if (isSelected) {
        channels.push(channel)
      }
      return {
        ...currentDraft,
        applicationFacts: { ...currentDraft.applicationFacts, channels },
      }
    })
  }

  function updateDraftApplicationText(field: ApplicationTextField, value: string) {
    if (isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      applicationFacts: { ...currentDraft.applicationFacts, [field]: value },
    }))
  }

  function addDraftRequiredDocument() {
    const document: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      requiredDocuments: [...currentDraft.requiredDocuments, document],
    }))
  }

  function updateDraftRequiredDocument(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      requiredDocuments: currentDraft.requiredDocuments.map((document) =>
        document.id === id ? { ...document, value } : document,
      ),
    }))
  }

  function deleteDraftRequiredDocument(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      requiredDocuments: currentDraft.requiredDocuments.filter(
        (document) => document.id !== id,
      ),
    }))
  }

  function addDraftSpecialInstruction() {
    const instruction: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      specialInstructions: [...currentDraft.specialInstructions, instruction],
    }))
  }

  function updateDraftSpecialInstruction(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      specialInstructions: currentDraft.specialInstructions.map((instruction) =>
        instruction.id === id ? { ...instruction, value } : instruction,
      ),
    }))
  }

  function deleteDraftSpecialInstruction(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      specialInstructions: currentDraft.specialInstructions.filter(
        (instruction) => instruction.id !== id,
      ),
    }))
  }

  function updateDraftContactName(contactName: string) {
    setDraft((currentDraft) => ({ ...currentDraft, contactName }))
  }

  function updateDraftContactRole(contactRole: string) {
    setDraft((currentDraft) => ({ ...currentDraft, contactRole }))
  }

  function updateDraftContactEmail(contactEmail: string) {
    setDraft((currentDraft) => ({ ...currentDraft, contactEmail }))
  }

  function updateDraftContactPhone(contactPhone: string) {
    setDraft((currentDraft) => ({ ...currentDraft, contactPhone }))
  }

  function updateDraftCompanySummary(companySummary: string) {
    setDraft((currentDraft) => ({ ...currentDraft, companySummary }))
  }

  function addDraftIndustry() {
    const industry: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      industryTags: [...currentDraft.industryTags, industry],
    }))
  }

  function updateDraftIndustry(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      industryTags: currentDraft.industryTags.map((industry) =>
        industry.id === id ? { ...industry, value } : industry,
      ),
    }))
  }

  function deleteDraftIndustry(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      industryTags: currentDraft.industryTags.filter((industry) => industry.id !== id),
    }))
  }

  function updateDraftEmployeeRange(employeeRange: string) {
    setDraft((currentDraft) => ({ ...currentDraft, employeeRange }))
  }

  function updateDraftAlias(postingAlias: string) {
    setDraft((currentDraft) => ({ ...currentDraft, postingAlias }))
  }

  function addDraftTag() {
    const tag: TextItemDraft = {
      id: crypto.randomUUID(),
      value: '',
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      tags: [...currentDraft.tags, tag],
    }))
  }

  function updateDraftTag(id: string, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      tags: currentDraft.tags.map((tag) =>
        tag.id === id ? { ...tag, value } : tag,
      ),
    }))
  }

  function deleteDraftTag(id: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      tags: currentDraft.tags.filter((tag) => tag.id !== id),
    }))
  }

  function updateDraftNotes(userNotes: string) {
    setDraft((currentDraft) => ({ ...currentDraft, userNotes }))
  }

  return {
    draft,
    saveError,
    displayedTitle,
    hasChanges,
    isEditing,
    isSavingCardChanges,
    originalTitle,
    isOriginalTitleVisible:
      displayedAlias !== null &&
      originalTitle !== null &&
      displayedAlias !== originalTitle,
    cancelEditing,
    dismissSaveError,
    saveCardChanges,
    updateDraftRoleSummary,
    addDraftResponsibility,
    updateDraftResponsibility,
    deleteDraftResponsibility,
    addDraftRoleDomain,
    updateDraftRoleDomain,
    deleteDraftRoleDomain,
    updateDraftJobDetails,
    addDraftAddressCandidate,
    updateDraftAddressCandidate,
    deleteDraftAddressCandidate,
    addDraftWorkCondition,
    updateDraftWorkConditionText,
    updateDraftWeeklyHours,
    deleteDraftWorkCondition,
    addDraftCompensationEntry,
    updateDraftCompensationEntry,
    deleteDraftCompensationEntry,
    addDraftBenefit,
    updateDraftBenefit,
    deleteDraftBenefit,
    updateDraftVacationDays,
    updateDraftApplicationChannel,
    updateDraftApplicationText,
    addDraftRequiredDocument,
    updateDraftRequiredDocument,
    deleteDraftRequiredDocument,
    addDraftSpecialInstruction,
    updateDraftSpecialInstruction,
    deleteDraftSpecialInstruction,
    updateDraftContactName,
    updateDraftContactRole,
    updateDraftContactEmail,
    updateDraftContactPhone,
    updateDraftCompanySummary,
    addDraftIndustry,
    updateDraftIndustry,
    deleteDraftIndustry,
    updateDraftEmployeeRange,
    updateDraftAlias,
    addDraftTag,
    updateDraftTag,
    deleteDraftTag,
    updateDraftNotes,
    startEditing,
  }
}
