import { useEffect, useRef, useState } from 'react'
import { getPostingCard, PostingCardUpdateUncertainError } from '../../../../postings/api/postings'
import type { PostingCard, UpdatePostingCardRequest } from '../../../../postings/types/postingCard'
import { hasPostingCardDraftChanges } from './PostingCardDraftChanges'
import { createCardUserDraft } from './PostingCardDraftCreator'
import { createPostingCardUpdateRequest } from './PostingCardDraftRequest'

type SaveAttempt = { baseline: PostingCard; submitted: UpdatePostingCardRequest }

export type PostingCardRecovery =
  | { state: 'needs-read'; attempt: SaveAttempt; readFailed: boolean }
  | { state: 'saved-version'; card: PostingCard; matchesSubmission: boolean }
  | { state: 'retry-available' }

type SaveOptions = {
  card: PostingCard
  updateCard: (cardKey: string, request: UpdatePostingCardRequest) => Promise<PostingCard>
  onSavedVersion?: (card: PostingCard) => void
  onComplete: (card: PostingCard) => void
}

export function usePostingCardSave({ card, updateCard, onSavedVersion, onComplete }: SaveOptions) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<PostingCardRecovery | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const active = useRef(false)
  const inFlight = useRef(false)
  const readController = useRef<AbortController | null>(null)
  const isRecoveryLocked = recovery !== null && recovery.state !== 'retry-available'

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      readController.current?.abort()
    }
  }, [])

  function resetFeedback() {
    setSaveError(null)
    setRecovery(null)
  }

  async function save(submitted: UpdatePostingCardRequest) {
    if (inFlight.current || isRecoveryLocked) return

    inFlight.current = true
    setIsSaving(true)
    resetFeedback()
    try {
      const updatedCard = await updateCard(card.card_key, submitted)
      if (active.current) onComplete(updatedCard)
    } catch (error) {
      if (!active.current) return

      if (error instanceof PostingCardUpdateUncertainError) {
        setRecovery({ state: 'needs-read', attempt: { baseline: card, submitted }, readFailed: false })
      } else {
        setSaveError(error instanceof Error ? error.message : 'Something went wrong while saving the card.')
      }
    } finally {
      inFlight.current = false
      if (active.current) setIsSaving(false)
    }
  }

  async function readSavedCard() {
    if (inFlight.current || recovery?.state !== 'needs-read') return

    const controller = new AbortController()
    readController.current = controller
    inFlight.current = true
    setIsReading(true)
    setRecovery({ ...recovery, readFailed: false })
    try {
      const { baseline, submitted } = recovery.attempt
      const saved = await getPostingCard(baseline.card_key, controller.signal)
      if (controller.signal.aborted) return

      const matchesSubmission = !hasPostingCardDraftChanges(submitted, saved)
      const matchesBaseline = JSON.stringify(baseline) === JSON.stringify(saved) || !hasPostingCardDraftChanges(
        createPostingCardUpdateRequest(createCardUserDraft(baseline)), saved,
      )
      if (!matchesSubmission && matchesBaseline) {
        setRecovery({ state: 'retry-available' })
      } else {
        setRecovery({ state: 'saved-version', card: saved, matchesSubmission })
      }
    } catch {
      if (!controller.signal.aborted) setRecovery({ ...recovery, readFailed: true })
    } finally {
      readController.current = null
      inFlight.current = false
      if (active.current) setIsReading(false)
    }
  }

  function useSavedVersion() {
    if (inFlight.current || recovery?.state !== 'saved-version' || !onSavedVersion) return

    onSavedVersion(recovery.card)
    onComplete(recovery.card)
    resetFeedback()
  }

  return {
    saveError, setSaveError, recovery, isSaving, isReading, isRecoveryLocked,
    resetFeedback, save, readSavedCard, useSavedVersion,
  }
}
