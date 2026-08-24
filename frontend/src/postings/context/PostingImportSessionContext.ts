import { createContext } from 'react'
import type { PostingCard } from '../types/postingCard'
import type {
  ParsedPosting,
  PostingParseResult,
} from '../types/postingParse'

export type PostingImportSession = {
  postingText: string
  isAnalyzing: boolean
  parseResult: PostingParseResult | null
  error: string | null
  selectedPostingIndex: number | null
  selectedPosting: ParsedPosting | null
  isSaving: boolean
  createdCard: PostingCard | null
  isDeletingCreatedCard: boolean
  setPostingText: (postingText: string) => void
  selectPosting: (postingIndex: number) => void
  analyze: () => Promise<void>
  confirmSelection: () => Promise<void>
  deleteCreatedCard: (cardKey: string) => Promise<void>
  handleCardDeleted: (cardKey: string) => void
  handleCardUpdated: (card: PostingCard) => void
  handleImportDeleted: (importKey: string) => void
}

export const PostingImportSessionContext =
  createContext<PostingImportSession | null>(null)
