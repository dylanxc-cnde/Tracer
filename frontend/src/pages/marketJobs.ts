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

export function savedRoleDomains(card: PostingCard) {
  const domains = new Map<string, string>()
  for (const { value } of card.posting.role_content.domains) {
    const label = value.normalize('NFC')
    // Fold spaces and case for matching while keeping the saved label's spelling.
    const key = label.trim().replace(/\s+/g, ' ').toLowerCase()
    if (key && !domains.has(key)) domains.set(key, label)
  }
  return domains
}
