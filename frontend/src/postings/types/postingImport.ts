export type UrlImport = {
    kind: 'url'
    url: string
}

export type TextImport = {
    kind: 'text'
    text: string
    source_url: string | null
}

export type PostingImportSource = UrlImport | TextImport

export type PostingImportRequest = {
    import_key: string
    schema_version: number
    submitted_at: string
    source: PostingImportSource
}
