import type { CreatePostingCardRequest, PostingCard } from '../types/postingCard'
import type {
  PostingImportRequest,
  PostingImportSource,
} from '../types/postingImport'
import type { PostingParseResult } from '../types/postingParse'

const API_BASE_URL = 'http://127.0.0.1:8000'

export async function createPostingImport(
    source: PostingImportSource,
): Promise<PostingImportRequest> {
    const response = await fetch(`${API_BASE_URL}/posting-imports`, {
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

export async function parsePostingImport(
    importKey: string,
): Promise<PostingParseResult> {
    const response = await fetch(`${API_BASE_URL}/posting-imports/${importKey}/parse-results`,
        {
            method: 'POST',
        }
    )

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
    const response = await fetch(`${API_BASE_URL}/posting-cards`,
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

export async function getPostingCards(): Promise<PostingCard[]> {
    const response = await fetch(`${API_BASE_URL}/posting-cards`,
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