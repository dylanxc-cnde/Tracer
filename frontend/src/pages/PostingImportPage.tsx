import { useState } from 'react'
import { PostingCandidateCard } from '../components/posting-import/PostingCandidateCard'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'
import { PostingCardSummary } from '../components/posting-card/PostingCardSummary'
import { updatePostingCard } from '../postings/api/postings'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../postings/types/postingCard'

export function PostingImportPage() {
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const {
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
    syncPostingCardUpdate,
  } = usePostingImportSession()

  function getSaveButtonLabel() {
    if (createdCard) return 'Saved'
    if (isCreatingCard) return 'Saving…'
    return 'Confirm and save'
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
    syncPostingCardUpdate(updatedCard)
    setOpenedCard(updatedCard)

    return updatedCard
  }

  return (
    <>
      {importSessionError && <p role="alert">{importSessionError}</p>}

      <textarea
        className="posting-import-page__input"
        placeholder="Paste a job posting here"
        value={postingText}
        onChange={(event) => updatePostingText(event.target.value)}
      />

      <p className="posting-import-page__character-count">
        {postingText.length} characters
      </p>

      <button
        className="button--primary posting-import-page__analyze-button"
        type="button"
        onClick={analyzePostingText}
        disabled={isAnalyzingPosting || postingText.trim().length === 0}
      >
        {isAnalyzingPosting ? 'Analyzing...' : 'Analyze'}
      </button>

      <p className="posting-import-page__parse-status">
        Parse status: {parseResult?.status ?? 'none'} · Candidates:{' '}
        {parseResult?.postings.length ?? 0}
      </p>

      {parseResult && parseResult.postings.length > 0 && (
        <section className="posting-import-page__candidate-list">
          <h2 className="posting-import-page__candidate-title">
            Choose a posting
          </h2>

          {parseResult.postings.map((posting, index) => (
            <PostingCandidateCard
              key={index}
              posting={posting}
              isSelected={selectedPostingIndex === index}
              onSelect={() => selectPostingCandidate(index)}
            />
          ))}

          <button
            className="button--primary posting-import-page__save-button"
            type="button"
            onClick={createCardFromSelectedPosting}
            disabled={
              selectedPosting === null ||
              isCreatingCard ||
              createdCard !== null
            }
          >
            {getSaveButtonLabel()}
          </button>
        </section>
      )}

      {createdCard && (
        <PostingCardSummary
          card={createdCard}
          isDeleting={isDeletingCreatedCard}
          onOpen={handleOpenCard}
          onDelete={deleteCreatedCard}
        />
      )}

      {openedCard && (
        <PostingCardDetails
          card={openedCard}
          onClose={handleCloseCard}
          onUpdate={handleUpdateCard}
        />
      )}
    </>
  )
}
