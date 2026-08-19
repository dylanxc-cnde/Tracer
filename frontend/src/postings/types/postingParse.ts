import type { PostingDetails, SourceExcerpt } from './postingDetails'

export type PostingParseStatus =
    | 'complete'
    | 'refinement_required'
    | 'not_found'

export type PostingRefinementReason =
    | 'too_many_postings'
    | 'ambiguous_target'
    | 'insufficient_detail'

export type PostingParseAmbiguity = {
    field_path: string
    description: string
    alternatives: string[]
    sources: SourceExcerpt[]
}

export type ParsedPosting = {
    details: PostingDetails
    parse_ambiguities: PostingParseAmbiguity[]
}

export type PostingParseResult = {
    status: PostingParseStatus
    postings: ParsedPosting[]
    refinement_reason: PostingRefinementReason | null
    refinement_suggestions: string[]
}
