import { useState } from 'react'
import { CardLibrary } from '../components/CardLibrary'
import {
  deletePostingCard,
  getPostingCards,
} from '../postings/api/postings'
import type { PostingCard } from '../postings/types/postingCard'

type CardLibraryPageProps = {
  onCardDeleted: (cardKey: string) => void
}

export function CardLibraryPage({
  onCardDeleted,
}: CardLibraryPageProps) {
  const [cards, setCards] = useState<PostingCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deletingCardKey, setDeletingCardKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleLoadCards() {
    setIsLoading(true)
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
      setIsLoading(false)
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
      onCardDeleted(cardKey)
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
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Load card library'}
      </button>

      <CardLibrary
        cards={cards}
        deletingCardKey={deletingCardKey}
        onDelete={handleDeleteCard}
      />
    </>
  )
}
