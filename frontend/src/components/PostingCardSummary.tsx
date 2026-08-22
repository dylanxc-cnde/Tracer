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
        <article>
            <h3>{title}</h3>
            <p>{company}</p>
            <p>{location}</p>
            <p>{workMode}</p>
            <p>Saved at: {card.created_at}</p>
            <button
                type="button"
                onClick={() => onDelete(card.card_key)}
                disabled={isDeleting}
            >
                {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
                type="button"
                onClick={() => onOpen(card)}
            >
                View details
            </button>
        </article>
    )
}
