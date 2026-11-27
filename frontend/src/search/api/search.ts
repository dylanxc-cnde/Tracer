import { getPostingCard, MissingPostingCardError } from '../../postings/api/postings'
import type { SearchRecord, SearchResults, SearchTarget } from '../types/search'

const API_BASE_URL = 'http://127.0.0.1:8000'
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isId = (value: unknown): value is string => isText(value) && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const homeTypes = ['task', 'event', 'application']
function isTarget(value: unknown): boolean {
  return isRecord(value) && ['card', ...homeTypes].includes(String(value.kind)) && isId(value.id)
}
function isResults(value: unknown): boolean {
  return isRecord(value) && typeof value.has_more === 'boolean' && Array.isArray(value.results) && value.results.length <= 50 && value.results.every(result =>
    isRecord(result) && ['job', 'company', 'note', ...homeTypes].includes(String(result.type))
    && isText(result.source) && isText(result.title) && isText(result.snippet)
    && typeof result.card_missing === 'boolean' && isTarget(result.target)
    && isRecord(result.target) && result.target.kind === (homeTypes.includes(String(result.type)) ? result.type : 'card'))
}
function isHomeRecord(value: unknown): boolean {
  return isRecord(value) && homeTypes.includes(String(value.type)) && isId(value.id)
    && isText(value.title) && isText(value.source) && typeof value.card_missing === 'boolean'
    && (value.card_key === null || isId(value.card_key)) && Array.isArray(value.fields)
    && value.fields.every(field => isRecord(field) && isText(field.label) && isText(field.value))
}
async function read<T>(path: string, signal: AbortSignal, validate: (value: unknown) => boolean): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal })
  if (!response.ok) {
    if (response.status === 404) throw new Error('This record is no longer available. Search again to refresh the results.')
    throw new Error('Local search is unavailable. Please try again.')
  }
  const value: unknown = await response.json()
  if (!validate(value)) throw new Error('Search returned unreadable data. Please try again.')
  return value as T
}
export const getSearchResults = (query: string, signal: AbortSignal) => read<SearchResults>(
  `/search?${new URLSearchParams({ q: query, limit: '20' })}`, signal, isResults,
)
export const getSearchRecord = (target: SearchTarget, signal: AbortSignal) => read<SearchRecord>(
  `/search/records/${encodeURIComponent(target.kind)}/${encodeURIComponent(target.id)}`, signal,
  value => isHomeRecord(value) && isRecord(value) && value.id === target.id && value.type === target.kind,
)
export async function getSearchCard(id: string, signal: AbortSignal) {
  try {
    return await getPostingCard(id, signal)
  } catch (error) {
    if (error instanceof MissingPostingCardError) {
      throw new Error('This record is no longer available. Search again to refresh the results.')
    }
    throw error
  }
}
