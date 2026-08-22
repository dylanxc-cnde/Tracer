import { PostingCandidateCard } from '../components/PostingCandidateCard'
import { PostingCardSummary } from '../components/PostingCardSummary'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'

export function PostingImportPage() {
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

  return (
    <>
      {error && <p role="alert">{error}</p>}

      <textarea
        placeholder="Paste a job posting here"
        value={postingText}
        onChange={(event) => setPostingText(event.target.value)}
      />

      <p>{postingText.length} characters</p>

      <button
        type="button"
        onClick={analyze}
        disabled={isAnalyzing || postingText.trim().length === 0}
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
      </button>

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
              onSelect={() => selectPosting(index)}
            />
          ))}

          <button
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
          onDelete={deleteCreatedCard}
        />
      )}
    </>
  )
}
