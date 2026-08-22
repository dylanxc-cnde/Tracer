import { useState } from 'react'
import './App.css'
import {
  createPostingImport,
  parsePostingImport,
  createPostingCard,
  deletePostingCard,
  getPostingImports,
  deletePostingImport,
} from './postings/api/postings'
import type { PostingParseResult } from './postings/types/postingParse'
import { PostingCandidateCard } from './components/PostingCandidateCard'
import type { PostingCard } from './postings/types/postingCard'
import type { PostingImportRequest } from './postings/types/postingImport'
import { PostingCardSummary } from './components/PostingCardSummary'
import { ImportHistory } from './components/ImportHistory'
import { CardLibraryPage } from './pages/CardLibraryPage'

type AppPage =
  | 'posting-import'
  | 'card-library'
  | 'import-history'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('posting-import')
  const [postingText, setPostingText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [parseResult, setParseResult] = useState<PostingParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPostingIndex, setSelectedPostingIndex] = useState<number | null>(null)
  const [importKey, setImportKey] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdCard, setCreatedCard] = useState<PostingCard | null>(null)
  const [isDeletingCreatedCard, setIsDeletingCreatedCard] = useState(false)
  const [postingImports, setPostingImports] = useState<PostingImportRequest[]>([])
  const [isImportsLoading, setIsImportsLoading] = useState(false)
  const [hasLoadedImports, setHasLoadedImports] = useState(false)
  const [deletingImportKey, setDeletingImportKey] = useState<string | null>(null)

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

  async function handleDeleteCreatedCard(cardKey: string) {
    const confirmed = window.confirm(
      'Delete this posting card? This cannot be undone.',
    )

    if (!confirmed) {
      return
    }

    setIsDeletingCreatedCard(true)
    setError(null)

    try {
      await deletePostingCard(cardKey)
      setCreatedCard(null)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while deleting the card.')
      }
    } finally {
      setIsDeletingCreatedCard(false)
    }
  }

  function handleLibraryCardDeleted(cardKey: string) {
    setCreatedCard((currentCard) =>
      currentCard?.card_key === cardKey ? null : currentCard,
    )
  }

  async function handleLoadImports() {
    setIsImportsLoading(true)
    setError(null)

    try {
      const storedImports = await getPostingImports()
      setPostingImports(storedImports)
      setHasLoadedImports(true)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while loading imports.')
      }
    } finally {
      setIsImportsLoading(false)
    }
  }

  async function handleDeleteImport(importKeyToDelete: string) {
    const confirmed = window.confirm(
      'Delete this import history? Saved posting cards will not be deleted.',
    )

    if (!confirmed) {
      return
    }

    setDeletingImportKey(importKeyToDelete)
    setError(null)

    try {
      await deletePostingImport(importKeyToDelete)
      setPostingImports((currentImports) =>
        currentImports.filter(
          (postingImport) =>
            postingImport.import_key !== importKeyToDelete
        )
      )

      if (importKey === importKeyToDelete) {
        setImportKey(null)
        setParseResult(null)
        setSelectedPostingIndex(null)
      }
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while deleting the import.')
      }
    } finally {
      setDeletingImportKey(null)
    }
  }

  return (
    <main>
      <h1>Tracer</h1>
      <p>Review job postings before saving them.</p>

      <nav aria-label="Main navigation">
        <button
          type="button"
          onClick={() => setCurrentPage('posting-import')}
          disabled={currentPage === 'posting-import'}
        >
          Import posting
        </button>

        <button
          type="button"
          onClick={() => setCurrentPage('card-library')}
          disabled={currentPage === 'card-library'}
        >
          Card library
        </button>

        <button
          type="button"
          onClick={() => setCurrentPage('import-history')}
          disabled={currentPage === 'import-history'}
        >
          Import history
        </button>
      </nav>

      <p>Current page: {currentPage}</p>

      {error && <p role="alert">{error}</p>}

      {currentPage === 'posting-import' && (
        <>
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
              isDeleting={isDeletingCreatedCard}
              onDelete={handleDeleteCreatedCard}
            />
          )}
        </>
      )}

      {currentPage === 'card-library' && (
        <CardLibraryPage onCardDeleted={handleLibraryCardDeleted} />
      )}

      {currentPage === 'import-history' && (
        <>
          <button
            type="button"
            onClick={handleLoadImports}
            disabled={isImportsLoading}
          >
            {isImportsLoading ? 'Loading...' : 'Load import history'}
          </button>

          {hasLoadedImports && (
            <ImportHistory
              postingImports={postingImports}
              deletingImportKey={deletingImportKey}
              onDelete={handleDeleteImport}
            />
          )}
        </>
      )}
    </main>
  )
}

export default App
