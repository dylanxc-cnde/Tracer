import { useState } from 'react'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'
import { hasDuplicateTags, isValidIsoDate } from './PostingCardValidators'

export type TextItemDraft = {
  id: string
  value: string
}

export type WorkConditionsDraft = {
  weeklyHours: { minimum: string; maximum: string } | null
  schedule: string | null
  travelRequirement: string | null
  startOn: string | null
  duration: string | null
}

export type WorkConditionField = keyof WorkConditionsDraft
export type WorkConditionTextField = Exclude<WorkConditionField, 'weeklyHours'>

// Type Definition: CardDraft
export type PostingCardUserDraft = {
  roleSummary: string
  responsibilities: TextItemDraft[]
  roleDomains: TextItemDraft[]
  workConditions: WorkConditionsDraft
  benefits: TextItemDraft[]
  vacationDays: string
  requiredDocuments: TextItemDraft[]
  specialInstructions: TextItemDraft[]
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  companySummary: string
  industryTags: TextItemDraft[]
  employeeRange: string
  postingAlias: string
  tags: TextItemDraft[]
  userNotes: string
}

// Card key and Update Request
type PostingCardUpdateCallback = (
  cardKey: string,
  request: UpdatePostingCardRequest,
) => Promise<PostingCard>

function createCardUserDraft(card: PostingCard): PostingCardUserDraft {
  const workConditions = card.posting.work_conditions
  const weeklyHours = workConditions.weekly_hours

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
    benefits: card.posting.compensation.benefits.map((benefit) => ({
      id: crypto.randomUUID(),
      value: benefit.value,
    })),
    vacationDays: card.posting.compensation.vacation_days?.value.toString() ?? '',
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

// Create Update Card Request using one draft.
function createPostingCardUpdateRequest(
  draft: PostingCardUserDraft,
): UpdatePostingCardRequest {
  return {
    role_summary: normalizeOptionalText(draft.roleSummary),
    responsibilities: normalizeTextItems(draft.responsibilities),
    role_domains: normalizeTextItems(draft.roleDomains),
    weekly_hours_minimum: normalizeOptionalNumber(draft.workConditions.weeklyHours?.minimum ?? ''),
    weekly_hours_maximum: normalizeOptionalNumber(draft.workConditions.weeklyHours?.maximum ?? ''),
    schedule: normalizeOptionalText(draft.workConditions.schedule ?? ''),
    travel_requirement: normalizeOptionalText(draft.workConditions.travelRequirement ?? ''),
    start_on: normalizeOptionalText(draft.workConditions.startOn ?? ''),
    duration: normalizeOptionalText(draft.workConditions.duration ?? ''),
    benefits: normalizeTextItems(draft.benefits),
    vacation_days: normalizeOptionalNumber(draft.vacationDays),
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
  const hasChanges =
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
    updateRequest.weekly_hours_minimum !==
      (card.posting.work_conditions.weekly_hours?.minimum ?? null) ||
    updateRequest.weekly_hours_maximum !==
      (card.posting.work_conditions.weekly_hours?.maximum ?? null) ||
    updateRequest.schedule !== (card.posting.work_conditions.schedule?.value ?? null) ||
    updateRequest.travel_requirement !==
      (card.posting.work_conditions.travel_requirement?.value ?? null) ||
    updateRequest.start_on !== (card.posting.work_conditions.start_on?.value ?? null) ||
    updateRequest.duration !== (card.posting.work_conditions.duration?.value ?? null) ||
    updateRequest.benefits.length !== card.posting.compensation.benefits.length ||
    updateRequest.benefits.some(
      (value, index) => value !== card.posting.compensation.benefits[index]?.value,
    ) ||
    updateRequest.vacation_days !==
      (card.posting.compensation.vacation_days?.value ?? null) ||
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

    const vacationDays = updateRequest.vacation_days
    if (
      vacationDays !== null &&
      (!Number.isSafeInteger(vacationDays) || vacationDays < 0)
    ) {
      setSaveError('Vacation days must be a non-negative whole number, or empty.')
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
    addDraftWorkCondition,
    updateDraftWorkConditionText,
    updateDraftWeeklyHours,
    deleteDraftWorkCondition,
    addDraftBenefit,
    updateDraftBenefit,
    deleteDraftBenefit,
    updateDraftVacationDays,
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
