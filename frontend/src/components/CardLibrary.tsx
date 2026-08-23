import type { PostingCard } from "../postings/types/postingCard"
import { PostingCardSummary } from "./PostingCardSummary"

type CardLibraryProps = {
  cards: PostingCard[]
  deletingCardKey: string | null
  onDelete: (cardKey: string) => void
  onOpen: (card: PostingCard) => void
}

export function CardLibrary(
    {cards, deletingCardKey, onDelete, onOpen,} : CardLibraryProps
) {
    return (
        <article className="card-library">
            <h2 className="card-library__title">CardLibrary</h2>
            {cards.map((card) => (
                <PostingCardSummary
                    key={card.card_key}
                    card={card}
                    isDeleting={deletingCardKey === card.card_key}
                    onDelete={onDelete}
                    onOpen={onOpen}
                />
            ))}
        </article>
    )



}
