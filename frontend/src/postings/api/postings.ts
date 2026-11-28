import type {
  CreatePostingCardRequest,
  PostingCard,
  PostingSourceCheck,
  PostingSourceObservation,
  PostingWatchChange,
  RecordPostingSourceCheckRequest,
  UpdatePostingCardRequest,
  WatchedPostingCard,
} from '../types/postingCard'
import type {
  PostingImportReceipt,
  PostingImportRequest,
  PostingImportSource,
} from '../types/postingImport'
import type { PostingParseResult } from '../types/postingParse'
import { isPostingCardResponse } from './postingCardResponse'

const API_BASE_URL = 'http://127.0.0.1:8000'

export class MissingPostingImportError extends Error {
    constructor() {
        super('This import is no longer available. Analyze the source again.')
    }
}

export class MissingPostingCardError extends Error {
  constructor() { super('This card is no longer available.') }
}

export class PostingCardUpdateUncertainError extends Error {
  constructor() { super('Save outcome unknown. Read the saved Card before saving again.') }
}

export class PostingSourceCheckUncertainError extends Error {
  constructor() { super('Save outcome unknown. Read source checks before trying again.') }
}

export class PostingSourceCheckUnavailableError extends Error {
  constructor() { super('The submitted link is no longer available.') }
}

export class PostingWatchlistUncertainError extends Error {
  constructor() { super('Change outcome unknown. Check the watchlist before trying again.') }
}

export class PostingWatchlistChangedError extends Error {
  constructor() { super('This saved job was watched again. Check the watchlist to refresh it.') }
}

export async function createPostingImport(
    source: PostingImportSource,
): Promise<PostingImportRequest> {
    const response = await fetch(`${API_BASE_URL}/posting/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(source),
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to create posting import (${response.status}): ${errorBody}`,
        )
    }

    return (await response.json()) as PostingImportRequest
}

export async function listPostingImports(): Promise<PostingImportRequest[]> {
    const response = await fetch(`${API_BASE_URL}/posting/import`,
        {
            method: 'GET',
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to get posting imports (${response.status}): ${errorBody}`,
        )
    }

    return (await response.json()) as PostingImportRequest[]
}

export async function deletePostingImport(
    importKey: string,
): Promise<void> {
    const response = await fetch(
        `${API_BASE_URL}/posting/import/${importKey}`,
        {
            method: 'DELETE',
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to delete posting import (${response.status}): ${errorBody}`,
        )
    }
}

export async function parsePostingImport(
    importKey: string,
): Promise<PostingParseResult> {
    const response = await fetch(`${API_BASE_URL}/posting/import/${importKey}/parse-results`,
        {
            method: 'POST',
        }
    )

    if (response.status === 404) throw new MissingPostingImportError()

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to parse posting import (${response.status}): ${errorBody}`,
        )
    }

    return (await response.json()) as PostingParseResult
}

export async function createPostingCard(
    request: CreatePostingCardRequest,
): Promise<PostingCard> {
    const response = await fetch(`${API_BASE_URL}/posting/card`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to create posting card (${response.status}): ${errorBody}`,
        )
    }
    return (await response.json()) as PostingCard
}

export async function listPostingCards(): Promise<PostingCard[]> {
    const response = await fetch(`${API_BASE_URL}/posting/card`,
        {
            method: 'GET',
        }
    )
    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to get posting cards from library (${response.status}): ${errorBody}`
        )
    }
    return (await response.json()) as PostingCard[]
}

export async function getPostingCard(cardKey: string, signal: AbortSignal): Promise<PostingCard> {
  const response = await fetch(`${API_BASE_URL}/posting/card/${encodeURIComponent(cardKey)}`, { signal, cache: 'no-store' })
  if (response.status === 404) throw new MissingPostingCardError()
  if (!response.ok) throw new Error('Could not load the saved Card.')

  const card: unknown = await response.json()
  if (!isPostingCardResponse(card, cardKey)) throw new Error('The saved Card response could not be read.')
  return card
}

const watchIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isWatchedPostingCard(value: unknown): value is WatchedPostingCard {
  return typeof value === 'object' && value !== null &&
    'card_key' in value && typeof value.card_key === 'string' && value.card_key !== '' &&
    'watch_id' in value && typeof value.watch_id === 'string' && watchIdPattern.test(value.watch_id) &&
    'watched_at' in value && typeof value.watched_at === 'string' &&
    Number.isFinite(Date.parse(value.watched_at)) &&
    (!('last_source_check' in value) || value.last_source_check === null || isPostingSourceObservation(value.last_source_check))
}

export async function getPostingWatchlist(signal: AbortSignal): Promise<WatchedPostingCard[]> {
  const response = await fetch(`${API_BASE_URL}/posting/watchlist`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load watchlist.')

  const watched: unknown = await response.json().catch(() => null)
  if (!Array.isArray(watched) || !watched.every(isWatchedPostingCard)) {
    throw new Error('The watchlist response could not be read.')
  }
  return watched
}

export async function changePostingWatch(change: PostingWatchChange): Promise<WatchedPostingCard | null> {
  const { cardKey, watching } = change
  const condition = change.watching ? '' : `?expected_watch_id=${encodeURIComponent(change.watchId)}`
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/posting/watchlist/${encodeURIComponent(cardKey)}${condition}`, {
      method: watching ? 'PUT' : 'DELETE',
    })
  } catch {
    throw new PostingWatchlistUncertainError()
  }
  if (response.status >= 500) throw new PostingWatchlistUncertainError()
  if (response.status === 404) throw new MissingPostingCardError()
  if (!watching && response.status === 412) throw new PostingWatchlistChangedError()
  if (!response.ok) throw new Error('Could not update watchlist.')

  if (!watching) {
    if (response.status !== 204) throw new PostingWatchlistUncertainError()
    return null
  }
  const saved: unknown = await response.json().catch(() => null)
  if (!isWatchedPostingCard(saved) || saved.card_key !== cardKey) throw new PostingWatchlistUncertainError()
  return saved
}

