import { useState } from 'react'
import { CardLibrary } from '../components/card-library/CardLibrary'
import {
  deletePostingCard,
  listPostingCards,
  updatePostingCard,
} from '../postings/api/postings'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../postings/types/postingCard'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'

export function CardLibraryPage() {
  const { syncPostingCardDeletion, syncPostingCardUpdate } =
    usePostingImportSession()
  const [cards, setCards] = useState<PostingCard[]>([])
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [deletingCardKey, setDeletingCardKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)

  async function handleLoadCards() {
    setIsLoadingCards(true)
    setError(null)

    try {
      const storedCards = await listPostingCards()
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
      syncPostingCardDeletion(cardKey)
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

  function handleOpenCard(card: PostingCard) {
    setOpenedCard(card)
  }

  function handleCloseCard() {
    setOpenedCard(null)
  }

  async function handleUpdateCard(
    cardKey: string,
    request: UpdatePostingCardRequest,
  ) {
    const updatedCard = await updatePostingCard(cardKey, request)
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.card_key === updatedCard.card_key ? updatedCard : card,
      ),
    )
    setOpenedCard(updatedCard)
    syncPostingCardUpdate(updatedCard)

    return updatedCard
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}

      <button
        className="button--primary card-library-page__load-button"
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
        onOpen={handleOpenCard}
      />

      {openedCard !== null && (
        <PostingCardDetails
          card={openedCard}
          onClose={handleCloseCard}
          onUpdate={handleUpdateCard}
        />
      )}
    </>
  )
}
