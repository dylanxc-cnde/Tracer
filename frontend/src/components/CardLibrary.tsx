import type { PostingCard } from "../postings/types/postingCard"
import { PostingCardSummary } from "./PostingCardSummary"

type CardLibraryProps = {
  cards: PostingCard[]
}

export function CardLibrary(
    {cards,} : CardLibraryProps
) {
    return (
        <article>
            <h2>CardLibrary</h2>
            {cards.map((card) => (
                <PostingCardSummary
                key={card.card_key}
                card={card}
                />
            ))}
        </article>
    )



}