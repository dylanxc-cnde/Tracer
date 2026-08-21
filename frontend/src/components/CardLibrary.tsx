import type { PostingCard } from "../postings/types/postingCard"
import { PostingCardSummary } from "./PostingCardSummary"

type CardLibraryProps = {
  cards: PostingCard[]
  deletingCardKey: string | null
  onDelete: (cardKey: string) => void
}

export function CardLibrary(
    {cards, deletingCardKey, onDelete,} : CardLibraryProps
) {
    return (
        <article>
            <h2>CardLibrary</h2>
            {cards.map((card) => (
                <PostingCardSummary
                    key={card.card_key}
                    card={card}
                    isDeleting={deletingCardKey === card.card_key}
                    onDelete={onDelete}
                />
            ))}
        </article>
    )



}
