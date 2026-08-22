import { useEffect, useRef } from 'react'

import type { PostingCard } from '../postings/types/postingCard';

type PostingCardDetailsProps = {
    card: PostingCard
    onClose: () => void
}

export function PostingCardDetails(
    {card, onClose,} : PostingCardDetailsProps
) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog !== null && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="posting-card-details"
      onClose={onClose}
    >
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
        onClick={() => dialogRef.current?.close()}
      >
        Close
      </button>
    </dialog>
  )
}