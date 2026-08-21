import type { PostingImportRequest } from "../postings/types/postingImport"
import { PostingImportSummary } from "./PostingImportSummary"

type ImportHistoryProps = {
    postingImports: PostingImportRequest[]
    deletingImportKey: string | null
    onDelete: (importKey: string) => void
}

export function ImportHistory(
    {postingImports, deletingImportKey, onDelete,}: ImportHistoryProps
) {
    return (
        <section>
            <h2>Import history</h2>
            {postingImports.length === 0 && (
                <p>No posting imports found.</p>
            )}
            {postingImports.map((postingImport) => (
                <PostingImportSummary
                    key={postingImport.import_key}
                    postingImport={postingImport}
                    isDeleting={
                        deletingImportKey === postingImport.import_key
                    }
                    onDelete={onDelete}
                />
            ))}
        </section>
    )
}
