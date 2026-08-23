import { useState } from 'react'
import { PostingCandidateCard } from '../components/PostingCandidateCard'
import { PostingCardDetails } from '../components/PostingCardDetails'
import { PostingCardSummary } from '../components/PostingCardSummary'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'
import type { PostingCard } from '../postings/types/postingCard'

export function PostingImportPage() {
  const [selectedCard, setSelectedCard] = useState<PostingCard | null>(null)
  const {
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
    selectPosting,
    analyze,
    confirmSelection,
    deleteCreatedCard,
  } = usePostingImportSession()

  function saveButtonLabel() {
    if (createdCard) return 'Saved'
    if (isSaving) return 'Saving…'
    return 'Confirm and save'
  }

  function handleOpenCard(card: PostingCard) {
    setSelectedCard(card)
  }

  function handleCloseCard() {
    setSelectedCard(null)
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}

      <textarea
        className="posting-import-page__input"
        placeholder="Paste a job posting here"
        value={postingText}
        onChange={(event) => setPostingText(event.target.value)}
      />

      <p className="posting-import-page__character-count">
        {postingText.length} characters
      </p>

      <button
        className="button--primary posting-import-page__analyze-button"
        type="button"
        onClick={analyze}
        disabled={isAnalyzing || postingText.trim().length === 0}
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
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
              onSelect={() => selectPosting(index)}
            />
          ))}

          <button
            className="button--primary posting-import-page__save-button"
            type="button"
            onClick={confirmSelection}
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
          isDeleting={isDeletingCreatedCard}
          onOpen={handleOpenCard}
          onDelete={deleteCreatedCard}
        />
      )}

      {selectedCard && (
        <PostingCardDetails
          card={selectedCard}
          onClose={handleCloseCard}
        />
      )}
    </>
  )
}
