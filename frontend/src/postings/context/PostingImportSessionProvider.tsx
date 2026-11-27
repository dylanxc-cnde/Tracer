import { useRef, useState, type ReactNode } from 'react'
import {
  MissingPostingImportError,
  createPostingCard,
  createPostingImport,
  deletePostingCard,
  parsePostingImport,
} from '../api/postings'
import type { PostingCard } from '../types/postingCard'
import type { PostingImportSource } from '../types/postingImport'
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

function getImportSource(kind: PostingImportSource['kind'], value: string): PostingImportSource | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (kind === 'text') return { kind, text: value, source_url: null }

  try {
    const { protocol } = new URL(trimmed)
    if (protocol === 'http:' || protocol === 'https:') return { kind, url: trimmed }
  } catch {
    return null
  }
  return null
}

export function PostingImportSessionProvider({
  children,
}: PostingImportSessionProviderProps) {
  const [sourceKind, setSourceKind] = useState<PostingImportSource['kind']>('text')
  const [sourceValues, setSourceValues] = useState({ text: '', url: '' })
  const [isAnalyzingPosting, setIsAnalyzingPosting] = useState(false)
  const [review, setReview] = useState<PostingImportReview | null>(null)
  const [importSessionError, setImportSessionError] = useState<string | null>(null)
  const [selectedPostingIndex, setSelectedPostingIndex] = useState<number | null>(null)
  const [isCreatingCard, setIsCreatingCard] = useState(false)
  const [createdCard, setCreatedCard] = useState<PostingCard | null>(null)
  const [isDeletingCreatedCard, setIsDeletingCreatedCard] = useState(false)
  const sourceRevision = useRef(0)
  const importActionPending = useRef(false)
  const unparsedImportKey = useRef<string | null>(null)

  const sourceValue = sourceValues[sourceKind]
  const importSource = getImportSource(sourceKind, sourceValue)
  const parseResult = review?.result ?? null
  const selectedPosting =
    parseResult !== null && selectedPostingIndex !== null
      ? parseResult.postings[selectedPostingIndex] ?? null
      : null

  function clearReview() {
    setReview(null)
    setSelectedPostingIndex(null)
  }

  function invalidateSourceReview() {
    sourceRevision.current += 1
    unparsedImportKey.current = null
    clearReview()
    setImportSessionError(null)
  }

  function selectPostingSource(kind: PostingImportSource['kind']) {
    if (kind === sourceKind) return
    setSourceKind(kind)
    invalidateSourceReview()
  }

  function updatePostingSource(value: string) {
    if (value === sourceValue) return
    setSourceValues(values => ({ ...values, [sourceKind]: value }))
    invalidateSourceReview()
  }

  function selectPostingCandidate(postingIndex: number) {
    setSelectedPostingIndex(postingIndex)
  }

  async function analyzePosting() {
    if (importActionPending.current || !importSource) return

    const submittedRevision = sourceRevision.current
    importActionPending.current = true
    setIsAnalyzingPosting(true)
    clearReview()
    setImportSessionError(null)
    setCreatedCard(null)

    try {
      let importKey = unparsedImportKey.current
      if (importKey === null) {
        const postingImport = await createPostingImport(importSource)
        if (submittedRevision !== sourceRevision.current) return
        importKey = postingImport.import_key
        // A manual retry can reuse this saved source if parsing fails.
        unparsedImportKey.current = importKey
      }

      const result = await parsePostingImport(importKey)
      if (submittedRevision !== sourceRevision.current) return

      unparsedImportKey.current = null
      setReview({ importKey, result, sourceRevision: submittedRevision })
    } catch (caughtError: unknown) {
      if (submittedRevision !== sourceRevision.current) return
      if (caughtError instanceof MissingPostingImportError) unparsedImportKey.current = null
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
      syncPostingCardDeletion(cardKey)
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
    if (unparsedImportKey.current === deletedImportKey) {
      invalidateSourceReview()
      return
    }
    if (review?.importKey === deletedImportKey) clearReview()
  }

  const session: PostingImportSession = {
    sourceKind,
    sourceValue,
    canAnalyzePosting: importSource !== null,
    isAnalyzingPosting,
    parseResult,
    importSessionError,
    selectedPostingIndex,
    selectedPosting,
    isCreatingCard,
    createdCard,
    isDeletingCreatedCard,
    selectPostingSource,
    updatePostingSource,
    selectPostingCandidate,
    analyzePosting,
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
