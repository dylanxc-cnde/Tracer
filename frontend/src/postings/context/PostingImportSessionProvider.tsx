import { useRef, useState, type ReactNode } from 'react'
import {
  createPostingCard,
  createPostingImport,
  deletePostingCard,
  parsePostingImport,
} from '../api/postings'
import type { PostingCard } from '../types/postingCard'
import type { PostingParseResult } from '../types/postingParse'
import {
  PostingImportSessionContext,
  type PostingImportSession,
} from './PostingImportSessionContext'

type PostingImportReview = {
  importKey: string
  result: PostingParseResult
  sourceRevision: number
}

type PostingImportSessionProviderProps = {
  children: ReactNode
}

export function PostingImportSessionProvider({
  children,
}: PostingImportSessionProviderProps) {
  const [postingText, setPostingText] = useState('')
  const [isAnalyzingPosting, setIsAnalyzingPosting] = useState(false)
  const [review, setReview] = useState<PostingImportReview | null>(null)
  const [importSessionError, setImportSessionError] = useState<string | null>(null)
  const [selectedPostingIndex, setSelectedPostingIndex] = useState<number | null>(null)
  const [isCreatingCard, setIsCreatingCard] = useState(false)
  const [createdCard, setCreatedCard] = useState<PostingCard | null>(null)
  const [isDeletingCreatedCard, setIsDeletingCreatedCard] = useState(false)
  const sourceRevision = useRef(0)
  const importActionPending = useRef(false)

  const parseResult = review?.result ?? null
  const selectedPosting =
    parseResult !== null && selectedPostingIndex !== null
      ? parseResult.postings[selectedPostingIndex] ?? null
      : null

  function clearReview() {
    setReview(null)
    setSelectedPostingIndex(null)
  }

  function updatePostingText(nextPostingText: string) {
    if (nextPostingText === postingText) return

    sourceRevision.current += 1
    setPostingText(nextPostingText)
    clearReview()
    setImportSessionError(null)
  }

  function selectPostingCandidate(postingIndex: number) {
    setSelectedPostingIndex(postingIndex)
  }

  async function analyzePostingText() {
    if (importActionPending.current || postingText.trim().length === 0) return

    const submittedRevision = sourceRevision.current
    importActionPending.current = true
    setIsAnalyzingPosting(true)
    clearReview()
    setImportSessionError(null)
    setCreatedCard(null)

    try {
      const postingImport = await createPostingImport({
        kind: 'text',
        text: postingText,
        source_url: null,
      })

      if (submittedRevision !== sourceRevision.current) return
      const result = await parsePostingImport(postingImport.import_key)
      if (submittedRevision !== sourceRevision.current) return

      setReview({ importKey: postingImport.import_key, result, sourceRevision: submittedRevision })
    } catch (caughtError: unknown) {
      if (submittedRevision !== sourceRevision.current) return
      if (caughtError instanceof Error) {
        setImportSessionError(caughtError.message)
      } else {
        setImportSessionError('Something went wrong.')
      }
    } finally {
      importActionPending.current = false
      setIsAnalyzingPosting(false)
    }
  }

  async function createCardFromSelectedPosting() {
    if (
      importActionPending.current ||
      review === null ||
      review.sourceRevision !== sourceRevision.current ||
      selectedPosting === null ||
      createdCard !== null
    ) return

    importActionPending.current = true
    setIsCreatingCard(true)
    setImportSessionError(null)

    try {
      const card = await createPostingCard({
        import_key: review.importKey,
        posting: selectedPosting.details,
        posting_alias: null,
        user_notes: null,
        tags: [],
      })

      setCreatedCard(card)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setImportSessionError(caughtError.message)
      } else {
        setImportSessionError('Something went wrong while saving the card.')
      }
    } finally {
      importActionPending.current = false
      setIsCreatingCard(false)
    }
  }

  async function deleteCreatedCard(cardKey: string) {
    const confirmed = window.confirm(
      'Delete this posting card? This cannot be undone.',
    )

    if (!confirmed) {
      return
    }

    setIsDeletingCreatedCard(true)
    setImportSessionError(null)

    try {
      await deletePostingCard(cardKey)
      setCreatedCard(null)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setImportSessionError(caughtError.message)
      } else {
        setImportSessionError('Something went wrong while deleting the card.')
      }
    } finally {
      setIsDeletingCreatedCard(false)
    }
  }

  function syncPostingCardDeletion(cardKey: string) {
    setCreatedCard((currentCard) =>
      currentCard?.card_key === cardKey ? null : currentCard,
    )
  }

  function syncPostingCardUpdate(card: PostingCard) {
    setCreatedCard((currentCard) =>
      currentCard?.card_key === card.card_key ? card : currentCard,
    )
  }

  function syncPostingImportDeletion(deletedImportKey: string) {
    if (review?.importKey === deletedImportKey) clearReview()
  }

  const session: PostingImportSession = {
    postingText,
    isAnalyzingPosting,
    parseResult,
    importSessionError,
    selectedPostingIndex,
    selectedPosting,
    isCreatingCard,
    createdCard,
    isDeletingCreatedCard,
    updatePostingText,
    selectPostingCandidate,
    analyzePostingText,
    createCardFromSelectedPosting,
    deleteCreatedCard,
    syncPostingCardDeletion,
    syncPostingCardUpdate,
    syncPostingImportDeletion,
  }

  return (
    <PostingImportSessionContext.Provider value={session}>
      {children}
    </PostingImportSessionContext.Provider>
  )
}
