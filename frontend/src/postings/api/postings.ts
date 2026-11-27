import type {
  CreatePostingCardRequest,
  PostingCard,
  UpdatePostingCardRequest,
} from '../types/postingCard'
import type {
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

export async function getOriginalPostingCard(
    cardKey: string,
): Promise<PostingCard> {
    const response = await fetch(
        `${API_BASE_URL}/posting/card/${cardKey}/original`,
        {
            method: 'GET',
        }
    )

    if (!response.ok) {
        const errorBody = await response.text()

        throw new Error(
            `Failed to get original posting card (${response.status}): ${errorBody}`,
        )
    }

    return (await response.json()) as PostingCard
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
