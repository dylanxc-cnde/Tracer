import { useState, type ReactNode } from 'react'
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

type PostingImportSessionProviderProps = {
  children: ReactNode
}

export function PostingImportSessionProvider({
  children,
}: PostingImportSessionProviderProps) {
  const [postingText, setPostingText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [parseResult, setParseResult] = useState<PostingParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPostingIndex, setSelectedPostingIndex] = useState<number | null>(null)
  const [importKey, setImportKey] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdCard, setCreatedCard] = useState<PostingCard | null>(null)
  const [isDeletingCreatedCard, setIsDeletingCreatedCard] = useState(false)

  const selectedPosting =
    parseResult !== null && selectedPostingIndex !== null
      ? parseResult.postings[selectedPostingIndex] ?? null
      : null

  async function analyze() {
    setIsAnalyzing(true)
    setParseResult(null)
    setError(null)
    setSelectedPostingIndex(null)
    setImportKey(null)
    setCreatedCard(null)

    try {
      const postingImport = await createPostingImport({
        kind: 'text',
        text: postingText,
        source_url: null,
      })

      const result = await parsePostingImport(postingImport.import_key)
      setImportKey(postingImport.import_key)
      setParseResult(result)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong.')
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function confirmSelection() {
    if (importKey === null || selectedPosting === null) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const card = await createPostingCard({
        import_key: importKey,
        posting: selectedPosting.details,
        posting_alias: null,
        user_notes: null,
        tags: [],
      })

      setCreatedCard(card)
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

  async function deleteCreatedCard(cardKey: string) {
    const confirmed = window.confirm(
      'Delete this posting card? This cannot be undone.',
    )

    if (!confirmed) {
      return
    }

    setIsDeletingCreatedCard(true)
    setError(null)

    try {
      await deletePostingCard(cardKey)
      setCreatedCard(null)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while deleting the card.')
      }
    } finally {
      setIsDeletingCreatedCard(false)
    }
  }

  function handleCardDeleted(cardKey: string) {
    setCreatedCard((currentCard) =>
      currentCard?.card_key === cardKey ? null : currentCard,
    )
  }

  function handleCardUpdated(card: PostingCard) {
    setCreatedCard((currentCard) =>
      currentCard?.card_key === card.card_key ? card : currentCard,
    )
  }

  function handleImportDeleted(deletedImportKey: string) {
    if (importKey === deletedImportKey) {
      setImportKey(null)
      setParseResult(null)
      setSelectedPostingIndex(null)
    }
  }

  const session: PostingImportSession = {
    postingText,
    isAnalyzing,
    parseResult,
    error,
    selectedPostingIndex,
    selectedPosting,
    isSaving,
    createdCard,
    isDeletingCreatedCard,
    setPostingText,
    selectPosting: setSelectedPostingIndex,
    analyze,
    confirmSelection,
    deleteCreatedCard,
    handleCardDeleted,
    handleCardUpdated,
    handleImportDeleted,
  }

  return (
    <PostingImportSessionContext.Provider value={session}>
      {children}
    </PostingImportSessionContext.Provider>
  )
}
