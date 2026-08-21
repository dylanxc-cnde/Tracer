import type { PostingImportRequest } from "../postings/types/postingImport"

type PostingImportSummaryProps = {
    postingImport: PostingImportRequest
    isDeleting: boolean
    onDelete: (importKey: string) => void
}

function getSourceSummary(postingImport: PostingImportRequest): string {
    if (postingImport.source.kind === 'url') {
        return postingImport.source.url
    }

    const text = postingImport.source.text
        .replace(/\s+/g, ' ')
        .trim()

    if (text.length <= 120) {
        return text
    }

    return `${text.slice(0, 120)}…`
}

export function PostingImportSummary(
    {postingImport, isDeleting, onDelete,}: PostingImportSummaryProps
) {
    return (
        <article>
            <h3>
                {postingImport.source.kind === 'url'
                    ? 'URL import'
                    : 'Text import'}
            </h3>
            <p>{getSourceSummary(postingImport)}</p>
            <p>Imported at: {postingImport.submitted_at}</p>
            <p>Import key: {postingImport.import_key}</p>
            <button
                type="button"
                onClick={() => onDelete(postingImport.import_key)}
                disabled={isDeleting}
            >
                {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
        </article>
    )
}
