import { useEffect, useRef, useState } from 'react'
import { IconCopy, IconRefresh } from '@tabler/icons-react'
import { CardLibrary } from '../components/card-library/CardLibrary'
import {
  deletePostingCard,
  getPostingCard,
  listPostingCards,
  MissingPostingCardError,
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

type DetailRequest = { cardKey: string; controller?: AbortController }

type CardLibraryPageProps = {
  onPlanFollowUp: (card: PostingCard) => void
  onRecordApplication: (card: PostingCard) => void
}

export function CardLibraryPage({ onPlanFollowUp, onRecordApplication }: CardLibraryPageProps) {
  const { syncPostingCardDeletion, syncPostingCardUpdate } =
    usePostingImportSession()
  const [cards, setCards] = useState<PostingCard[]>([])
  const [isLoadingCards, setIsLoadingCards] = useState(true)
  const [hasLoadedCards, setHasLoadedCards] = useState(false)
  const [deletingCardKeys, setDeletingCardKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const [isShowingOriginal, setIsShowingOriginal] = useState(false)
  const [openingCardKey, setOpeningCardKey] = useState<string | null>(null)
  const initialCardsRequest = useRef<Promise<PostingCard[]> | null>(null)
  const pendingDetail = useRef<DetailRequest | null>(null)
  const pendingRefresh = useRef<Map<string, PostingCard | null> | null>(null)
  const listRegion = useRef<HTMLDivElement>(null)
  const currentOpener = useRef<HTMLButtonElement>(null)

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
      pendingDetail.current?.controller?.abort()
      pendingDetail.current = null
      pendingRefresh.current = null
    }
  }, [])

  async function handleLoadCards() {
    if (pendingRefresh.current) return
    const confirmedCards = new Map<string, PostingCard | null>()
    pendingRefresh.current = confirmedCards
    setIsLoadingCards(true)
    setError(null)

    try {
      const storedCards = await listPostingCards()
      if (pendingRefresh.current !== confirmedCards) return
      setCards(storedCards.flatMap((card) => {
        // A pending list response can predate an accepted detail or mutation.
        const confirmed = confirmedCards.get(card.card_key)
        return confirmed === null ? [] : [confirmed ?? card]
      }))
      setHasLoadedCards(true)
    } catch (caughtError: unknown) {
      if (pendingRefresh.current !== confirmedCards) return
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while loading cards.')
      }
    } finally {
      if (pendingRefresh.current === confirmedCards) {
        pendingRefresh.current = null
        setIsLoadingCards(false)
      }
    }
  }

  function replaceSavedCard(cardKey: string, updatedCard: PostingCard | null) {
    pendingRefresh.current?.set(cardKey, updatedCard)
    setCards((currentCards) => updatedCard === null
      ? currentCards.filter((card) => card.card_key !== cardKey)
      : currentCards.map((card) => card.card_key === cardKey ? updatedCard : card))
  }

  async function handleDeleteCard(cardKey: string) {
    const confirmed = window.confirm(
      'Delete this posting card? This cannot be undone.',
    )

    if (!confirmed) {
      return
    }

    if (pendingDetail.current?.cardKey === cardKey) {
      pendingDetail.current.controller?.abort()
      pendingDetail.current = null
      setOpeningCardKey(null)
    }
    setDeletingCardKeys((currentKeys) => new Set([...currentKeys, cardKey]))
    setError(null)

    try {
      await deletePostingCard(cardKey)
      replaceSavedCard(cardKey, null)
      syncPostingCardDeletion(cardKey)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while deleting the card.')
      }
    } finally {
      setDeletingCardKeys((currentKeys) => {
        const remainingKeys = new Set(currentKeys)
        remainingKeys.delete(cardKey)
        return remainingKeys
      })
    }
  }

  async function handleOpenCard(cardKey: string, opener: HTMLButtonElement) {
    if (pendingDetail.current?.cardKey === cardKey && pendingDetail.current.controller) return
    pendingDetail.current?.controller?.abort()
    const request = { cardKey, controller: new AbortController() }
    pendingDetail.current = request
    setOpeningCardKey(cardKey)
    setError(null)

    try {
      const card = await getPostingCard(cardKey, request.controller.signal)
      if (pendingDetail.current !== request || !opener.isConnected) return
      currentOpener.current = opener
      setIsShowingOriginal(false)
      handleSavedVersion(card)
    } catch (caughtError: unknown) {
      if (pendingDetail.current !== request || !opener.isConnected) return
      if (caughtError instanceof MissingPostingCardError) {
        if (document.activeElement === opener) listRegion.current?.focus({ preventScroll: true })
        replaceSavedCard(cardKey, null)
        syncPostingCardDeletion(cardKey)
        setError(caughtError.message)
      } else {
        setError('Could not open the saved card. Try again.')
      }
    } finally {
      if (pendingDetail.current === request) {
        pendingDetail.current = null
        setOpeningCardKey(null)
      }
    }
  }

  function handleCloseCard() {
    pendingDetail.current?.controller?.abort()
    pendingDetail.current = null
    setOpeningCardKey(null)
    setOpenedCard(null)
    const opener = currentOpener.current
    currentOpener.current = null
    if (opener) {
      const target = opener.isConnected && !opener.disabled ? opener : listRegion.current
      target?.focus({ preventScroll: true })
    }
  }

  async function handleUpdateCard(
    cardKey: string,
    request: UpdatePostingCardRequest,
  ) {
    try {
      const updatedCard = await updatePostingCard(cardKey, request)
      handleSavedVersion(updatedCard)
      return updatedCard
    } catch (caughtError) {
      if (caughtError instanceof MissingPostingCardError) {
        replaceSavedCard(cardKey, null)
        syncPostingCardDeletion(cardKey)
        setError(caughtError.message)
      }
      throw caughtError
    }
  }

  function handleSavedVersion(updatedCard: PostingCard) {
    replaceSavedCard(updatedCard.card_key, updatedCard)
    setOpenedCard(updatedCard)
    syncPostingCardUpdate(updatedCard)
  }

  async function handleShowOriginalCard(cardKey: string) {
    pendingDetail.current?.controller?.abort()
    const request = { cardKey }
    pendingDetail.current = request
    setOpeningCardKey(null)
    setError(null)

    try {
      const originalCard = await getOriginalPostingCard(cardKey)
      if (request !== pendingDetail.current) return
      currentOpener.current = null
      setIsShowingOriginal(true)
      setOpenedCard(originalCard)
    } catch (caughtError: unknown) {
      if (request !== pendingDetail.current) return
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError("Something went wrong while loading the original card.")
      }
    } finally {
      if (request === pendingDetail.current) pendingDetail.current = null
    }
  }

  const hasOpenedSavedCard = openedCard !== null && cards.some((card) => card.card_key === openedCard.card_key)
  let libraryStatus = 'Saved jobs in your workspace'
  if (isLoadingCards) {
    libraryStatus = 'Refreshing…'
  } else if (openingCardKey !== null) {
    libraryStatus = 'Opening saved card…'
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
            ref={listRegion}
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
                deletingCardKeys={deletingCardKeys}
                openingCardKey={openingCardKey}
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
          isOriginalSnapshot={isShowingOriginal}
          onClose={handleCloseCard}
          onUpdate={handleUpdateCard}
          onSavedVersion={handleSavedVersion}
          onPlanFollowUp={hasOpenedSavedCard ? onPlanFollowUp : undefined}
          onRecordApplication={hasOpenedSavedCard ? onRecordApplication : undefined}
        />
      )}
    </>
  )
}
