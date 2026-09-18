import { useState } from 'react'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'

export type TextItemDraft = {
  id: string
  value: string
}

// Type Definition: CardDraft
export type PostingCardUserDraft = {
  roleSummary: string
  responsibilities: TextItemDraft[]
  roleDomains: TextItemDraft[]
  benefits: TextItemDraft[]
  vacationDays: string
  requiredDocuments: TextItemDraft[]
  specialInstructions: TextItemDraft[]
  postingAlias: string
  tags: string[]
  userNotes: string
}

// Card key and Update Request
type PostingCardUpdateCallback = (
  cardKey: string,
  request: UpdatePostingCardRequest,
) => Promise<PostingCard>

function createCardUserDraft(card: PostingCard): PostingCardUserDraft {
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
    postingAlias: card.posting_alias ?? '',
    tags: [...card.tags],
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
    benefits: normalizeTextItems(draft.benefits),
    vacation_days: normalizeOptionalNumber(draft.vacationDays),
    required_documents: normalizeTextItems(draft.requiredDocuments),
    special_instructions: normalizeTextItems(draft.specialInstructions),
    posting_alias: normalizeOptionalText(draft.postingAlias),
    user_notes: normalizeOptionalText(draft.userNotes),
    tags: draft.tags,
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

  async function saveCardChanges() {
    if (isReadOnly) {
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

  function updateDraftAlias(postingAlias: string) {
    setDraft((currentDraft) => ({ ...currentDraft, postingAlias }))
  }

  function updateDraftTags(tags: string[]) {
    setDraft((currentDraft) => ({ ...currentDraft, tags }))
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
    saveCardChanges,
    updateDraftRoleSummary,
    addDraftResponsibility,
    updateDraftResponsibility,
    deleteDraftResponsibility,
    addDraftRoleDomain,
    updateDraftRoleDomain,
    deleteDraftRoleDomain,
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
    updateDraftAlias,
    updateDraftTags,
    updateDraftNotes,
    startEditing,
  }
}
