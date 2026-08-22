import type { PostingCard } from "../postings/types/postingCard";

type PostingCardDetailsProps = {
    card: PostingCard
    onClose: () => void
}

export function PostingCardDetails(
    {card, onClose,} : PostingCardDetailsProps
) {
    return (
        <article>
            <h2>
                {card.posting_alias ??
                    card.posting.identity.position_title?.value ??
                    'Unknown Position'}
            </h2>

            <p>
                {card.posting.identity.company_name?.value ??
                    'Unknown Company'}
            </p>

            <button type="button" onClick={onClose}>
                Close
            </button>
        </article>
    )
}