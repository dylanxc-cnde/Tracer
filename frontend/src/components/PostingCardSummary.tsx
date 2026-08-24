import type { PostingCard } from "../postings/types/postingCard"

type PostingCardSummaryProps = {
    card: PostingCard
    isDeleting: boolean
    onDelete: (cardKey: string) => void
    onOpen: (card: PostingCard) => void
}

export function PostingCardSummary(
    {card, isDeleting, onDelete, onOpen,} : PostingCardSummaryProps
) {
    const posting = card.posting
    const title = card.posting_alias ??
        posting.identity.position_title?.value ??
        'Unknown position'

    const company = posting.identity.company_name?.value ??
        'Unknown company'

    const firstLocation = posting.work_conditions.locations[0]
    const location =
        firstLocation?.city ??
        firstLocation?.country ??
        'Unknown location'

    const workMode =
        posting.work_conditions.work_modes?.value.join(', ') ??
        'Unknown workmode'

    return (
        <article className="posting-card-summary">
            <h3 className="posting-card-summary__title">{title}</h3>
            <p className="posting-card-summary__metadata">{company}</p>
            <p className="posting-card-summary__metadata">{location}</p>
            <p className="posting-card-summary__metadata">{workMode}</p>
            <p className="posting-card-summary__metadata">
                Saved at: {card.created_at}
            </p>
            <button
                className="button--danger posting-card-summary__action"
                type="button"
                onClick={() => onDelete(card.card_key)}
                disabled={isDeleting}
            >
                {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
                className="button--primary posting-card-summary__action"
                type="button"
                onClick={() => onOpen(card)}
            >
                View details
            </button>
        </article>
    )
}
