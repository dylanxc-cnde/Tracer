import type { PostingDetails } from './postingDetails'

export type CreatePostingCardRequest = {
  import_key: string
  posting: PostingDetails
  posting_alias: string | null
  user_notes: string | null
  tags: string[]
}

export type PostingCard = {
  card_key: string
  import_key: string
  schema_version: number
  created_at: string
  posting: PostingDetails
  posting_alias: string | null
  user_notes: string | null
  tags: string[]
}

export type UpdatePostingCardRequest = {
  posting_alias: string | null
  user_notes: string | null
  tags: string[]
}
