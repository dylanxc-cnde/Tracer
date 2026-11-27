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
import type { PostingParseResult, PostingRefinementReason } from '../postings/types/postingParse'

const refinementMessages: Record<PostingRefinementReason, string> = {
  too_many_postings: 'Several postings were found. Choose one to review, or narrow the source and analyze again.',
  ambiguous_target: 'Add the job title or other identifying details to the source and analyze again.',
  insufficient_detail: 'The source only includes part of the posting. Add more of the posting and analyze again.',
}

function getParseFeedback(result: PostingParseResult) {
  if (result.status === 'complete') return 'Review the proposed posting before saving.'
  if (result.status === 'not_found') return 'No job posting found. Try a direct posting link or paste the full text, then analyze again.'
  return (result.refinement_reason && refinementMessages[result.refinement_reason])
    || 'Add more detail to the source and analyze again.'
}

export function PostingImportPage() {
  const [openedCard, setOpenedCard] = useState<PostingCard | null>(null)
  const {
    sourceKind,
    sourceValue,
    canAnalyzePosting,
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
    syncPostingCardUpdate,
  } = usePostingImportSession()
  const invalidLink = sourceKind === 'url' && sourceValue.trim() !== '' && !canAnalyzePosting
  const suggestions = parseResult?.status === 'refinement_required'
    ? (parseResult.refinement_suggestions ?? [])
    : []

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
    handleSavedVersion(updatedCard)
    return updatedCard
  }

  function handleSavedVersion(updatedCard: PostingCard) {
    syncPostingCardUpdate(updatedCard)
    setOpenedCard(updatedCard)
  }

  return (
    <>
      <h1 className="page-title">Import posting</h1>

      {importSessionError && <p role="alert">{importSessionError}</p>}

      <fieldset className="posting-import-page__source-options">
        <legend>Posting source</legend>
        <label><input type="radio" name="posting-source" checked={sourceKind === 'text'} onChange={() => selectPostingSource('text')} /> Text</label>
        <label><input type="radio" name="posting-source" checked={sourceKind === 'url'} onChange={() => selectPostingSource('url')} /> Link</label>
      </fieldset>

      {sourceKind === 'text' ? <>
        <textarea
          className="posting-import-page__input"
          aria-label="Posting text"
          placeholder="Paste a job posting here"
          value={sourceValue}
          onChange={(event) => updatePostingSource(event.target.value)}
        />
        <p className="posting-import-page__character-count">{sourceValue.length} characters</p>
      </> : <div className="posting-import-page__link">
        <label htmlFor="posting-import-link">Posting link</label>
        <input
          id="posting-import-link"
          type="url"
          placeholder="Paste a job posting link"
          value={sourceValue}
          aria-invalid={invalidLink || undefined}
          aria-describedby={invalidLink ? 'posting-import-link-error' : undefined}
          onChange={(event) => updatePostingSource(event.target.value)}
        />
        {invalidLink && <p id="posting-import-link-error">Enter an HTTP or HTTPS job posting link.</p>}
      </div>}

      <button
        className="button--primary posting-import-page__analyze-button"
        type="button"
        onClick={analyzePosting}
        disabled={isAnalyzingPosting || isCreatingCard || !canAnalyzePosting}
      >
        {isAnalyzingPosting ? 'Analyzing...' : 'Analyze'}
      </button>

      <div role="status">
        {parseResult && <div className="posting-import-page__parse-status">
          <p>{getParseFeedback(parseResult)}</p>
          {suggestions.length > 0 && (
            <ul>{suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
          )}
        </div>}
      </div>

      {parseResult && parseResult.postings.length > 0 && (
        <section className="posting-import-page__candidate-list">
          <h2 className="page-section-title">
            Choose a posting
          </h2>

          {parseResult.postings.map((posting, index) => (
            <PostingCandidateCard
              key={index}
              posting={posting}
              isSelected={selectedPostingIndex === index}
              isSelectionDisabled={isCreatingCard || createdCard !== null}
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
          onSavedVersion={handleSavedVersion}
        />
      )}
    </>
  )
}
