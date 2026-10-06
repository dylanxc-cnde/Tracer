import { useEffect, useRef, useState } from 'react'
import { IconCopy, IconRefresh } from '@tabler/icons-react'
import { CardLibrary } from '../components/card-library/CardLibrary'
import {
  deletePostingCard,
  listPostingCards,
  updatePostingCard,
  getOriginalPostingCard,
} from '../postings/api/postings'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../postings/types/postingCard'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'
import './CardLibraryPage.css'

export function CardLibraryPage() {
  const { syncPostingCardDeletion, syncPostingCardUpdate } =
    usePostingImportSession()
  const [cards, setCards] = useState<PostingCard[]>([])
  const [isLoadingCards, setIsLoadingCards] = useState(true)
  const [hasLoadedCards, setHasLoadedCards] = useState(false)
  const [deletingCardKey, setDeletingCardKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const [isShowingOriginal, setIsShowingOriginal] = useState(false)
  const initialCardsRequest = useRef<Promise<PostingCard[]> | null>(null)

  useEffect(() => {
    let isActive = true

    // Reuse the initial request when Strict Mode replays this effect in development.
    const request = initialCardsRequest.current ??= listPostingCards()

    async function loadInitialCards() {
      try {
        const storedCards = await request
        if (isActive) {
          setCards(storedCards)
          setHasLoadedCards(true)
        }
      } catch (caughtError: unknown) {
        if (isActive) {
          setError(caughtError instanceof Error
            ? caughtError.message
            : 'Something went wrong while loading cards.')
        }
      } finally {
        if (isActive) {
          setIsLoadingCards(false)
        }
      }
    }

    void loadInitialCards()

    // Ignore a late response after the user has left this page.
    return () => {
      isActive = false
    }
  }, [])

  async function handleLoadCards() {
    setIsLoadingCards(true)
    setError(null)

    try {
      const storedCards = await listPostingCards()
      setCards(storedCards)
      setHasLoadedCards(true)
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
    setIsShowingOriginal(false)
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

  async function handleShowOriginalCard(cardKey: string) {
    setError(null)

    try {
      const originalCard = await getOriginalPostingCard(cardKey)
      setIsShowingOriginal(true)
      setOpenedCard(originalCard)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError("Something went wrong while loading the original card.")
      }
    }
  }

  let libraryStatus = 'Saved jobs in your workspace'
  if (isLoadingCards) {
    libraryStatus = 'Refreshing…'
  } else if (hasLoadedCards) {
    libraryStatus = `${cards.length} saved ${cards.length === 1 ? 'job' : 'jobs'}`
  }

  return (
    <>
      <div className="card-library-page">
        <section className="card-library-page__browser" aria-labelledby="card-library-title">
          <header className="card-library-page__header">
            <div>
              <h1 id="card-library-title" className="page-title">Card library</h1>
              <p className="card-library-page__count" role="status">
                {libraryStatus}
              </p>
            </div>
            <button
              className="card-library-page__refresh"
              type="button"
              onClick={handleLoadCards}
              disabled={isLoadingCards}
              aria-label="Refresh card library"
              title="Refresh card library"
            >
              <IconRefresh aria-hidden="true" focusable="false" />
            </button>
          </header>

          <div
            className="card-library-page__list-region"
            role="region"
            aria-label="Saved jobs"
            tabIndex={-1}
            aria-busy={isLoadingCards}
          >
            {error && <p role="alert">{error}</p>}

            {cards.length === 0 && !isLoadingCards && (
              <div className="card-library-page__empty">
                <IconCopy aria-hidden="true" focusable="false" />
                <h2>{hasLoadedCards ? 'No saved jobs yet' : 'Your saved jobs'}</h2>
                <p>
                  {hasLoadedCards
                    ? 'Jobs you save from an import will appear here.'
                    : 'Use the refresh arrow to load your card library.'}
                </p>
              </div>
            )}
            {cards.length > 0 && (
              <CardLibrary
                cards={cards}
                deletingCardKey={deletingCardKey}
                onDelete={handleDeleteCard}
                onOpen={handleOpenCard}
                onShowOriginal={handleShowOriginalCard}
              />
            )}
          </div>
        </section>
      </div>

      {openedCard !== null && (
        <PostingCardDetails
          card={openedCard}
          isReadOnly={isShowingOriginal}
          onClose={handleCloseCard}
          onUpdate={handleUpdateCard}
        />
      )}
    </>
  )
}
