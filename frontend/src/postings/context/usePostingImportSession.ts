import { useContext } from 'react'
import { PostingImportSessionContext } from './PostingImportSessionContext'

export function usePostingImportSession() {
  const session = useContext(PostingImportSessionContext)

  if (session === null) {
    throw new Error(
      'usePostingImportSession must be used inside PostingImportSessionProvider.',
    )
  }

  return session
}
