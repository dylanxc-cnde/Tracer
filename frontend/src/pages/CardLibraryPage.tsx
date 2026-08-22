import { useState } from 'react'
import { CardLibrary } from '../components/CardLibrary'
import {
  deletePostingCard,
  getPostingCards,
} from '../postings/api/postings'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'
import type { PostingCard } from '../postings/types/postingCard'

export function CardLibraryPage() {
  const { handleCardDeleted } = usePostingImportSession()
  const [cards, setCards] = useState<PostingCard[]>([])
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [deletingCardKey, setDeletingCardKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleLoadCards() {
    setIsLoadingCards(true)
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
      setIsLoadingCards(false)
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
        currentCards.filter((card) => card.card_key !== cardKey),
      )
      handleCardDeleted(cardKey)
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
    <>
      {error && <p role="alert">{error}</p>}

      <button
        type="button"
        onClick={handleLoadCards}
        disabled={isLoadingCards}
      >
        {isLoadingCards ? 'Loading...' : 'Load card library'}
      </button>

      <CardLibrary
        cards={cards}
        deletingCardKey={deletingCardKey}
        onDelete={handleDeleteCard}
      />
    </>
  )
}
