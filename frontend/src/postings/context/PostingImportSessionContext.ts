import { createContext } from 'react'
import type { PostingCard } from '../types/postingCard'
import type { PostingImportSource } from '../types/postingImport'
import type {
  ParsedPosting,
  PostingParseResult,
} from '../types/postingParse'

export type PostingImportSession = {
  sourceKind: PostingImportSource['kind']
  sourceValue: string
  canAnalyzePosting: boolean
  isAnalyzingPosting: boolean
  parseResult: PostingParseResult | null
  importSessionError: string | null
  selectedPostingIndex: number | null
  selectedPosting: ParsedPosting | null
  isCreatingCard: boolean
  createdCard: PostingCard | null
  isDeletingCreatedCard: boolean
  selectPostingSource: (kind: PostingImportSource['kind']) => void
  updatePostingSource: (value: string) => void
  selectPostingCandidate: (postingIndex: number) => void
  analyzePosting: () => Promise<void>
  createCardFromSelectedPosting: () => Promise<void>
  deleteCreatedCard: (cardKey: string) => Promise<void>
  syncPostingCardDeletion: (cardKey: string) => void
  syncPostingCardUpdate: (card: PostingCard) => void
  syncPostingImportDeletion: (importKey: string) => void
}

export const PostingImportSessionContext =
  createContext<PostingImportSession | null>(null)
