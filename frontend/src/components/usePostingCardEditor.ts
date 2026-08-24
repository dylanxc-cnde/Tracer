import { useState } from 'react'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../postings/types/postingCard'

// Type Definition: CardDraft
export type PostingCardUserDraft = {
  postingAlias: string
  tags: string[]
  userNotes: string
}

// Card key and Update Request
type UpdatePostingCard = (
  cardKey: string,
  request: UpdatePostingCardRequest,
) => Promise<PostingCard>

function createUserDraft(card: PostingCard): PostingCardUserDraft {
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
function createUpdateRequest(
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
  updateCard: UpdatePostingCard,
) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PostingCardUserDraft>(() =>
    createUserDraft(card),
  )
  const request = createUpdateRequest(draft)
  const originalTitle = card.posting.identity.position_title?.value ?? null
  const displayedAlias = isEditing ? request.posting_alias : card.posting_alias
  const displayedTitle =
    displayedAlias ?? originalTitle ?? 'Unknown Position'
  const hasChanges =
    request.posting_alias !== card.posting_alias ||
    request.user_notes !== card.user_notes ||
    request.tags.length !== card.tags.length ||
    request.tags.some((tag, index) => tag !== card.tags[index])

  function start() {
    setDraft(createUserDraft(card))
    setError(null)
    setIsEditing(true)
  }

  function cancel() {
    if (isSaving) {
      return
    }

    setDraft(createUserDraft(card))
    setError(null)
    setIsEditing(false)
  }

  async function save() {
    setIsSaving(true)
    setError(null)

    try {
      const updatedCard = await updateCard(card.card_key, request)
      setDraft(createUserDraft(updatedCard))
      setIsEditing(false)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while saving the card.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  function setPostingAlias(postingAlias: string) {
    setDraft((currentDraft) => ({ ...currentDraft, postingAlias }))
  }

  function setTags(tags: string[]) {
    setDraft((currentDraft) => ({ ...currentDraft, tags }))
  }

  function setUserNotes(userNotes: string) {
    setDraft((currentDraft) => ({ ...currentDraft, userNotes }))
  }

  return {
    draft,
    error,
    displayedTitle,
    hasChanges,
    isEditing,
    isSaving,
    originalTitle,
    showOriginalTitle:
      displayedAlias !== null &&
      originalTitle !== null &&
      displayedAlias !== originalTitle,
    cancel,
    save,
    setPostingAlias,
    setTags,
    setUserNotes,
    start,
  }
}
