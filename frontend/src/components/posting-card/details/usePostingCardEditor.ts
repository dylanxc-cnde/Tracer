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
  benefits: TextItemDraft[]
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
    benefits: card.posting.compensation.benefits.map((benefit) => ({
      id: crypto.randomUUID(),
      value: benefit.value,
    })),
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
    benefits: normalizeTextItems(draft.benefits),
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
    updateRequest.benefits.length !== card.posting.compensation.benefits.length ||
    updateRequest.benefits.some(
      (value, index) => value !== card.posting.compensation.benefits[index]?.value,
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
    addDraftBenefit,
    updateDraftBenefit,
    deleteDraftBenefit,
    updateDraftAlias,
    updateDraftTags,
    updateDraftNotes,
    startEditing,
  }
}
