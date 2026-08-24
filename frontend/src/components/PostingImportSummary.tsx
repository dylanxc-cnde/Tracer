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
        <article className="posting-import-summary">
            <h3 className="posting-import-summary__title">
                {postingImport.source.kind === 'url'
                    ? 'URL import'
                    : 'Text import'}
            </h3>
            <p className="posting-import-summary__metadata">
                {getSourceSummary(postingImport)}
            </p>
            <p className="posting-import-summary__metadata">
                Imported at: {postingImport.submitted_at}
            </p>
            <p className="posting-import-summary__metadata">
                Import key: {postingImport.import_key}
            </p>
            <button
                className="button--danger posting-import-summary__delete-button"
                type="button"
                onClick={() => onDelete(postingImport.import_key)}
                disabled={isDeleting}
            >
                {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
        </article>
    )
}
