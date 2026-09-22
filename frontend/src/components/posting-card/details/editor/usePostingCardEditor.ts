import { useState } from 'react'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../../postings/types/postingCard'
import type {
  ApplicationChannel,
  CompensationType,
  RequirementImportance,
} from '../../../../postings/types/postingDetails'
import type {
  ApplicationTextField,
  CompensationEntryFields,
  JobDetailsDraft,
  PostingCardUserDraft,
  RequirementGroupDraft,
  RequirementItemDraft,
  TextItemDraft,
  WorkConditionField,
  WorkConditionTextField,
} from './PostingCardDraft'
import {
  getCompensationValidationError,
  getRequirementValidationError,
  hasDuplicateTags,
  isValidIsoDate,
} from './PostingCardDraftValidators'
import { createPostingCardUpdateRequest } from './PostingCardDraftRequest'
import { hasEmptyRequirementDrafts, hasPostingCardDraftChanges } from './PostingCardDraftChanges'
import { createCardUserDraft } from './PostingCardDraftCreator'
import { getSafeHttpUrl } from '../PostingCardSanitizers'

// Card key and Update Request
type PostingCardUpdateCallback = (
  cardKey: string,
  request: UpdatePostingCardRequest,
) => Promise<PostingCard>

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
  const hasChanges = hasPostingCardDraftChanges(updateRequest, card) ||
    hasEmptyRequirementDrafts(draft.requirements)

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

    // Incomplete groups are fine while typing; stop here before sending an invalid save.
    const requirementError = getRequirementValidationError(
      updateRequest.requirement_groups, card.posting.requirements.groups,
    )
    if (requirementError !== null) {
      // Show the existing save-error UI and keep the draft available for corrections.
      setSaveError(requirementError)
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

  function addDraftRequirementSection(importance: RequirementImportance) {
    if (isReadOnly || isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => {
      if (currentDraft.requirements.some((section) => section.importance === importance)) {
        return currentDraft
      }
      return {
        ...currentDraft,
        requirements: [...currentDraft.requirements, { importance, groups: [] }],
      }
    })
  }

  function deleteDraftRequirementSection(importance: RequirementImportance) {
    if (isReadOnly || isSavingCardChanges) {
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      requirements: currentDraft.requirements.filter((section) => section.importance !== importance),
    }))
  }

  function addDraftRequirementGroup(
    importance: RequirementImportance,
    itemRule: 'all_of' | 'any_of',
  ) {
    if (isReadOnly || isSavingCardChanges) {
      return
    }
    const group: RequirementGroupDraft = { id: crypto.randomUUID(), itemRule, items: [] }

    setDraft((currentDraft) => ({
      ...currentDraft,
      requirements: currentDraft.requirements.map((section) => {
        if (section.importance !== importance) {
          return section
        }
        if (itemRule === 'all_of' && section.groups.some((group) => group.itemRule === 'all_of')) {
          return section
        }
        return { ...section, groups: [...section.groups, group] }
      }),
    }))
  }

  function addDraftRequirementItem(groupId: string) {
    if (isReadOnly || !isEditing || isSavingCardChanges) {
      return
    }
    // New items start as plain skills; the user can turn them into examples afterwards.
    const item: RequirementItemDraft = {
      id: crypto.randomUUID(),
      name: '',
      category: 'skill',
      is_example: false,
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      requirements: currentDraft.requirements.map((section) => ({
        ...section,
        groups: section.groups.map((group) =>
          group.id === groupId ? { ...group, items: [...group.items, item] } : group,
        ),
      })),
    }))
  }

  function updateDraftRequirementItem(groupId: string, itemId: string, name: string) {
    if (isReadOnly || !isEditing || isSavingCardChanges) {
      return
    }
    // Match the box, then the pill; changing its name must not change its ID or metadata.
    setDraft((currentDraft) => ({
      ...currentDraft,
      requirements: currentDraft.requirements.map((section) => ({
        ...section,
        groups: section.groups.map((group) => {
          if (group.id !== groupId) {
            return group
          }
          return {
            ...group,
            items: group.items.map((item) => item.id === itemId ? { ...item, name } : item),
          }
        }),
      })),
    }))
  }

  function toggleDraftRequirementItemExample(groupId: string, itemId: string) {
    if (isReadOnly || !isEditing || isSavingCardChanges) {
      return
    }
    // Flip only the example flag; keep the same pill, position and owning group.
    setDraft((currentDraft) => ({
      ...currentDraft,
      requirements: currentDraft.requirements.map((section) => ({
        ...section,
        groups: section.groups.map((group) => {
          if (group.id !== groupId) {
            return group
          }
          return {
            ...group,
            items: group.items.map((item) =>
              item.id === itemId ? { ...item, is_example: !item.is_example } : item,
            ),
          }
        }),
      })),
    }))
  }

  function deleteDraftRequirementItem(groupId: string, itemId: string) {
    if (isReadOnly || !isEditing || isSavingCardChanges) {
      return
    }
    // Keep an emptied box on screen for more input; Save cleans it up later.
    setDraft((currentDraft) => ({
      ...currentDraft,
      requirements: currentDraft.requirements.map((section) => ({
        ...section,
        groups: section.groups.map((group) =>
          group.id === groupId
            ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
            : group,
        ),
      })),
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
    addDraftRequirementSection,
    deleteDraftRequirementSection,
    addDraftRequirementGroup,
    addDraftRequirementItem,
    updateDraftRequirementItem,
    toggleDraftRequirementItemExample,
    deleteDraftRequirementItem,
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
