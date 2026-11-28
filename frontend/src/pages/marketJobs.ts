import { visiblePostingText } from '../components/posting-card/details/PostingCardFormatters'
import type { PostingCard } from '../postings/types/postingCard'

export type MarketJobRead =
  | { status: 'loading'; cardKey: string }
  | { status: 'failed'; cardKey: string; message: string }

export function savedJobTitle(card: PostingCard) {
  return visiblePostingText(card.posting_alias) ?? card.posting.identity.position_title?.value ?? 'Unknown position'
}

export function savedJobCompany(card: PostingCard) {
  return card.posting.identity.company_name?.value ?? 'Unknown company'
}

export function savedJobDistinctions(cards: PostingCard[]) {
  const jobCounts = new Map<string, number>()
  const addressCounts = new Map<string, number>()
  const entries = cards.map((card) => {
    const title = savedJobTitle(card)
    const company = savedJobCompany(card)
    const address = visiblePostingText(card.posting.work_conditions.primary_address?.value)
    const jobKey = JSON.stringify([title, company])
    const addressKey = JSON.stringify([title, company, address])
    jobCounts.set(jobKey, (jobCounts.get(jobKey) ?? 0) + 1)
    if (address) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1)
    return { card, address, jobKey, addressKey }
  })

  const distinctions = new Map<string, string>()
  for (const { card, address, jobKey, addressKey } of entries) {
    if (jobCounts.get(jobKey) === 1) continue
    const jobId = visiblePostingText(card.posting.identity.external_job_id?.value)
    const needsJobId = !address || (addressCounts.get(addressKey) ?? 0) > 1
    const jobIdLabel = needsJobId && jobId ? `Job ID: ${jobId}` : null
    const distinction = [address, jobIdLabel].filter(Boolean).join(' · ') || 'No distinguishing details recorded'
    distinctions.set(card.card_key, distinction)
  }
  return distinctions
}

export type SavedCardRoleDomains = { card: PostingCard; domains: Map<string, string> }

export function savedCardsWithRoleDomains(cards: PostingCard[]): SavedCardRoleDomains[] {
  const cardNames = cards.map((card) => ({
    card,
    names: card.posting.role_content.domains.flatMap(({ value: label }) => {
      const text = label.replace(/[\u200B\u00AD]/g, '').normalize('NFC').trim().replace(/\s+/g, ' ')
      if (!text) return []

      const legacyUppercase = text.includes('SS') && !text.includes('ẞ') && text === text.toUpperCase()
      return [{ label, key: text.toLowerCase(), legacyUppercase }]
    }),
  }))

  // An all-caps SS may represent either spelling. Resolve it only when the saved Cards agree.
  const explicitSpellings = new Map<string, Set<string>>()
  for (const { names } of cardNames) {
    for (const { key, legacyUppercase } of names) {
      if (legacyUppercase) continue
      const folded = key.replaceAll('ß', 'ss')
      const candidates = explicitSpellings.get(folded) ?? new Set<string>()
      candidates.add(key)
      explicitSpellings.set(folded, candidates)
    }
  }

  return cardNames.map(({ card, names }) => {
    const domains = new Map<string, string>()
    for (const { label, key, legacyUppercase } of names) {
      const candidates = legacyUppercase ? explicitSpellings.get(key) : undefined
      const match = candidates?.values().next().value
      const group = candidates && candidates.size > 1 ? `legacy:${key}` : `domain:${match ?? key}`
      if (!domains.has(group)) domains.set(group, label.normalize('NFC'))
    }
    return { card, domains }
  })
}
