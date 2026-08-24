import { useState } from 'react'
import { ImportHistory } from '../components/import-history/ImportHistory'
import {
  deletePostingImport,
  listPostingImports,
} from '../postings/api/postings'
import { usePostingImportSession } from '../postings/context/usePostingImportSession'
import type { PostingImportRequest } from '../postings/types/postingImport'

export function ImportHistoryPage() {
  const { syncPostingImportDeletion } = usePostingImportSession()
  const [postingImports, setPostingImports] = useState<PostingImportRequest[]>([])
  const [isLoadingImports, setIsLoadingImports] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [deletingImportKey, setDeletingImportKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleLoadImports() {
    setIsLoadingImports(true)
    setError(null)

    try {
      const storedImports = await listPostingImports()
      setPostingImports(storedImports)
      setHasLoaded(true)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while loading imports.')
      }
    } finally {
      setIsLoadingImports(false)
    }
  }

  async function handleDeleteImport(importKey: string) {
    const confirmed = window.confirm(
      'Delete this import history? Saved posting cards will not be deleted.',
    )

    if (!confirmed) {
      return
    }

    setDeletingImportKey(importKey)
    setError(null)

    try {
      await deletePostingImport(importKey)
      setPostingImports((currentImports) =>
        currentImports.filter(
          (postingImport) => postingImport.import_key !== importKey,
        ),
      )
      syncPostingImportDeletion(importKey)
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
    <>
      {error && <p role="alert">{error}</p>}

      <button
        className="button--primary import-history-page__load-button"
        type="button"
        onClick={handleLoadImports}
        disabled={isLoadingImports}
      >
        {isLoadingImports ? 'Loading...' : 'Load import history'}
      </button>

      {hasLoaded && (
        <ImportHistory
          postingImports={postingImports}
          deletingImportKey={deletingImportKey}
          onDelete={handleDeleteImport}
        />
      )}
    </>
  )
}
