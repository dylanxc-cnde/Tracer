import type { PostingCard } from '../postings/types/postingCard';

type PostingCardDetailsProps = {
    card: PostingCard
    onClose: () => void
}

export function PostingCardDetails(
    {card, onClose,} : PostingCardDetailsProps
) {
    return (
        <article className="posting-card-details">
            <h2 className="posting-card-details__header">
                {card.posting_alias ??
                    card.posting.identity.position_title?.value ??
                    'Unknown Position'}
            </h2>

            <p>
                {card.posting.identity.company_name?.value ??
                    'Unknown Company'}
            </p>

            <button
             className="posting-card-details__close"
             type="button"
             onClick={onClose}
            >
                Close
            </button>
        </article>
    )
}