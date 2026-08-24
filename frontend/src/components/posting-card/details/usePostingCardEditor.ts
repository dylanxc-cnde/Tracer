import { useState } from 'react'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'

// Type Definition: CardDraft
export type PostingCardUserDraft = {
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

// Create Update Card Request using one draft.
function createPostingCardUpdateRequest(
  draft: PostingCardUserDraft,
): UpdatePostingCardRequest {
  return {
    posting_alias: normalizeOptionalText(draft.postingAlias),
    user_notes: normalizeOptionalText(draft.userNotes),
    tags: draft.tags,
  }
}

// Editor which serves card detail component.
export function usePostingCardEditor(
  card: PostingCard,
  updateCard: PostingCardUpdateCallback,
) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSavingCardChanges, setIsSavingCardChanges] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PostingCardUserDraft>(() =>
    createCardUserDraft(card),
  )
  const updateRequest = createPostingCardUpdateRequest(draft)
  const originalTitle = card.posting.identity.position_title?.value ?? null
  const displayedAlias = isEditing
    ? updateRequest.posting_alias
    : card.posting_alias
  const displayedTitle =
    displayedAlias ?? originalTitle ?? 'Unknown Position'
  const hasChanges =
    updateRequest.posting_alias !== card.posting_alias ||
    updateRequest.user_notes !== card.user_notes ||
    updateRequest.tags.length !== card.tags.length ||
    updateRequest.tags.some((tag, index) => tag !== card.tags[index])

  function startEditing() {
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
    updateDraftAlias,
    updateDraftTags,
    updateDraftNotes,
    startEditing,
  }
}
