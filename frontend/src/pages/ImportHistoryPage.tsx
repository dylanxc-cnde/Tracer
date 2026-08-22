import { useState } from 'react'
import { ImportHistory } from '../components/ImportHistory'
import {
  deletePostingImport,
  getPostingImports,
} from '../postings/api/postings'
import type { PostingImportRequest } from '../postings/types/postingImport'

type ImportHistoryPageProps = {
  onImportDeleted: (importKey: string) => void
}

export function ImportHistoryPage({
  onImportDeleted,
}: ImportHistoryPageProps) {
  const [postingImports, setPostingImports] = useState<PostingImportRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [deletingImportKey, setDeletingImportKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleLoadImports() {
    setIsLoading(true)
    setError(null)

    try {
      const storedImports = await getPostingImports()
      setPostingImports(storedImports)
      setHasLoaded(true)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong while loading imports.')
      }
    } finally {
      setIsLoading(false)
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
      onImportDeleted(importKey)
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
        type="button"
        onClick={handleLoadImports}
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Load import history'}
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
