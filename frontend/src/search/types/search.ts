export type SearchType = 'job' | 'company' | 'note' | 'task' | 'event' | 'application'
export type SearchTarget = { kind: 'card' | 'task' | 'event' | 'application'; id: string }
export type SearchResult = {
  type: SearchType; source: string; title: string; snippet: string
  target: SearchTarget; card_missing: boolean
}
export type SearchResults = { results: SearchResult[]; has_more: boolean }
export type SearchRecord = {
  type: 'task' | 'event' | 'application'; id: string; title: string; source: string
  fields: { label: string; value: string }[]; card_key: string | null; card_missing: boolean
}
