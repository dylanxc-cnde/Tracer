import { useState } from 'react'
import './App.css'
import { createPostingImport, parsePostingImport, createPostingCard, getPostingCards, deletePostingCard } from './postings/api/postings'
import type { PostingParseResult } from './postings/types/postingParse'
import { PostingCandidateCard } from './components/PostingCandidateCard'
import type { PostingCard } from './postings/types/postingCard'
import { PostingCardSummary } from './components/PostingCardSummary'
import { CardLibrary } from './components/CardLibrary'


function App() {
  const [postingText, setPostingText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [parseResult, setParseResult] = useState<PostingParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPostingIndex, setSelectedPostingIndex] = useState<number | null>(null)
  const [importKey, setImportKey] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdCard, setCreatedCard] = useState<PostingCard | null>(null)
  const [cards, setCards] = useState<PostingCard[]>([])
  const [isCardsLoading, setIsCardsLoading] = useState(false)
  const [deletingCardKey, setDeletingCardKey] = useState<string | null>(null)

  async function handleAnalyze() {
    setIsLoading(true)
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
      setIsLoading(false)
    }
  }

  const selectedPosting =
    parseResult !== null && selectedPostingIndex !== null
      ? parseResult.postings[selectedPostingIndex] ?? null
      : null

  async function handleConfirm() {
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

  function saveButtonLabel() {
    if (createdCard) return 'Saved'
    if (isSaving) return 'Saving…'
    return 'Confirm and save'
  }

  async function handleLoadCards() {
    setIsCardsLoading(true)
    setError(null)

    try {
      const storedCards = await getPostingCards()
      setCards(storedCards)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while loading cards.')
      }
    } finally {
      setIsCardsLoading(false)
    }

  }

  async function handleDeleteCard(cardKey: string) {
    const confirmed = window.confirm(
      'Delete this posting card? This cannot be undone.',
    )

    if (!confirmed) {
      return
    }

    setDeletingCardKey(cardKey)
    setError(null)

    try {
      await deletePostingCard(cardKey)
      setCards((currentCards) =>
        currentCards.filter((card) => card.card_key !== cardKey)
      )
      setCreatedCard((currentCard) =>
        currentCard?.card_key === cardKey ? null : currentCard
      )
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while deleting the card.')
      }
    } finally {
      setDeletingCardKey(null)
    }
  }

  return (
    <main>
      <h1>Tracer</h1>
      <p>Review job postings before saving them.</p>

      <textarea
        placeholder="Paste a job posting here"
        value={postingText}
        onChange={(event) => setPostingText(event.target.value)}
      />

      <p>{postingText.length} characters</p>

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isLoading || postingText.trim().length === 0}
      >
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>

      {error && <p role="alert">{error}</p>}

      <p>
        Parse status: {parseResult?.status ?? 'none'} · Candidates:{' '}
        {parseResult?.postings.length ?? 0}
      </p>

      {parseResult && parseResult.postings.length > 0 && (
        <section>
          <h2>Choose a posting</h2>

          {parseResult.postings.map((posting, index) => (
            <PostingCandidateCard
              key={index}
              posting={posting}
              isSelected={selectedPostingIndex === index}
              onSelect={() => setSelectedPostingIndex(index)}
            />
          ))}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={
              selectedPosting === null ||
              isSaving ||
              createdCard !== null
            }
          >
            {saveButtonLabel()}
          </button>
        </section>
      )}

      {createdCard && (
        <PostingCardSummary
          card={createdCard}
          isDeleting={deletingCardKey === createdCard.card_key}
          onDelete={handleDeleteCard}
        />
      )}

      <button
        type='button'
        onClick={handleLoadCards}
        disabled={isCardsLoading}
      >
        {isCardsLoading? 'Loading...' : 'Load card library'}
      </button>

      <CardLibrary
        cards={cards}
        deletingCardKey={deletingCardKey}
        onDelete={handleDeleteCard}
      />

    </main>
  )
}

export default App
