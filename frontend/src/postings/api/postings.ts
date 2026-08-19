import type {
  PostingImportRequest,
  PostingImportSource,
} from '../types/postingImport'

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