export async function getPostingCardSourceReceipt(cardKey: string, signal: AbortSignal): Promise<PostingImportReceipt | null> {
  const response = await fetch(`${API_BASE_URL}/posting/card/${encodeURIComponent(cardKey)}/source-receipt`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load the import receipt.')

  const receipt: unknown = await response.json()
  if (receipt === null) return null
  if (typeof receipt !== 'object' ||
    !('kind' in receipt) || (receipt.kind !== 'url' && receipt.kind !== 'text') ||
    !('submitted_at' in receipt) || typeof receipt.submitted_at !== 'string' || !Number.isFinite(Date.parse(receipt.submitted_at)) ||
    !('source_url' in receipt) || (receipt.source_url !== null && typeof receipt.source_url !== 'string') ||
    (receipt.kind === 'url' && !receipt.source_url)) {
    throw new Error('The import receipt response could not be read.')
  }
  return { kind: receipt.kind, submitted_at: receipt.submitted_at, source_url: receipt.source_url }
}

function sourceChecksUrl(cardKey: string) {
  return `${API_BASE_URL}/posting/card/${encodeURIComponent(cardKey)}/source-checks`
}

function isPostingSourceObservation(value: unknown): value is PostingSourceObservation {
  return typeof value === 'object' && value !== null &&
    'recorded_at' in value && typeof value.recorded_at === 'string' && Number.isFinite(Date.parse(value.recorded_at)) &&
    'result' in value && (value.result === 'listed' || value.result === 'not_listed' || value.result === 'unable_to_confirm')
}

function isPostingSourceCheck(value: unknown): value is PostingSourceCheck {
  return isPostingSourceObservation(value) &&
    'check_id' in value && typeof value.check_id === 'string' && value.check_id !== ''
}

export async function getPostingSourceChecks(cardKey: string, signal: AbortSignal): Promise<PostingSourceCheck[]> {
  const response = await fetch(sourceChecksUrl(cardKey), { signal, cache: 'no-store' })
  if (response.status === 404) throw new MissingPostingCardError()
  if (!response.ok) throw new Error('Could not load source checks.')

  const checks: unknown = await response.json().catch(() => null)
  if (!Array.isArray(checks) || !checks.every(isPostingSourceCheck)) throw new Error('The source check history could not be read.')
  return checks
}

export async function recordPostingSourceCheck(
  cardKey: string,
  request: RecordPostingSourceCheckRequest,
): Promise<PostingSourceCheck> {
  let response: Response
  try {
    response = await fetch(sourceChecksUrl(cardKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new PostingSourceCheckUncertainError()
  }
  if (response.status >= 500) throw new PostingSourceCheckUncertainError()
  if (response.status === 404) throw new MissingPostingCardError()
  if (response.status === 409) {
    const error: unknown = await response.json().catch(() => null)
    if (typeof error === 'object' && error !== null && 'detail' in error && error.detail === 'posting.source_check_unavailable') {
      throw new PostingSourceCheckUnavailableError()
    }
    throw new Error('This check conflicts with a recorded source check.')
  }
  if (!response.ok) throw new Error('Could not record the source check.')

  const saved: unknown = await response.json().catch(() => null)
  if (!isPostingSourceCheck(saved) || saved.check_id !== request.check_id || saved.result !== request.result) {
    throw new PostingSourceCheckUncertainError()
  }
  return saved
}

export async function getOriginalPostingCard(
    cardKey: string,
    signal?: AbortSignal,
): Promise<PostingCard> {
    const response = await fetch(
        `${API_BASE_URL}/posting/card/${encodeURIComponent(cardKey)}/original`,
        {
            method: 'GET',
            signal,
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to get original posting card (${response.status}): ${errorBody}`,
        )
    }

    const card: unknown = await response.json()
    if (!isPostingCardResponse(card, cardKey)) throw new Error('The original Card response could not be read.')
    return card
}

export async function deletePostingCard(
    cardKey: string,
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/posting/card/${cardKey}`,
        {
            method: 'DELETE',
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to delete posting card (${response.status}): ${errorBody}`,
        )
    }
}

export async function updatePostingCard(
  cardKey: string,
  request: UpdatePostingCardRequest,
): Promise<PostingCard> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/posting/card/${encodeURIComponent(cardKey)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new PostingCardUpdateUncertainError()
  }
  if (response.status >= 500) throw new PostingCardUpdateUncertainError()

  if (response.status === 422) {
    throw new Error('Some card fields are invalid. Please check or reset your entries.')
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')

    throw new Error(
      `Failed to update posting card (${response.status}): ${errorBody}`,
    )
  }

  const card: unknown = await response.json().catch(() => null)
  if (!isPostingCardResponse(card, cardKey)) throw new PostingCardUpdateUncertainError()
  return card
}
