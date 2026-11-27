import type { PostingCard } from '../postings/types/postingCard'

export type MarketJobRead =
  | { status: 'loading'; cardKey: string }
  | { status: 'failed'; cardKey: string; message: string }

export function savedJobTitle(card: PostingCard) {
  return card.posting_alias ?? card.posting.identity.position_title?.value ?? 'Unknown position'
}

export function savedJobCompany(card: PostingCard) {
  return card.posting.identity.company_name?.value ?? 'Unknown company'
}
